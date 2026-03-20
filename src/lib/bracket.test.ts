import { buildAuctionAssets, buildPlayInProjectionId } from "@/lib/auction-assets";
import { applyBracketWinnerMutation, buildBracketView, createEmptyBracketState } from "@/lib/bracket";
import {
  AuctionSession,
  SessionBracketImport,
  SessionImportReadiness,
  StoredAuctionSession,
  Syndicate,
  TeamProjection
} from "@/lib/types";

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

function buildResolvedBracketImport(): SessionBracketImport {
  const projections = buildProjections();
  return {
    sourceName: "Resolved Bracket",
    fileName: "resolved.csv",
    importedAt: new Date().toISOString(),
    teamCount: projections.length,
    teams: projections.map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      region: team.region,
      seed: team.seed,
      regionSlot: `${team.region}-${team.seed}`,
      site: null,
      subregion: null,
      isPlayIn: false,
      playInGroup: null,
      playInSeed: null
    }))
  };
}

function buildPlayInBracketImport(): SessionBracketImport {
  const base = buildResolvedBracketImport();
  const teams = base.teams.flatMap((team) => {
    if (team.region === "East" && team.seed === 11) {
      return [
        {
          ...team,
          id: "east-11-a",
          name: "East 11 A",
          shortName: "E11A",
          isPlayIn: true,
          playInGroup: "east-11-playin",
          playInSeed: 11
        },
        {
          ...team,
          id: "east-11-b",
          name: "East 11 B",
          shortName: "E11B",
          isPlayIn: true,
          playInGroup: "east-11-playin",
          playInSeed: 11
        }
      ];
    }

    if (team.region === "West" && team.seed === 16) {
      return [
        {
          ...team,
          id: "west-16-a",
          name: "West 16 A",
          shortName: "W16A",
          isPlayIn: true,
          playInGroup: "west-16-playin",
          playInSeed: 16
        },
        {
          ...team,
          id: "west-16-b",
          name: "West 16 B",
          shortName: "W16B",
          isPlayIn: true,
          playInGroup: "west-16-playin",
          playInSeed: 16
        }
      ];
    }

    return [team];
  });

  return {
    ...base,
    sourceName: "Play-In Bracket",
    fileName: "playin.csv",
    teamCount: teams.length,
    teams
  };
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

function buildImportReadiness(): SessionImportReadiness {
  return {
    mode: "session-imports",
    status: "ready",
    summary: "ready",
    issues: [],
    warnings: [],
    hasBracket: true,
    hasAnalysis: true,
    mergedProjectionCount: 64,
    lastBracketImportAt: new Date().toISOString(),
    lastAnalysisImportAt: new Date().toISOString()
  };
}

function buildSession(args?: {
  bracketImport?: SessionBracketImport | null;
  purchases?: StoredAuctionSession["purchases"];
}): StoredAuctionSession {
  const projections = buildProjections();
  const bracketImport = args?.bracketImport ?? null;
  const session: AuctionSession = {
    id: "session_bracket",
    name: "Bracket Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    archivedByName: null,
    archivedByEmail: null,
    auctionStatus: "active",
    auctionCompletedAt: null,
    auctionCompletedByName: null,
    auctionCompletedByEmail: null,
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
    analysisSettings: {},
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
    bracketImport,
    analysisImport: null,
    importReadiness: buildImportReadiness(),
    auctionAssets: buildAuctionAssets({
      baseProjections: projections,
      bracketImport
    }),
    liveState: {
      nominatedTeamId: projections[0]?.id ?? null,
      currentBid: 0,
      soldTeamIds: ["south-1"],
      lastUpdatedAt: new Date().toISOString()
    },
    bracketState: createEmptyBracketState(),
    purchases:
      args?.purchases ??
      [
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
    expect(bracket.playIns).toBeNull();
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

  it("builds explicit play-in games and leaves unresolved slots out of the main bracket", () => {
    const bracket = buildBracketView(buildSession({ bracketImport: buildPlayInBracketImport() }));

    expect(bracket.isSupported).toBe(true);
    expect(bracket.playIns?.games.map((game) => game.id)).toEqual([
      "play-in-west-16-playin",
      "play-in-east-11-playin"
    ]);
    expect(bracket.playIns?.games[0]?.entrants.map((entrant) => entrant?.teamId)).toEqual([
      "west-16-a",
      "west-16-b"
    ]);

    const eastSixVsEleven = bracket.regions
      .find((region) => region.name === "East")
      ?.rounds[0]?.games.find((game) => game.id === "east-round-of-64-5");
    expect(eastSixVsEleven?.entrants.map((entrant) => entrant?.teamId ?? null)).toEqual([
      "east-6",
      null
    ]);
    expect(eastSixVsEleven?.sourceGameIds).toEqual([null, "play-in-east-11-playin"]);
  });

  it("promotes a selected play-in winner into the corresponding round-of-64 slot", () => {
    const session = buildSession({ bracketImport: buildPlayInBracketImport() });

    applyBracketWinnerMutation(session, "play-in-east-11-playin", "east-11-a");

    const bracket = buildBracketView(session);
    const eastPlayIn = bracket.playIns?.games.find((game) => game.id === "play-in-east-11-playin");
    const eastSixVsEleven = bracket.regions
      .find((region) => region.name === "East")
      ?.rounds[0]?.games.find((game) => game.id === "east-round-of-64-5");

    expect(eastPlayIn?.winnerTeamId).toBe("east-11-a");
    expect(eastSixVsEleven?.entrants.map((entrant) => entrant?.teamId ?? null)).toEqual([
      "east-6",
      "east-11-a"
    ]);
  });

  it("shows grouped purchase ownership on unresolved play-in entrants and the promoted winner", () => {
    const bracketImport = buildPlayInBracketImport();
    const playInProjectionId = buildPlayInProjectionId({
      playInGroup: "east-11-playin",
      region: "East",
      seed: 11,
      regionSlot: "East-11"
    });
    const session = buildSession({
      bracketImport,
      purchases: [
        {
          id: "purchase_playin",
          sessionId: "session_bracket",
          teamId: playInProjectionId,
          assetId: "play-in:east-11-playin",
          assetLabel: "East 11 A / East 11 B",
          projectionIds: [playInProjectionId],
          buyerSyndicateId: "syn_other",
          price: 1200,
          createdAt: new Date().toISOString()
        }
      ]
    });

    const unresolvedBracket = buildBracketView(session);
    const eastPlayIn = unresolvedBracket.playIns?.games.find(
      (game) => game.id === "play-in-east-11-playin"
    );
    expect(eastPlayIn?.entrants[0]?.buyerSyndicateName).toBe("Riverboat");
    expect(eastPlayIn?.entrants[1]?.buyerSyndicateName).toBe("Riverboat");

    applyBracketWinnerMutation(session, "play-in-east-11-playin", "east-11-b");

    const resolvedBracket = buildBracketView(session);
    const eastSixVsEleven = resolvedBracket.regions
      .find((region) => region.name === "East")
      ?.rounds[0]?.games.find((game) => game.id === "east-round-of-64-5");
    expect(eastSixVsEleven?.entrants[1]?.teamId).toBe("east-11-b");
    expect(eastSixVsEleven?.entrants[1]?.buyerSyndicateName).toBe("Riverboat");
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

  it("clears downstream winners when a play-in result changes", () => {
    const session = buildSession({ bracketImport: buildPlayInBracketImport() });
    session.bracketState.winnersByGameId = {
      "play-in-east-11-playin": "east-11-a",
      "east-round-of-64-5": "east-11-a",
      "east-round-of-32-3": "east-11-a"
    };

    applyBracketWinnerMutation(session, "play-in-east-11-playin", "east-11-b");

    expect(session.bracketState.winnersByGameId["play-in-east-11-playin"]).toBe("east-11-b");
    expect(session.bracketState.winnersByGameId["east-round-of-64-5"]).toBeUndefined();
    expect(session.bracketState.winnersByGameId["east-round-of-32-3"]).toBeUndefined();
  });
});
