import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as cardRepo from "@kan/db/repository/card.repo";

import type * as PermissionsModule from "../utils/permissions";
import { appRouter } from "../root";
import { assertPermission } from "../utils/permissions";

vi.mock("../utils/encryption", () => ({
  encryptToken: vi.fn((token: string) => token),
  decryptToken: vi.fn((token: string) => token),
}));

vi.mock("@kan/db/repository/card.repo", async () => {
  const actual = await vi.importActual<typeof cardRepo>(
    "@kan/db/repository/card.repo",
  );
  return {
    ...actual,
    getWorkspaceAndCardIdByCardPublicId: vi.fn(),
  };
});

vi.mock("../utils/permissions", async () => {
  const actual = await vi.importActual<typeof PermissionsModule>(
    "../utils/permissions",
  );
  return {
    ...actual,
    assertPermission: vi.fn(),
  };
});

const mockGetCardByPublicId = vi.mocked(
  cardRepo.getWorkspaceAndCardIdByCardPublicId,
);
const mockAssertPermission = vi.mocked(assertPermission);

const mockUser = {
  id: "user-123",
  name: "Test User",
  email: "test@ewu.tools",
};

const validCardPublicId = "abc123def456";

const mockCard = {
  id: 42,
  createdBy: "other-user",
  workspaceId: 7,
  workspaceVisibility: "private" as const,
  listPublicId: "list12345678",
  listName: "Backlog",
  boardPublicId: "brd123456789",
  boardName: "Support",
};

function createCaller(
  user: typeof mockUser | null,
  requestId: `${string}-${string}-${string}-${string}-${string}`,
) {
  return appRouter.createCaller({
    user: user as never,
    db: {} as never,
    auth: {} as never,
    headers: new Headers(),
    transport: "trpc",
    requestId,
  });
}

describe("crikketRouter", () => {
  const originalBaseUrl = process.env.CRIKKET_BASE_URL;
  const originalApiKey = process.env.CRIKKET_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRIKKET_BASE_URL;
    delete process.env.CRIKKET_API_KEY;
    mockGetCardByPublicId.mockResolvedValue(mockCard);
    mockAssertPermission.mockResolvedValue(undefined);
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

  it("mounts crikket router on appRouter and rejects unauthenticated callers", async () => {
    const caller = createCaller(null, "00000000-0000-4000-8000-000000000001");

    await expect(
      caller.crikket.getFeatureRequestByCard({
        cardPublicId: validCardPublicId,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: validCardPublicId,
        message: "Rueckfrage",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockGetCardByPublicId).not.toHaveBeenCalled();
  });

  it("rejects with NOT_FOUND when card does not exist", async () => {
    process.env.CRIKKET_BASE_URL = "https://report.example.test";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    mockGetCardByPublicId.mockResolvedValue(null);

    const caller = createCaller(
      mockUser,
      "00000000-0000-4000-8000-000000000002",
    );

    await expect(
      caller.crikket.getFeatureRequestByCard({
        cardPublicId: validCardPublicId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: validCardPublicId,
        message: "Rueckfrage",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockAssertPermission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects getFeatureRequestByCard with FORBIDDEN when caller lacks card:view access", async () => {
    process.env.CRIKKET_BASE_URL = "https://report.example.test";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    mockGetCardByPublicId.mockResolvedValue({
      ...mockCard,
      workspaceVisibility: "public",
    });
    mockAssertPermission.mockRejectedValueOnce(
      new TRPCError({
        code: "FORBIDDEN",
        message:
          "You do not have permission to perform this action (card:view)",
      }),
    );

    const caller = createCaller(
      mockUser,
      "00000000-0000-4000-8000-000000000003",
    );

    await expect(
      caller.crikket.getFeatureRequestByCard({
        cardPublicId: validCardPublicId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockAssertPermission).toHaveBeenCalledWith(
      expect.anything(),
      mockUser.id,
      mockCard.workspaceId,
      "card:view",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects sendReporterFollowUp with FORBIDDEN when caller lacks card:edit", async () => {
    process.env.CRIKKET_BASE_URL = "https://report.example.test";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    mockAssertPermission.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      new TRPCError({
        code: "FORBIDDEN",
        message:
          "You do not have permission to perform this action (card:edit)",
      }),
    );

    const caller = createCaller(
      mockUser,
      "00000000-0000-4000-8000-000000000004",
    );

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: validCardPublicId,
        message: "Rueckfrage",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockAssertPermission).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      mockUser.id,
      mockCard.workspaceId,
      "card:view",
    );
    expect(mockAssertPermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      mockUser.id,
      mockCard.workspaceId,
      "card:edit",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns linked=false or PRECONDITION_FAILED when Crikket integration is not configured for authorized callers", async () => {
    const caller = createCaller(
      mockUser,
      "00000000-0000-4000-8000-000000000005",
    );

    await expect(
      caller.crikket.getFeatureRequestByCard({
        cardPublicId: validCardPublicId,
      }),
    ).resolves.toEqual({ linked: false });

    await expect(
      caller.crikket.sendReporterFollowUp({
        cardPublicId: validCardPublicId,
        message: "Rueckfrage",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("fetches linked feature request with Bearer auth and handles 404 for authorized callers", async () => {
    process.env.CRIKKET_BASE_URL = "https://report.example.test///";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            featureRequestId: "fr-42",
            title: "Export verbessern",
            hasReporterEmail: true,
            reporterEmail: "melder@example.test",
            status: "open",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const caller = createCaller(
      mockUser,
      "00000000-0000-4000-8000-000000000006",
    );

    const found = await caller.crikket.getFeatureRequestByCard({
      cardPublicId: validCardPublicId,
    });

    expect(found).toEqual({
      linked: true,
      featureRequestId: "fr-42",
      title: "Export verbessern",
      hasReporterEmail: true,
      reporterEmail: "melder@example.test",
      status: "open",
    });
    expect(mockAssertPermission).toHaveBeenCalledWith(
      expect.anything(),
      mockUser.id,
      mockCard.workspaceId,
      "card:view",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://report.example.test/api/kan/feature-requests/by-card/${validCardPublicId}`,
      {
        method: "GET",
        headers: {
          Authorization: "Bearer test-crikket-secret",
        },
      },
    );

    const notFound = await caller.crikket.getFeatureRequestByCard({
      cardPublicId: validCardPublicId,
    });
    expect(notFound).toEqual({ linked: false });
  });

  it("posts reporter follow-up message to Crikket endpoint when caller has card:edit", async () => {
    process.env.CRIKKET_BASE_URL = "https://report.example.test/";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const caller = createCaller(
      mockUser,
      "00000000-0000-4000-8000-000000000007",
    );

    const res = await caller.crikket.sendReporterFollowUp({
      cardPublicId: validCardPublicId,
      message: "Können Sie das Problem genauer beschreiben?",
    });

    expect(res).toEqual({ success: true });
    expect(mockAssertPermission).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      mockUser.id,
      mockCard.workspaceId,
      "card:view",
    );
    expect(mockAssertPermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      mockUser.id,
      mockCard.workspaceId,
      "card:edit",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `https://report.example.test/api/kan/feature-requests/by-card/${validCardPublicId}/reporter-follow-up`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-crikket-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Können Sie das Problem genauer beschreiben?",
        }),
      },
    );
  });
});
