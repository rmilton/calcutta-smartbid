import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAuthErrorResponse: vi.fn(),
  updateBracketGame: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildAuthErrorResponse: mocks.buildAuthErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    updateBracketGame: mocks.updateBracketGame
  })
}));

import { PUT } from "./route";

describe("PUT /api/sessions/[sessionId]/bracket/games/[gameId]", () => {
  beforeEach(() => {
    mocks.buildAuthErrorResponse.mockReset();
    mocks.updateBracketGame.mockReset();
  });

  it("returns auth errors for viewers", async () => {
    mocks.buildAuthErrorResponse.mockResolvedValue(
      new Response(JSON.stringify({ error: "You do not have permission to perform this action." }), {
        status: 403,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ winnerTeamId: "south-1" })
      }),
      {
        params: Promise.resolve({
          sessionId: "session_1",
          gameId: "south-round-of-64-1"
        })
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.updateBracketGame).not.toHaveBeenCalled();
  });

  it("updates the bracket game for operators and platform admins", async () => {
    mocks.buildAuthErrorResponse.mockResolvedValue(null);
    mocks.updateBracketGame.mockResolvedValue({
      session: {
        id: "session_1"
      }
    });

    const response = await PUT(
      new Request("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ winnerTeamId: "south-1" })
      }),
      {
        params: Promise.resolve({
          sessionId: "session_1",
          gameId: "south-round-of-64-1"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateBracketGame).toHaveBeenCalledWith(
      "session_1",
      "south-round-of-64-1",
      "south-1"
    );
  });
});
