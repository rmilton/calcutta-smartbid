import { buildBidRecommendation, computeOwnershipExposure } from "@/lib/engine/recommendations";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { buildSessionAnalysisSnapshot } from "@/lib/session-analysis";
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
    analysisSettings: {
      targetTeamCount: 8,
      maxSingleTeamPct: 22
    },
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
    activeDataSource: {
      key: "builtin:mock",
      name: "Built-in Mock Field",
      kind: "builtin"
    },
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
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const recommendation = buildBidRecommendation(session, team, focus, analysis);

    expect(recommendation).not.toBeNull();
    expect(recommendation?.maxBid).toBeGreaterThan(0);
    expect(recommendation?.targetBid).toBeGreaterThan(0);
    expect(recommendation?.drivers).toHaveLength(2);
    expect(recommendation?.valueGap).toBeDefined();
  });

  it("does not show a buy signal when the team is outside the budget plan", () => {
    const session = {
      ...buildSession(),
      liveState: {
        ...buildSession().liveState,
        currentBid: 0
      }
    };
    const focus = session.syndicates[0];
    const team = session.projections.find((projection) => projection.id === "alabama") ?? null;
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const recommendation = buildBidRecommendation(
      session,
      team,
      focus,
      {
        ...analysis,
        budgetRows: analysis.budgetRows.filter((row) => row.teamId !== "alabama")
      }
    );

    expect(recommendation).not.toBeNull();
    expect(recommendation?.stoplight).toBe("pass");
  });

  it("caps the buy window at the conflict-adjusted max bid", () => {
    const baseSession = buildSession();
    const session = {
      ...baseSession,
      liveState: {
        ...baseSession.liveState,
        currentBid: 500
      }
    };
    const focus = session.syndicates[0];
    const team = session.projections.find((projection) => projection.id === "alabama") ?? null;
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const recommendation = buildBidRecommendation(
      session,
      team,
      {
        ...focus,
        ownedTeamIds: session.projections.slice(0, 20).map((projection) => projection.id)
      },
      {
        ...analysis,
        budgetRows: analysis.budgetRows.map((row) =>
          row.teamId === "alabama"
            ? {
                ...row,
                targetBid: 600,
                maxBid: 520
              }
            : row
        )
      }
    );

    expect(recommendation).not.toBeNull();
    expect(recommendation?.maxBid).toBeLessThan(recommendation?.targetBid ?? 0);
    expect(recommendation?.stoplight).not.toBe("buy");
  });
});
