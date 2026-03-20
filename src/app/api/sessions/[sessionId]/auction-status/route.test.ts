import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAuthErrorResponse: vi.fn(),
  requireAuthenticatedMemberForSession: vi.fn(),
  updateAuctionStatus: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildAuthErrorResponse: mocks.buildAuthErrorResponse,
  requireAuthenticatedMemberForSession: mocks.requireAuthenticatedMemberForSession
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    updateAuctionStatus: mocks.updateAuctionStatus
  })
}));

import { PUT } from "./route";

describe("PUT /api/sessions/[sessionId]/auction-status", () => {
  beforeEach(() => {
    mocks.buildAuthErrorResponse.mockReset();
    mocks.requireAuthenticatedMemberForSession.mockReset();
    mocks.updateAuctionStatus.mockReset();
    mocks.buildAuthErrorResponse.mockResolvedValue(null);
  });

  it("allows session operators to mark the auction complete", async () => {
    mocks.requireAuthenticatedMemberForSession.mockResolvedValue({
      scope: "session",
      sessionId: "session_1",
      memberId: "member_1",
      name: "Operator One",
      email: "operator@example.com",
      role: "admin"
    });

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ action: "complete" })
      }),
      {
        params: Promise.resolve({ sessionId: "session_1" })
      }
    );
    const payload = (await response.json()) as { auctionStatus: string };

    expect(response.status).toBe(200);
    expect(payload.auctionStatus).toBe("complete");
    expect(mocks.updateAuctionStatus).toHaveBeenCalledWith(
      "session_1",
      "complete",
      expect.objectContaining({
        name: "Operator One",
        email: "operator@example.com"
      })
    );
  });

  it("allows platform admins to reopen the auction", async () => {
    mocks.requireAuthenticatedMemberForSession.mockResolvedValue({
      scope: "platform",
      sessionId: "session_1",
      memberId: null,
      name: "Platform Admin",
      email: "admin@example.com",
      role: "admin"
    });

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ action: "reopen" })
      }),
      {
        params: Promise.resolve({ sessionId: "session_1" })
      }
    );
    const payload = (await response.json()) as { auctionStatus: string };

    expect(response.status).toBe(200);
    expect(payload.auctionStatus).toBe("active");
    expect(mocks.updateAuctionStatus).toHaveBeenCalledWith(
      "session_1",
      "active",
      expect.objectContaining({
        name: "Platform Admin",
        email: "admin@example.com"
      })
    );
  });

  it("maps exit_tournament back to the persisted complete state", async () => {
    mocks.requireAuthenticatedMemberForSession.mockResolvedValue({
      scope: "session",
      sessionId: "session_1",
      memberId: "member_1",
      name: "Operator One",
      email: "operator@example.com",
      role: "admin"
    });

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ action: "exit_tournament" })
      }),
      {
        params: Promise.resolve({ sessionId: "session_1" })
      }
    );
    const payload = (await response.json()) as { auctionStatus: string };

    expect(response.status).toBe(200);
    expect(payload.auctionStatus).toBe("complete");
    expect(mocks.updateAuctionStatus).toHaveBeenCalledWith(
      "session_1",
      "complete",
      expect.objectContaining({
        name: "Operator One",
        email: "operator@example.com"
      })
    );
  });

  it("rejects viewers before calling the repository", async () => {
    mocks.buildAuthErrorResponse.mockResolvedValue(
      Response.json({ error: "You do not have permission to perform this action." }, { status: 403 })
    );

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ action: "complete" })
      }),
      {
        params: Promise.resolve({ sessionId: "session_1" })
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.requireAuthenticatedMemberForSession).not.toHaveBeenCalled();
    expect(mocks.updateAuctionStatus).not.toHaveBeenCalled();
  });

  it("returns the sellout-gate error when completion is requested too early", async () => {
    mocks.requireAuthenticatedMemberForSession.mockResolvedValue({
      scope: "session",
      sessionId: "session_1",
      memberId: "member_1",
      name: "Operator One",
      email: "operator@example.com",
      role: "admin"
    });
    mocks.updateAuctionStatus.mockRejectedValue(
      new Error("Auction can only be marked complete after all teams are sold.")
    );

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ action: "complete" })
      }),
      {
        params: Promise.resolve({ sessionId: "session_1" })
      }
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Auction can only be marked complete after all teams are sold.");
  });
});
