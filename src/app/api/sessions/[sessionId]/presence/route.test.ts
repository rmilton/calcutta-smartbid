import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSessionMemberAuthErrorResponse: vi.fn(),
  requireAuthenticatedSessionMemberForSession: vi.fn(),
  recordViewerPresence: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildSessionMemberAuthErrorResponse: mocks.buildSessionMemberAuthErrorResponse,
  requireAuthenticatedSessionMemberForSession: mocks.requireAuthenticatedSessionMemberForSession
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    recordViewerPresence: mocks.recordViewerPresence
  })
}));

import { POST } from "./route";

describe("POST /api/sessions/[sessionId]/presence", () => {
  beforeEach(() => {
    mocks.buildSessionMemberAuthErrorResponse.mockReset();
    mocks.requireAuthenticatedSessionMemberForSession.mockReset();
    mocks.recordViewerPresence.mockReset();
  });

  it("returns auth errors for callers without a session-member login", async () => {
    mocks.buildSessionMemberAuthErrorResponse.mockResolvedValue(
      new Response(JSON.stringify({ error: "Session member login is required." }), {
        status: 403,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ currentView: "auction" })
      }),
      {
        params: Promise.resolve({
          sessionId: "session_1"
        })
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.recordViewerPresence).not.toHaveBeenCalled();
  });

  it("records the current view for valid session members", async () => {
    mocks.buildSessionMemberAuthErrorResponse.mockResolvedValue(null);
    mocks.requireAuthenticatedSessionMemberForSession.mockResolvedValue({
      scope: "session",
      sessionId: "session_1",
      memberId: "member_1",
      name: "Viewer One",
      email: "viewer@example.com",
      role: "viewer"
    });

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ currentView: "bracket" })
      }),
      {
        params: Promise.resolve({
          sessionId: "session_1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.recordViewerPresence).toHaveBeenCalledWith(
      "session_1",
      "member_1",
      "bracket"
    );
  });
});
