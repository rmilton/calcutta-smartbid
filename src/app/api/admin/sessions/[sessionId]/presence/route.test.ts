import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPlatformAdminErrorResponse: vi.fn(),
  getActiveSessionViewers: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildPlatformAdminErrorResponse: mocks.buildPlatformAdminErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    getActiveSessionViewers: mocks.getActiveSessionViewers
  })
}));

import { GET } from "./route";

describe("GET /api/admin/sessions/[sessionId]/presence", () => {
  beforeEach(() => {
    mocks.buildPlatformAdminErrorResponse.mockReset();
    mocks.getActiveSessionViewers.mockReset();
  });

  it("returns active viewers for platform admins", async () => {
    mocks.buildPlatformAdminErrorResponse.mockResolvedValue(null);
    mocks.getActiveSessionViewers.mockResolvedValue([
      {
        memberId: "member_1",
        name: "Viewer One",
        email: "viewer@example.com",
        role: "viewer",
        currentView: "auction",
        lastSeenAt: "2026-03-16T12:05:00.000Z"
      }
    ]);

    const response = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({
        sessionId: "session_1"
      })
    });
    const payload = (await response.json()) as {
      activeViewers: Array<{ memberId: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.activeViewers[0]?.memberId).toBe("member_1");
  });
});
