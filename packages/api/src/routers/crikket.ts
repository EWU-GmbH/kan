import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as cardRepo from "@kan/db/repository/card.repo";
import { createLogger } from "@kan/logger";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  getCrikketFeatureRequestByKanCard,
  isCrikketIntegrationEnabled,
  sendCrikketFeatureRequestReporterFollowUp,
} from "../utils/crikket-client";
import { assertPermission } from "../utils/permissions";

const log = createLogger("crikket");

const cardPublicIdSchema = z.string().trim().min(12).max(12);

const followUpMessageSchema = z
  .string()
  .trim()
  .min(1, "Nachricht darf nicht leer sein")
  .max(4000);

async function assertCrikketCardAccess(
  db: dbClient,
  userId: string,
  cardPublicId: string,
  requiredPermission: "card:view" | "card:edit",
) {
  const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
    db,
    cardPublicId,
  );

  if (!card) {
    throw new TRPCError({
      message: `Card with public ID ${cardPublicId} not found`,
      code: "NOT_FOUND",
    });
  }

  // Always enforce workspace access even for "public" boards so Crikket
  // reporter emails stay restricted to authorized members.
  // Note: After upgrading to v0.7.0 (board_members), also call assertBoardAccess here.
  await assertPermission(db, userId, card.workspaceId, "card:view");

  if (requiredPermission === "card:edit") {
    await assertPermission(db, userId, card.workspaceId, "card:edit");
  }

  return card;
}

export const crikketRouter = createTRPCRouter({
  getFeatureRequestByCard: protectedProcedure
    .meta({
      openapi: {
        enabled: false,
        method: "GET",
        path: "/crikket/feature-request",
      },
    })
    .input(z.object({ cardPublicId: cardPublicIdSchema }))
    .output(
      z.discriminatedUnion("linked", [
        z.object({ linked: z.literal(false) }),
        z.object({
          linked: z.literal(true),
          featureRequestId: z.string(),
          title: z.string(),
          hasReporterEmail: z.boolean(),
          reporterEmail: z.string().nullable(),
          status: z.string(),
        }),
      ]),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      await assertCrikketCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "card:view",
      );

      if (!isCrikketIntegrationEnabled()) {
        return { linked: false as const };
      }

      try {
        const featureRequest = await getCrikketFeatureRequestByKanCard(
          input.cardPublicId,
        );

        if (!featureRequest) {
          return { linked: false as const };
        }

        return {
          linked: true as const,
          featureRequestId: featureRequest.featureRequestId,
          title: featureRequest.title,
          hasReporterEmail: featureRequest.hasReporterEmail,
          reporterEmail: featureRequest.reporterEmail,
          status: featureRequest.status,
        };
      } catch (error) {
        log.error(
          { err: error, cardPublicId: input.cardPublicId },
          "Crikket feature request lookup failed",
        );
        throw new TRPCError({
          message:
            "Crikket-Anfrage fehlgeschlagen. Bitte später erneut versuchen.",
          code: "BAD_GATEWAY",
        });
      }
    }),

  sendReporterFollowUp: protectedProcedure
    .meta({
      openapi: {
        enabled: false,
        method: "POST",
        path: "/crikket/reporter-follow-up",
      },
    })
    .input(
      z.object({
        cardPublicId: cardPublicIdSchema,
        message: followUpMessageSchema,
      }),
    )
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      await assertCrikketCardAccess(
        ctx.db,
        userId,
        input.cardPublicId,
        "card:edit",
      );

      if (!isCrikketIntegrationEnabled()) {
        throw new TRPCError({
          message: "Crikket-Integration ist nicht konfiguriert.",
          code: "PRECONDITION_FAILED",
        });
      }

      try {
        await sendCrikketFeatureRequestReporterFollowUp({
          cardPublicId: input.cardPublicId,
          message: input.message,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Rückfrage konnte nicht gesendet werden.";

        throw new TRPCError({
          message,
          code: "BAD_REQUEST",
        });
      }

      return { success: true as const };
    }),
});
