import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPlatformAdminErrorResponse: vi.fn(),
  getSessionAdminConfig: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildPlatformAdminErrorResponse: mocks.buildPlatformAdminErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    getSessionAdminConfig: mocks.getSessionAdminConfig
  })
}));

import { GET } from "./route";

describe("GET /api/admin/sessions/[sessionId]/config", () => {
  beforeEach(() => {
    mocks.buildPlatformAdminErrorResponse.mockReset();
    mocks.getSessionAdminConfig.mockReset();
  });

  it("returns active viewer detail in the session admin config payload", async () => {
    mocks.buildPlatformAdminErrorResponse.mockResolvedValue(null);
    mocks.getSessionAdminConfig.mockResolvedValue({
      session: {
        id: "session_1"
      },
      currentSharedAccessCode: "join1234",
      accessMembers: [],
      activeViewers: [
        {
          memberId: "member_1",
          name: "Viewer One",
          email: "viewer@example.com",
          role: "viewer",
          currentView: "auction",
          lastSeenAt: "2026-03-16T12:05:00.000Z"
        }
      ],
      platformUsers: [],
      syndicateCatalog: [],
      dataSources: [],
      importRuns: []
    });

    const response = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({
        sessionId: "session_1"
      })
    });
    const payload = (await response.json()) as {
      activeViewers: Array<{ email: string; currentView: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.activeViewers[0]).toMatchObject({
      email: "viewer@example.com",
      currentView: "auction"
    });
  });
});
