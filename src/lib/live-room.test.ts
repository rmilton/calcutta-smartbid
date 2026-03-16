import {
  buildOperatorSyndicateHoldings,
  buildViewerOwnershipGroups,
  deriveAuctionMatchups,
  filterRecommendationRationale,
  getFirstRoundMatchup,
  getLikelyRound2Matchup,
  orderSyndicateBoard
} from "@/lib/live-room";
import {
  AuctionAsset,
  BracketViewModel,
  SimulationSnapshot,
  SoldAssetSummary,
  Syndicate,
  TeamProjection
} from "@/lib/types";

function buildTeam(id: string, name: string, seed: number): TeamProjection {
  return {
    id,
    name,
    shortName: name,
    region: "East",
    seed,
    rating: 100,
    offense: 100,
    defense: 100,
    tempo: 70,
    source: "test"
  };
}

function buildAsset(id: string, label: string, projectionId: string, seed: number): AuctionAsset {
  return {
    id,
    label,
    type: "single_team",
    region: "East",
    seed,
    seedRange: null,
    memberTeamIds: [projectionId],
    projectionIds: [projectionId],
    members: [
      {
        id: projectionId,
        type: "team",
        label,
        region: "East",
        seed,
        regionSlot: `East-${seed}`,
        teamIds: [projectionId],
        projectionIds: [projectionId],
        unresolved: false
      }
    ],
    unresolved: false
  };
}

const focusSyndicate: Syndicate = {
  id: "focus",
  name: "Mothership",
  color: "#111111",
  spend: 1200,
  remainingBankroll: 0,
  estimatedBudget: 5000,
  budgetConfidence: "high",
  budgetNotes: "",
  estimatedRemainingBudget: 3800,
  estimateExceeded: false,
  ownedTeamIds: ["team-b"],
  portfolioExpectedValue: 900
};

const otherSyndicate: Syndicate = {
  ...focusSyndicate,
  id: "other",
  name: "Riverboat",
  color: "#222222",
  ownedTeamIds: [],
  spend: 900,
  estimatedRemainingBudget: 2100
};

const thirdSyndicate: Syndicate = {
  ...focusSyndicate,
  id: "third",
  name: "Backdoor",
  color: "#333333",
  ownedTeamIds: [],
  spend: 600,
  estimatedRemainingBudget: 2400
};

const soldAssets: SoldAssetSummary[] = [
  {
    asset: buildAsset("asset-a", "Alpha", "team-a", 1),
    price: 900,
    buyerSyndicateId: "other"
  },
  {
    asset: buildAsset("asset-b", "Beta", "team-b", 8),
    price: 1200,
    buyerSyndicateId: "focus"
  },
  {
    asset: buildAsset("asset-c", "Gamma", "team-c", 5),
    price: 700,
    buyerSyndicateId: "focus"
  }
];

const bracket: BracketViewModel = {
  isSupported: true,
  unsupportedReason: null,
  finals: [],
  regions: [
    {
      name: "East",
      rounds: [
        {
          key: "roundOf64",
          label: "Round of 64",
          region: "East",
          games: [
            {
              id: "east-r64-1",
              round: "roundOf64",
              label: "1 vs 16",
              region: "East",
              slot: 1,
              sourceGameIds: [null, null],
              entrants: [
                {
                  teamId: "team-a",
                  name: "Alpha",
                  shortName: "Alpha",
                  seed: 1,
                  region: "East",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                },
                {
                  teamId: "team-b",
                  name: "Beta",
                  shortName: "Beta",
                  seed: 16,
                  region: "East",
                  buyerSyndicateId: "focus",
                  buyerSyndicateName: "Mothership",
                  buyerColor: "#111111"
                }
              ],
              winnerTeamId: null
            },
            {
              id: "east-r64-2",
              round: "roundOf64",
              label: "8 vs 9",
              region: "East",
              slot: 2,
              sourceGameIds: [null, null],
              entrants: [
                {
                  teamId: "team-c",
                  name: "Gamma",
                  shortName: "Gamma",
                  seed: 8,
                  region: "East",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                },
                {
                  teamId: "team-d",
                  name: "Delta",
                  shortName: "Delta",
                  seed: 9,
                  region: "East",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                }
              ],
              winnerTeamId: null
            }
          ]
        }
      ]
    }
  ]
};

const snapshot: SimulationSnapshot = {
  id: "sim-1",
  sessionId: "session-1",
  provider: "test",
  iterations: 1000,
  generatedAt: new Date().toISOString(),
  teamResults: {},
  matchupMatrix: {
    "team-a": {
      "team-c": 0.32,
      "team-d": 0.19
    }
  }
};

describe("live room helpers", () => {
  it("orders the focus syndicate first and groups operator holdings by spend order", () => {
    const ordered = orderSyndicateBoard(
      [otherSyndicate, focusSyndicate, thirdSyndicate],
      focusSyndicate.id
    );
    const holdings = buildOperatorSyndicateHoldings(soldAssets, ordered);

    expect(ordered.map((syndicate) => syndicate.id)).toEqual(["focus", "other", "third"]);
    expect(holdings[0]?.sales.map((sale) => sale.asset.id)).toEqual(["asset-b", "asset-c"]);
  });

  it("filters viewer ownership groups by search while keeping the focus group highlighted", () => {
    const groups = buildViewerOwnershipGroups(
      soldAssets,
      focusSyndicate,
      [focusSyndicate, otherSyndicate, thirdSyndicate],
      "alp"
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      highlight: false,
      syndicate: { id: "other" }
    });
  });

  it("filters redundant rationale lines from the live board summary", () => {
    const lines = filterRecommendationRationale(
      [
        "Likely bidder pressure is moderate.",
        "Largest collision risk is against Duke.",
        "This team still has live upside."
      ],
      "duke"
    );

    expect(lines).toEqual(["This team still has live upside."]);
  });

  it("derives shared matchup state for the nominated team", () => {
    const nominatedTeam = buildTeam("team-a", "Alpha", 1);

    expect(getFirstRoundMatchup(bracket, nominatedTeam.id)?.opponent.teamId).toBe("team-b");
    expect(getLikelyRound2Matchup(bracket, snapshot, nominatedTeam.id)?.opponent.teamId).toBe(
      "team-c"
    );
    expect(
      deriveAuctionMatchups({
        bracket,
        snapshot,
        nominatedTeam,
        ownedTeamIds: ["team-b", "team-c"]
      })
    ).toMatchObject({
      hasOwnedRoundOneOpponent: true,
      hasOwnedLikelyRoundTwoOpponent: true
    });
  });
});
