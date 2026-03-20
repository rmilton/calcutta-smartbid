import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAuthErrorResponse: vi.fn(),
  recordPurchase: vi.fn(),
  undoPurchase: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildAuthErrorResponse: mocks.buildAuthErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    recordPurchase: mocks.recordPurchase,
    undoPurchase: mocks.undoPurchase
  })
}));

import { DELETE, POST } from "./route";

describe("/api/sessions/[sessionId]/purchases", () => {
  beforeEach(() => {
    mocks.buildAuthErrorResponse.mockReset();
    mocks.recordPurchase.mockReset();
    mocks.undoPurchase.mockReset();
    mocks.buildAuthErrorResponse.mockResolvedValue(null);
  });

  it("blocks purchase recording when the auction is marked complete", async () => {
    mocks.recordPurchase.mockRejectedValue(
      new Error("Auction is marked complete. Reopen it to continue.")
    );

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({
          assetId: "asset_1",
          buyerSyndicateId: "syn_1",
          price: 1200
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

  it("blocks undo while the auction is marked complete", async () => {
    mocks.undoPurchase.mockRejectedValue(
      new Error("Auction is marked complete. Reopen it to continue.")
    );

    const response = await DELETE(new Request("http://localhost/api/test?purchaseId=purchase_1"), {
      params: Promise.resolve({ sessionId: "session_1" })
    });
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Auction is marked complete. Reopen it to continue.");
  });
});
