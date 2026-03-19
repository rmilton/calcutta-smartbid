import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedMemberForSession: vi.fn(),
  getDashboard: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedMemberForSession: mocks.requireAuthenticatedMemberForSession
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    getDashboard: mocks.getDashboard
  })
}));

import { GET } from "./route";

describe("GET /api/sessions/[sessionId]/dashboard", () => {
  beforeEach(() => {
    mocks.requireAuthenticatedMemberForSession.mockReset();
    mocks.getDashboard.mockReset();
  });

  it("returns the viewer dashboard payload for viewer members", async () => {
    mocks.requireAuthenticatedMemberForSession.mockResolvedValue({
      scope: "session",
      sessionId: "session_1",
      memberId: "viewer_1",
      name: "Viewer One",
      email: "viewer@example.com",
      role: "viewer"
    });
    mocks.getDashboard.mockResolvedValue({
      storageBackend: "supabase",
      viewerAuction: {
        projectedFinalPot: 250000
      }
    });

    const response = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({
        sessionId: "session_1"
      })
    });
    const payload = (await response.json()) as {
      viewerAuction: { projectedFinalPot: number };
    };

    expect(response.status).toBe(200);
    expect(payload.viewerAuction.projectedFinalPot).toBe(250000);
    expect(mocks.getDashboard).toHaveBeenCalledWith("session_1", {
      audience: "viewer"
    });
  });

  it("returns the operator dashboard payload for admins", async () => {
    mocks.requireAuthenticatedMemberForSession.mockResolvedValue({
      scope: "session",
      sessionId: "session_1",
      memberId: "admin_1",
      name: "Operator One",
      email: "operator@example.com",
      role: "admin"
    });
    mocks.getDashboard.mockResolvedValue({
      storageBackend: "supabase",
      recommendation: {
        stoplight: "buy"
      }
    });

    const response = await GET(new Request("http://localhost/api/test"), {
      params: Promise.resolve({
        sessionId: "session_1"
      })
    });
    const payload = (await response.json()) as {
      recommendation: { stoplight: string };
    };

    expect(response.status).toBe(200);
    expect(payload.recommendation.stoplight).toBe("buy");
    expect(mocks.getDashboard).toHaveBeenCalledWith("session_1", {
      audience: "operator"
    });
  });
});
