import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPlatformAdminErrorResponse: vi.fn(),
  updateSessionAccess: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildPlatformAdminErrorResponse: mocks.buildPlatformAdminErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    updateSessionAccess: mocks.updateSessionAccess
  })
}));

import { PUT } from "./route";

describe("PUT /api/admin/sessions/[sessionId]/access", () => {
  beforeEach(() => {
    mocks.buildPlatformAdminErrorResponse.mockReset();
    mocks.updateSessionAccess.mockReset();
  });

  it("accepts more than 40 assignments", async () => {
    mocks.buildPlatformAdminErrorResponse.mockResolvedValue(null);
    mocks.updateSessionAccess.mockResolvedValue({
      session: {
        id: "session_1"
      },
      accessMembers: [],
      activeViewers: [],
      currentSharedAccessCode: "join1234",
      platformUsers: [],
      syndicateCatalog: [],
      dataSources: [],
      importRuns: []
    });

    const assignments = Array.from({ length: 41 }, (_, index) => ({
      platformUserId: `user_${index + 1}`,
      role: index === 0 ? "admin" : "viewer",
      active: true
    }));

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ assignments })
      }),
      {
        params: Promise.resolve({
          sessionId: "session_1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSessionAccess).toHaveBeenCalledWith("session_1", assignments);
  });

  it("returns a clean validation message when no users are selected", async () => {
    mocks.buildPlatformAdminErrorResponse.mockResolvedValue(null);

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ assignments: [] })
      }),
      {
        params: Promise.resolve({
          sessionId: "session_1"
        })
      }
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Select at least one user for this session.");
    expect(mocks.updateSessionAccess).not.toHaveBeenCalled();
  });
});
