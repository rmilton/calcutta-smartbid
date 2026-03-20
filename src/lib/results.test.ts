import { describe, expect, it } from "vitest";
import { computeMothershipPortfolioResults } from "@/lib/results";
import { AuctionSession, BracketViewModel, TeamProjection } from "@/lib/types";

function buildProjection(id: string, name: string): TeamProjection {
  return {
    id,
    name,
    shortName: name,
    region: "South",
    seed: 1,
    rating: 100,
    offense: 110,
    defense: 95,
    tempo: 68,
    source: "test"
  };
}

function buildSession(): AuctionSession {
  const alpha = buildProjection("alpha", "Alpha");
  const bravo = buildProjection("bravo", "Bravo");
  const charlie = buildProjection("charlie", "Charlie");
  const delta = buildProjection("delta", "Delta");

  return {
    id: "session_results",
    name: "Results Test",
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    archivedAt: null,
    archivedByName: null,
    archivedByEmail: null,
    auctionStatus: "tournament_active",
    auctionCompletedAt: "2026-03-19T23:00:00.000Z",
    auctionCompletedByName: "Operator",
    auctionCompletedByEmail: "operator@example.com",
    focusSyndicateId: "syn_focus",
    eventAccess: {
      sharedCodeConfigured: true
    },
    payoutRules: {
      roundOf64: 1,
      roundOf32: 2,
      sweet16: 4,
      elite8: 8,
      finalFour: 16,
      champion: 32,
      projectedPot: 100000
    },
    analysisSettings: {},
    mothershipFunding: {
      targetSharePrice: 200,
      allowHalfShares: true,
      fullSharesSold: 10,
      halfSharesSold: 0,
      budgetLow: 1000,
      budgetBase: 1200,
      budgetStretch: 1400
    },
    syndicates: [
      {
        id: "syn_focus",
        name: "Mothership",
        color: "#111111",
        spend: 500,
        remainingBankroll: 700,
        estimatedBudget: 1200,
        budgetConfidence: "high",
        budgetNotes: "",
        estimatedRemainingBudget: 700,
        estimateExceeded: false,
        ownedTeamIds: ["alpha", "bravo"],
        portfolioExpectedValue: 0
      }
    ],
    baseProjections: [alpha, bravo, charlie, delta],
    projections: [alpha, bravo, charlie, delta],
    projectionOverrides: {},
    teamClassifications: {},
    teamNotes: {},
    projectionProvider: "test",
    activeDataSource: {
      key: "builtin:test",
      name: "Test Source",
      kind: "builtin"
    },
    finalFourPairings: [
      ["South", "West"],
      ["East", "Midwest"]
    ],
    bracketImport: null,
    analysisImport: null,
    importReadiness: {
      mode: "session-imports",
      status: "ready",
      summary: "Ready",
      issues: [],
      warnings: [],
      hasBracket: true,
      hasAnalysis: true,
      mergedProjectionCount: 4,
      lastBracketImportAt: null,
      lastAnalysisImportAt: null
    },
    auctionAssets: [
      {
        id: "bundle:south:alpha-bravo",
        label: "Alpha / Bravo Bundle",
        type: "seed_bundle",
        region: "South",
        seed: null,
        seedRange: [1, 2],
        memberTeamIds: ["alpha", "bravo"],
        projectionIds: ["alpha", "bravo"],
        members: [],
        unresolved: false
      }
    ],
    liveState: {
      nominatedAssetId: null,
      nominatedTeamId: null,
      currentBid: 0,
      soldAssetIds: ["bundle:south:alpha-bravo"],
      soldTeamIds: ["alpha", "bravo"],
      lastUpdatedAt: "2026-03-20T00:00:00.000Z"
    },
    bracketState: {
      winnersByGameId: {}
    },
    purchases: [
      {
        id: "purchase_1",
        sessionId: "session_results",
        teamId: "alpha",
        assetId: "bundle:south:alpha-bravo",
        assetLabel: "Alpha / Bravo Bundle",
        projectionIds: ["alpha", "bravo"],
        buyerSyndicateId: "syn_focus",
        price: 500,
        createdAt: "2026-03-19T22:00:00.000Z"
      }
    ],
    simulationSnapshot: null
  };
}

function buildBracket(): BracketViewModel {
  return {
    isSupported: true,
    unsupportedReason: null,
    regions: [
      {
        name: "South",
        rounds: [
          {
            key: "roundOf64",
            label: "Round of 64",
            region: "South",
            games: [
              {
                id: "game-later",
                round: "roundOf64",
                label: "Later game",
                region: "South",
                slot: 1,
                sourceGameIds: [null, null],
                entrants: [
                  {
                    teamId: "alpha",
                    name: "Alpha",
                    shortName: "Alpha",
                    seed: 1,
                    region: "South",
                    buyerSyndicateId: "syn_focus",
                    buyerSyndicateName: "Mothership",
                    buyerColor: "#111111"
                  },
                  {
                    teamId: "charlie",
                    name: "Charlie",
                    shortName: "Charlie",
                    seed: 8,
                    region: "South",
                    buyerSyndicateId: null,
                    buyerSyndicateName: null,
                    buyerColor: null
                  }
                ],
                winnerTeamId: null,
                broadcastIsoDate: "2026-03-21T23:00:00.000Z",
                broadcastNetwork: "TBS"
              },
              {
                id: "game-earlier",
                round: "roundOf64",
                label: "Earlier game",
                region: "South",
                slot: 2,
                sourceGameIds: [null, null],
                entrants: [
                  {
                    teamId: "bravo",
                    name: "Bravo",
                    shortName: "Bravo",
                    seed: 2,
                    region: "South",
                    buyerSyndicateId: "syn_focus",
                    buyerSyndicateName: "Mothership",
                    buyerColor: "#111111"
                  },
                  {
                    teamId: "delta",
                    name: "Delta",
                    shortName: "Delta",
                    seed: 7,
                    region: "South",
                    buyerSyndicateId: null,
                    buyerSyndicateName: null,
                    buyerColor: null
                  }
                ],
                winnerTeamId: null,
                broadcastIsoDate: "2026-03-21T18:00:00.000Z",
                broadcastNetwork: "truTV"
              }
            ]
          }
        ]
      }
    ],
    finals: []
  };
}

describe("computeMothershipPortfolioResults", () => {
  it("chooses the earliest scheduled unresolved game for grouped assets", () => {
    const results = computeMothershipPortfolioResults(
      buildSession(),
      buildBracket(),
      "syn_focus"
    );

    expect(results?.assets).toHaveLength(1);
    expect(results?.assets[0]).toMatchObject({
      nextGameIsoDate: "2026-03-21T18:00:00.000Z",
      nextGameNetwork: "truTV",
      nextGameOpponentId: "delta",
      nextGameOpponentName: "Delta"
    });
  });
});
