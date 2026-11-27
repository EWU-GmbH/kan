import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../root";

vi.mock("../utils/encryption", () => ({
  encryptToken: vi.fn((token: string) => token),
  decryptToken: vi.fn((token: string) => token),
}));

const mockUser = {
  id: "user-123",
  name: "Test User",
  email: "test@ewu.tools",
};

const validCardPublicId = "abc123def456";

describe("crikketRouter", () => {
  const originalBaseUrl = process.env.CRIKKET_BASE_URL;
  const originalApiKey = process.env.CRIKKET_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.CRIKKET_BASE_URL;
    delete process.env.CRIKKET_API_KEY;
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
    const caller = appRouter.createCaller({
      user: null,
      db: {} as never,
      auth: {} as never,
      headers: new Headers(),
      transport: "trpc",
      requestId: "00000000-0000-4000-8000-000000000001",
    });

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
  });

  it("returns linked=false when Crikket integration is not configured", async () => {
    const caller = appRouter.createCaller({
      user: mockUser as never,
      db: {} as never,
      auth: {} as never,
      headers: new Headers(),
      transport: "trpc",
      requestId: "00000000-0000-4000-8000-000000000002",
    });

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

  it("fetches linked feature request with Bearer auth and handles 404", async () => {
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

    const caller = appRouter.createCaller({
      user: mockUser as never,
      db: {} as never,
      auth: {} as never,
      headers: new Headers(),
      transport: "trpc",
      requestId: "00000000-0000-4000-8000-000000000003",
    });

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

  it("posts reporter follow-up message to Crikket endpoint", async () => {
    process.env.CRIKKET_BASE_URL = "https://report.example.test/";
    process.env.CRIKKET_API_KEY = "test-crikket-secret";

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const caller = appRouter.createCaller({
      user: mockUser as never,
      db: {} as never,
      auth: {} as never,
      headers: new Headers(),
      transport: "trpc",
      requestId: "00000000-0000-4000-8000-000000000004",
    });

    const res = await caller.crikket.sendReporterFollowUp({
      cardPublicId: validCardPublicId,
      message: "Können Sie das Problem genauer beschreiben?",
    });

    expect(res).toEqual({ success: true });
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
