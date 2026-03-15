import { applyBracketWinnerMutation, buildBracketView, createEmptyBracketState } from "@/lib/bracket";
import { AuctionSession, StoredAuctionSession, Syndicate, TeamProjection } from "@/lib/types";

function buildProjections() {
  const regions = ["South", "West", "East", "Midwest"];
  return regions.flatMap((region) =>
    Array.from({ length: 16 }, (_, index) => {
      const seed = index + 1;
      return {
        id: `${region.toLowerCase()}-${seed}`,
        name: `${region} Team ${seed}`,
        shortName: `${region.slice(0, 2).toUpperCase()}${seed}`,
        region,
        seed,
        rating: 100 - seed * 0.4,
        offense: 118 - seed * 0.25,
        defense: 92 + seed * 0.2,
        tempo: 67 + (seed % 4),
        source: "test"
      } satisfies TeamProjection;
    })
  );
}

function buildSyndicates(): Syndicate[] {
  return [
    {
      id: "syn_focus",
      name: "Mothership",
      color: "#111111",
      spend: 0,
      remainingBankroll: 50000,
      estimatedBudget: 50000,
      budgetConfidence: "high",
      budgetNotes: "",
      estimatedRemainingBudget: 50000,
      estimateExceeded: false,
      ownedTeamIds: ["south-1"],
      portfolioExpectedValue: 0
    },
    {
      id: "syn_other",
      name: "Riverboat",
      color: "#222222",
      spend: 0,
      remainingBankroll: 50000,
      estimatedBudget: 50000,
      budgetConfidence: "medium",
      budgetNotes: "",
      estimatedRemainingBudget: 50000,
      estimateExceeded: false,
      ownedTeamIds: [],
      portfolioExpectedValue: 0
    }
  ];
}

function buildSession(): StoredAuctionSession {
  const projections = buildProjections();
  const session: AuctionSession = {
    id: "session_bracket",
    name: "Bracket Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    archivedByName: null,
    archivedByEmail: null,
    focusSyndicateId: "syn_focus",
    eventAccess: {
      sharedCodeConfigured: true
    },
    payoutRules: {
      roundOf64: 1,
      roundOf32: 1,
      sweet16: 1,
      elite8: 1,
      finalFour: 1,
      champion: 1,
      projectedPot: 100000
    },
    analysisSettings: {
      targetTeamCount: 8,
      maxSingleTeamPct: 22
    },
    mothershipFunding: {
      targetSharePrice: 200,
      allowHalfShares: true,
      fullSharesSold: 100,
      halfSharesSold: 0,
      budgetLow: 45000,
      budgetBase: 50000,
      budgetStretch: 60000
    },
    syndicates: buildSyndicates(),
    baseProjections: projections,
    projections,
    projectionOverrides: {},
    teamClassifications: {},
    teamNotes: {},
    projectionProvider: "test",
    activeDataSource: {
      key: "data-source:test",
      name: "Test Source",
      kind: "csv"
    },
    finalFourPairings: [
      ["South", "West"],
      ["East", "Midwest"]
    ],
    liveState: {
      nominatedTeamId: projections[0]?.id ?? null,
      currentBid: 0,
      soldTeamIds: ["south-1"],
      lastUpdatedAt: new Date().toISOString()
    },
    bracketState: createEmptyBracketState(),
    purchases: [
      {
        id: "purchase_1",
        sessionId: "session_bracket",
        teamId: "south-1",
        buyerSyndicateId: "syn_focus",
        price: 2500,
        createdAt: new Date().toISOString()
      }
    ],
    simulationSnapshot: null
  };

  return {
    ...session,
    sharedAccessCodePlaintext: "shared123",
    sharedAccessCodeHash: "hash",
    sharedAccessCodeLookup: "lookup",
    sharedAccessCodeCiphertext: "cipher",
    accessMembers: []
  };
}

describe("bracket view", () => {
  it("assembles a supported 64-team bracket with seeded first-round pairings and ownership markers", () => {
    const bracket = buildBracketView(buildSession());

    expect(bracket.isSupported).toBe(true);
    expect(bracket.regions.map((region) => region.name)).toEqual([
      "South",
      "West",
      "East",
      "Midwest"
    ]);
    expect(bracket.regions[0]?.rounds[0]?.games).toHaveLength(8);
    expect(bracket.regions[0]?.rounds[0]?.games[0]?.entrants.map((team) => team?.seed)).toEqual([
      1,
      16
    ]);
    expect(bracket.regions[0]?.rounds[0]?.games[0]?.entrants[0]?.buyerSyndicateName).toBe(
      "Mothership"
    );
    expect(bracket.finals[0]?.games[0]?.id).toBe("final-four-1");
    expect(bracket.finals[1]?.games[0]?.sourceGameIds).toEqual([
      "final-four-1",
      "final-four-2"
    ]);
  });

  it("shows ownership markers for every underlying team in a grouped purchase", () => {
    const session = buildSession();
    session.purchases = [
      {
        id: "purchase_bundle",
        sessionId: "session_bracket",
        teamId: "east-13",
        assetId: "bundle:east:13-16",
        assetLabel: "East 13-16 Seeds",
        projectionIds: ["east-13", "east-14", "east-15", "east-16"],
        buyerSyndicateId: "syn_other",
        price: 1800,
        createdAt: new Date().toISOString()
      }
    ];

    const bracket = buildBracketView(session);
    const eastRoundOf64 = bracket.regions.find((region) => region.name === "East")?.rounds[0]?.games ?? [];
    const ownedEntrants = eastRoundOf64
      .flatMap((game) => game.entrants)
      .filter((entrant) => entrant?.buyerSyndicateName === "Riverboat")
      .map((entrant) => entrant?.teamId);

    expect(ownedEntrants).toEqual(expect.arrayContaining(["east-13", "east-14", "east-15", "east-16"]));
  });

  it("returns an unsupported state for incomplete fields", () => {
    const session = buildSession();
    session.projections = session.projections.slice(0, 32);
    session.baseProjections = session.baseProjections.slice(0, 32);

    const bracket = buildBracketView(session);

    expect(bracket.isSupported).toBe(false);
    expect(bracket.unsupportedReason).toContain("64-team field");
  });
});

describe("bracket winner mutation", () => {
  it("rejects winners who are not current matchup entrants", () => {
    const session = buildSession();

    expect(() =>
      applyBracketWinnerMutation(session, "south-round-of-64-1", "west-1")
    ).toThrow("Selected winner must be one of the current matchup entrants.");
  });

  it("clears downstream winners when an upstream result changes", () => {
    const session = buildSession();
    session.bracketState.winnersByGameId = {
      "south-round-of-64-1": "south-1",
      "south-round-of-64-2": "south-8",
      "south-round-of-32-1": "south-1"
    };

    applyBracketWinnerMutation(session, "south-round-of-64-1", "south-16");

    expect(session.bracketState.winnersByGameId["south-round-of-64-1"]).toBe("south-16");
    expect(session.bracketState.winnersByGameId["south-round-of-32-1"]).toBeUndefined();
  });
});
