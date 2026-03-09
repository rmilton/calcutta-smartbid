import { buildBidRecommendation, computeOwnershipExposure } from "@/lib/engine/recommendations";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { getDefaultFinalFourPairings, getDefaultPayoutRules, getMockProjections } from "@/lib/sample-data";
import { AuctionSession } from "@/lib/types";

function buildSession(): AuctionSession {
  const projections = getMockProjections();
  const payoutRules = getDefaultPayoutRules();
  const simulationSnapshot = simulateAuctionField({
    sessionId: "session_test",
    projections,
    payoutRules,
    finalFourPairings: getDefaultFinalFourPairings(),
    iterations: 2000,
    provider: "mock",
    seed: "recommendation-seed"
  });

  return {
    id: "session_test",
    name: "Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    focusSyndicateId: "syn_focus",
    eventAccess: {
      sharedCodeConfigured: true
    },
    payoutRules,
    syndicates: [
      {
        id: "syn_focus",
        name: "SmartBid",
        color: "#ff6b57",
        spend: 12000,
        remainingBankroll: 43000,
        ownedTeamIds: ["duke"],
        portfolioExpectedValue: 0
      },
      {
        id: "syn_other",
        name: "Riverboat",
        color: "#1f6feb",
        spend: 9000,
        remainingBankroll: 46000,
        ownedTeamIds: [],
        portfolioExpectedValue: 0
      }
    ],
    baseProjections: projections,
    projectionOverrides: {},
    projections,
    projectionProvider: "mock",
    finalFourPairings: getDefaultFinalFourPairings(),
    liveState: {
      nominatedTeamId: "alabama",
      currentBid: 6200,
      soldTeamIds: ["duke"],
      lastUpdatedAt: new Date().toISOString()
    },
    purchases: [],
    simulationSnapshot
  };
}

describe("recommendations", () => {
  it("penalizes overlap with already-owned teams", () => {
    const session = buildSession();
    const focus = session.syndicates[0];

    const withOwnership = computeOwnershipExposure(session, "alabama", focus);
    const withoutOwnership = computeOwnershipExposure(
      { ...session, syndicates: [{ ...focus, ownedTeamIds: [] }, session.syndicates[1]] },
      "alabama",
      { ...focus, ownedTeamIds: [] }
    );

    expect(withOwnership.overlapScore).toBeGreaterThanOrEqual(withoutOwnership.overlapScore);
  });

  it("returns a recommendation for the nominated team", () => {
    const session = buildSession();
    const focus = session.syndicates[0];
    const team = session.projections.find((projection) => projection.id === "alabama") ?? null;
    const recommendation = buildBidRecommendation(session, team, focus);

    expect(recommendation).not.toBeNull();
    expect(recommendation?.recommendedMaxBid).toBeGreaterThan(0);
    expect(recommendation?.drivers).toHaveLength(2);
    expect(recommendation?.valueGap).toBeDefined();
  });
});
