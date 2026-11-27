import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as boardRepo from "@kan/db/repository/board.repo";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as schema from "@kan/db/schema";

import type { TestDbClient } from "./test-db";
import { appRouter } from "../src/root";
import { createTestDb, seedTestData } from "./test-db";

vi.mock("../src/utils/encryption", () => ({
  encryptToken: vi.fn((token: string) => token),
  decryptToken: vi.fn((token: string) => token),
}));

describe("crikket router authorization integration tests", () => {
  const originalBaseUrl = process.env.CRIKKET_BASE_URL;
  const originalApiKey = process.env.CRIKKET_API_KEY;
  const originalFetch = globalThis.fetch;

  let db: TestDbClient;
  let adminUser: { id: string; name: string | null; email: string };
  let workspace: { id: number; publicId: string };
  let privateCardPublicId: string;
  let publicBoardCardPublicId: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  async function createUser(suffix: string) {
    const [user] = await db
      .insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        name: `User ${suffix}`,
        email: `${suffix}@example.test`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create test user");
    }

    return user;
  }

  async function addWorkspaceMember(
    role: "admin" | "member" | "guest",
    publicId: string,
  ) {
    const user = await createUser(publicId);
    const [member] = await db
      .insert(schema.workspaceMembers)
      .values({
        publicId,
        email: user.email,
        workspaceId: workspace.id,
        userId: user.id,
        createdBy: adminUser.id,
        role,
        status: "active",
        createdAt: new Date(),
      })
      .returning();

    if (!member) {
      throw new Error("Failed to create workspace member");
    }

    return { user, member };
  }

  function createCaller(user: {
    id: string;
    name: string | null;
    email: string;
  }) {
    return appRouter.createCaller({
      user: user as never,
      db,
      auth: {} as never,
      headers: new Headers(),
      transport: "trpc",
      requestId: crypto.randomUUID(),
    });
  }

  beforeEach(async () => {
    db = await createTestDb();
    const seeded = await seedTestData(db);
    adminUser = seeded.user;
    workspace = seeded.workspace;

    const privateBoard = await boardRepo.create(db, {
      name: "Private Support Board",
      createdBy: adminUser.id,
      workspaceId: workspace.id,
      slug: "private-support-board",
    });
    if (!privateBoard) throw new Error("Failed to create private board");

    const privateList = await listRepo.create(db, {
      name: "Inbox",
      boardId: privateBoard.id,
      createdBy: adminUser.id,
    });
    if (!privateList) throw new Error("Failed to create private list");

    const privateCard = await cardRepo.create(db, {
      title: "Linked Bug",
      description: "Details",
      createdBy: adminUser.id,
      listId: privateList.id,
      workspaceId: workspace.id,
      position: "end",
    });
    privateCardPublicId = privateCard.publicId;

    const publicBoard = await boardRepo.create(db, {
      name: "Public Roadmap",
      createdBy: adminUser.id,
      workspaceId: workspace.id,
      slug: "public-roadmap",
    });
    if (!publicBoard) throw new Error("Failed to create public board");

    await boardRepo.update(db, {
      name: undefined,
      slug: undefined,
      boardPublicId: publicBoard.publicId,
      visibility: "public",
    });

    const publicList = await listRepo.create(db, {
      name: "Requests",
      boardId: publicBoard.id,
      createdBy: adminUser.id,
    });
    if (!publicList) throw new Error("Failed to create public list");

    const publicCard = await cardRepo.create(db, {
      title: "Public Feature Request",
      description: "Details",
      createdBy: adminUser.id,
      listId: publicList.id,
      workspaceId: workspace.id,
      position: "end",
    });
    publicBoardCardPublicId = publicCard.publicId;

    process.env.CRIKKET_BASE_URL = "https://report.example.test";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";

    fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/reporter-follow-up")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          featureRequestId: "fr-99",
          title: "Export verbessern",
          hasReporterEmail: true,
          reporterEmail: "melder@example.test",
          status: "open",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.CRIKKET_BASE_URL;
    } else {
      process.env.CRIKKET_BASE_URL = originalBaseUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.CRIKKET_API_KEY;
    } else {
      process.env.CRIKKET_API_KEY = originalApiKey;
    }
  });

  it("allows workspace members with card:view and card:edit to read and send follow-ups", async () => {
    const { user: memberUser } = await addWorkspaceMember(
      "member",
      "wmmember0001",
    );
    const caller = createCaller(memberUser);

    const lookup = await caller.crikket.getFeatureRequestByCard({
      cardPublicId: privateCardPublicId,
    });
    expect(lookup).toEqual({
      linked: true,
      featureRequestId: "fr-99",
      title: "Export verbessern",
      hasReporterEmail: true,
      reporterEmail: "melder@example.test",
      status: "open",
    });

    const followUp = await caller.crikket.sendReporterFollowUp({
      cardPublicId: privateCardPublicId,
      message: "Können Sie einen Screenshot anhängen?",
    });
    expect(followUp).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows workspace guests to read linked feature request metadata but denies sendReporterFollowUp", async () => {
    const { user: guestUser } = await addWorkspaceMember(
      "guest",
      "wmguest00001",
    );
    const caller = createCaller(guestUser);

    const lookup = await caller.crikket.getFeatureRequestByCard({
      cardPublicId: privateCardPublicId,
    });
    expect(lookup.linked).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: privateCardPublicId,
        message: "Darf nicht durchgehen",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("denies sendReporterFollowUp when card:edit is revoked via member permission override", async () => {
    const { user: memberUser, member } = await addWorkspaceMember(
      "member",
      "wmoverride01",
    );

    await db.insert(schema.workspaceMemberPermissions).values({
      workspaceMemberId: member.id,
      permission: "card:edit",
      granted: false,
      createdAt: new Date(),
    });

    const caller = createCaller(memberUser);

    await expect(
      caller.crikket.getFeatureRequestByCard({
        cardPublicId: privateCardPublicId,
      }),
    ).resolves.toMatchObject({ linked: true });

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: privateCardPublicId,
        message: "Entzogenes Bearbeitungsrecht",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks non-members from reading reporterEmail or sending follow-ups on private and public boards", async () => {
    const outsider = await createUser("outsider0001");
    const caller = createCaller(outsider);

    for (const cardPublicId of [privateCardPublicId, publicBoardCardPublicId]) {
      await expect(
        caller.crikket.getFeatureRequestByCard({ cardPublicId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await expect(
        caller.crikket.sendReporterFollowUp({
          cardPublicId,
          message: "Unbefugter Zugriff",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks former workspace members after soft deletion", async () => {
    const { user: formerUser, member } = await addWorkspaceMember(
      "member",
      "wmformer0001",
    );

    await memberRepo.softDelete(db, {
      memberId: member.id,
      deletedAt: new Date(),
      deletedBy: adminUser.id,
    });

    const caller = createCaller(formerUser);

    await expect(
      caller.crikket.getFeatureRequestByCard({
        cardPublicId: privateCardPublicId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: privateCardPublicId,
        message: "Ehemaliges Mitglied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
