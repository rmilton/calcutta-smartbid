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
    archivedAt: null,
    archivedByName: null,
    archivedByEmail: null,
    focusSyndicateId: "syn_focus",
    eventAccess: {
      sharedCodeConfigured: true
    },
    payoutRules,
    analysisSettings: {},
    mothershipFunding: {
      targetSharePrice: 201,
      allowHalfShares: true,
      fullSharesSold: 200,
      halfSharesSold: 20,
      budgetLow: 45000,
      budgetBase: 55000,
      budgetStretch: 65000
    },
    syndicates: [
      {
        id: "syn_focus",
        name: "SmartBid",
        color: "#ff6b57",
        spend: 12000,
        remainingBankroll: 43000,
        estimatedBudget: 55000,
        budgetConfidence: "high",
        budgetNotes: "",
        estimatedRemainingBudget: 43000,
        estimateExceeded: false,
        ownedTeamIds: ["duke"],
        portfolioExpectedValue: 0
      },
      {
        id: "syn_other",
        name: "Riverboat",
        color: "#1f6feb",
        spend: 9000,
        remainingBankroll: 46000,
        estimatedBudget: 46000,
        budgetConfidence: "medium",
        budgetNotes: "",
        estimatedRemainingBudget: 37000,
        estimateExceeded: false,
        ownedTeamIds: [],
        portfolioExpectedValue: 0
      }
    ],
    baseProjections: projections,
    projectionOverrides: {},
    teamClassifications: {},
    teamNotes: {},
    projections,
    projectionProvider: "mock",
    activeDataSource: {
      key: "builtin:mock",
      name: "Built-in Mock Field",
      kind: "builtin"
    },
    finalFourPairings: getDefaultFinalFourPairings(),
    bracketImport: null,
    analysisImport: null,
    importReadiness: {
      mode: "legacy",
      status: "ready",
      summary: "Legacy projection source is loaded and simulations are ready.",
      issues: [],
      warnings: [],
      hasBracket: false,
      hasAnalysis: false,
      mergedProjectionCount: projections.length,
      lastBracketImportAt: null,
      lastAnalysisImportAt: null
    },
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
    expect(recommendation?.drivers).toHaveLength(3);
    expect(recommendation?.valueGap).toBeDefined();
  });

  it("returns bid guidance for lower-ranked available teams", () => {
    const session = {
      ...buildSession(),
      liveState: {
        ...buildSession().liveState,
        currentBid: 0
      }
    };
    const focus = session.syndicates[0];
    const team = session.projections.at(-1) ?? null;
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const recommendation = buildBidRecommendation(session, team, focus, analysis);

    expect(recommendation).not.toBeNull();
    expect(recommendation?.targetBid).toBeGreaterThan(0);
    expect(recommendation?.maxBid).toBeGreaterThan(recommendation?.targetBid ?? 0);
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

  it("marks recommendations as stretch when the live bid pushes past base funding", () => {
    const session = {
      ...buildSession(),
      liveState: {
        ...buildSession().liveState,
        currentBid: 45000
      }
    };
    const focus = session.syndicates[0];
    const team = session.projections.find((projection) => projection.id === "alabama") ?? null;
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const recommendation = buildBidRecommendation(session, team, focus, analysis);

    expect(recommendation?.fundingStatus).toBe("stretch");
    expect(recommendation?.baseBudgetHeadroom).toBeLessThan(0);
    expect(recommendation?.stretchBudgetHeadroom).toBeGreaterThan(0);
  });

  it("describes bundle teams explicitly in recommendation rationale", () => {
    const session = buildSession();
    const focus = session.syndicates[0];
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const asset = {
      id: "bundle:south:13-16",
      label: "South 13-16 Seeds",
      type: "seed_bundle" as const,
      region: "South",
      seed: null,
      seedRange: [13, 16] as [number, number],
      memberTeamIds: ["south13", "south14", "south15", "south16"],
      projectionIds: ["louisville", "texas-am", "marquette", "wisconsin"],
      members: [
        {
          id: "south13",
          type: "team" as const,
          label: "Louisville",
          region: "South",
          seed: 13,
          regionSlot: "South-13",
          teamIds: ["south13"],
          projectionIds: ["louisville"],
          unresolved: false
        },
        {
          id: "south14",
          type: "team" as const,
          label: "Texas A&M",
          region: "South",
          seed: 14,
          regionSlot: "South-14",
          teamIds: ["south14"],
          projectionIds: ["texas-am"],
          unresolved: false
        },
        {
          id: "south15",
          type: "team" as const,
          label: "Marquette",
          region: "South",
          seed: 15,
          regionSlot: "South-15",
          teamIds: ["south15"],
          projectionIds: ["marquette"],
          unresolved: false
        },
        {
          id: "south16",
          type: "team" as const,
          label: "Wisconsin",
          region: "South",
          seed: 16,
          regionSlot: "South-16",
          teamIds: ["south16"],
          projectionIds: ["wisconsin"],
          unresolved: false
        }
      ],
      unresolved: false
    };

    const recommendation = buildBidRecommendation(session, null, focus, analysis, asset);

    expect(recommendation?.rationale[0]).toContain("bundles");
    expect(recommendation?.rationale[0]).toContain("13 Louisville");
    expect(recommendation?.rationale[0]).toContain("16 Wisconsin");
  });
});
