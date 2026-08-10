import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  getCrikketFeatureRequestByKanCard,
  isCrikketIntegrationEnabled,
  sendCrikketFeatureRequestReporterFollowUp,
} from "../utils/crikket-client";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const cardPublicIdSchema = z.string().trim().min(12).max(12)

const followUpMessageSchema = z
  .string()
  .trim()
  .min(1, "Nachricht darf nicht leer sein")
  .max(4000)

export const crikketRouter = createTRPCRouter({
  getFeatureRequestByCard: protectedProcedure
    .meta({
      openapi: { enabled: false, method: "GET", path: "/crikket/feature-request" },
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
      if (!ctx.user) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        })
      }

      if (!isCrikketIntegrationEnabled()) {
        return { linked: false as const }
      }

      try {
        const featureRequest = await getCrikketFeatureRequestByKanCard(
          input.cardPublicId,
        )

        if (!featureRequest) {
          return { linked: false as const }
        }

        return {
          linked: true as const,
          featureRequestId: featureRequest.featureRequestId,
          title: featureRequest.title,
          hasReporterEmail: featureRequest.hasReporterEmail,
          reporterEmail: featureRequest.reporterEmail,
          status: featureRequest.status,
        }
      } catch (error) {
        console.error("[crikket] feature request lookup failed", error)
        throw new TRPCError({
          message: "Crikket-Anfrage fehlgeschlagen. Bitte später erneut versuchen.",
          code: "BAD_GATEWAY",
        })
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
      if (!ctx.user) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        })
      }

      if (!isCrikketIntegrationEnabled()) {
        throw new TRPCError({
          message: "Crikket-Integration ist nicht konfiguriert.",
          code: "PRECONDITION_FAILED",
        })
      }

      try {
        await sendCrikketFeatureRequestReporterFollowUp({
          cardPublicId: input.cardPublicId,
          message: input.message,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Rückfrage konnte nicht gesendet werden."

        throw new TRPCError({
          message,
          code: "BAD_REQUEST",
        })
      }

      return { success: true as const }
    }),
})
