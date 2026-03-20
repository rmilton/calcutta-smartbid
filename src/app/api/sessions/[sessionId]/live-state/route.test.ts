import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAuthErrorResponse: vi.fn(),
  updateLiveState: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildAuthErrorResponse: mocks.buildAuthErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    updateLiveState: mocks.updateLiveState
  })
}));

import { PATCH } from "./route";

describe("PATCH /api/sessions/[sessionId]/live-state", () => {
  beforeEach(() => {
    mocks.buildAuthErrorResponse.mockReset();
    mocks.updateLiveState.mockReset();
    mocks.buildAuthErrorResponse.mockResolvedValue(null);
  });

  it("returns the auction-complete lock message when bidding is closed", async () => {
    mocks.updateLiveState.mockRejectedValue(
      new Error("Auction is marked complete. Reopen it to continue.")
    );

    const response = await PATCH(
      new Request("http://localhost/api/test", {
        method: "PATCH",
        body: JSON.stringify({
          nominatedAssetId: "asset_1",
          currentBid: 1000
        })
      }),
      {
        params: Promise.resolve({ sessionId: "session_1" })
      }
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Auction is marked complete. Reopen it to continue.");
  });
});
