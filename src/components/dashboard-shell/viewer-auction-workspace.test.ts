import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";

vi.mock("@/components/team-classification-badge", () => ({
  TeamClassificationBadge: ({ classification }: { classification: string }) =>
    createElement("span", null, classification)
}));

import { ViewerAuctionWorkspace } from "@/components/dashboard-shell/viewer-auction-workspace";
import type {
  AuctionAsset,
  BidRecommendation,
  MatchupConflict,
  SoldAssetSummary,
  Syndicate,
  TeamProjection,
  ViewerDashboard
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

function buildAsset(id: string, label: string, teamId: string, seed: number): AuctionAsset {
  return {
    id,
    label,
    type: "single_team",
    region: "East",
    seed,
    seedRange: null,
    memberTeamIds: [teamId],
    projectionIds: [teamId],
    members: [
      {
        id: teamId,
        type: "team",
        label,
        region: "East",
        seed,
        regionSlot: `East-${seed}`,
        teamIds: [teamId],
        projectionIds: [teamId],
        unresolved: false
      }
    ],
    unresolved: false
  };
}

function buildBundleAsset(): AuctionAsset {
  return {
    id: "asset-west-bundle",
    label: "West 13-16 Seeds",
    type: "seed_bundle",
    region: "West",
    seed: 13,
    seedRange: [13, 16],
    memberTeamIds: ["team-hawaii", "team-kennesaw", "team-queens", "team-long-island"],
    projectionIds: ["team-hawaii", "team-kennesaw", "team-queens", "team-long-island"],
    members: [
      {
        id: "team-hawaii",
        type: "team",
        label: "Hawaii",
        region: "West",
        seed: 13,
        regionSlot: "West-13",
        teamIds: ["team-hawaii"],
        projectionIds: ["team-hawaii"],
        unresolved: false
      },
      {
        id: "team-kennesaw",
        type: "team",
        label: "Kennesaw State",
        region: "West",
        seed: 14,
        regionSlot: "West-14",
        teamIds: ["team-kennesaw"],
        projectionIds: ["team-kennesaw"],
        unresolved: false
      },
      {
        id: "team-queens",
        type: "team",
        label: "Queens (N.C.)",
        region: "West",
        seed: 15,
        regionSlot: "West-15",
        teamIds: ["team-queens"],
        projectionIds: ["team-queens"],
        unresolved: false
      },
      {
        id: "team-long-island",
        type: "team",
        label: "Long Island",
        region: "West",
        seed: 16,
        regionSlot: "West-16",
        teamIds: ["team-long-island"],
        projectionIds: ["team-long-island"],
        unresolved: false
      }
    ],
    unresolved: false
  };
}

function buildSyndicate(id: string, name: string, color: string): Syndicate {
  return {
    id,
    name,
    color,
    spend: 1200,
    remainingBankroll: 0,
    estimatedBudget: 5000,
    budgetConfidence: "high",
    budgetNotes: "",
    estimatedRemainingBudget: 3800,
    estimateExceeded: false,
    ownedTeamIds: [],
    portfolioExpectedValue: 900
  };
}

describe("ViewerAuctionWorkspace", () => {
  const payoutRules = {
    roundOf64: 1,
    roundOf32: 1.5,
    sweet16: 2.5,
    elite8: 3,
    finalFour: 4,
    champion: 4,
    projectedPot: 220000
  } as const;

  it("renders the simplified viewer surface with the shared decision-board structure", () => {
    const team = buildTeam("team-arizona", "Arizona", 4);
    const conflictTeam = buildTeam("team-duke", "Duke", 1);
    const asset = buildAsset("asset-arizona", "Arizona", team.id, team.seed);
    const mothership = buildSyndicate("focus", "Mothership", "#111111");
    const riverboat = buildSyndicate("other", "Riverboat", "#222222");
    const soldFeed: SoldAssetSummary[] = [
      {
        asset,
        price: 500,
        buyerSyndicateId: riverboat.id
      }
    ];
    const ownershipConflicts: MatchupConflict[] = [
      {
        opponentId: conflictTeam.id,
        probability: 0.496,
        earliestRound: "sweet16"
      }
    ];
    const recommendation = {
      teamId: team.id,
      assetId: asset.id,
      currentBid: 500,
      openingBid: 1800,
      plannedBudgetAllocation: 2450,
      targetBid: 2783,
      maxBid: 3647,
      expectedGrossPayout: 5793,
      expectedNetValue: 5293,
      valueGap: 3147,
      confidenceBand: [4200, 6500],
      stoplight: "buy",
      ownershipPenalty: 500,
      bankrollHeadroom: 4000,
      baseBudgetHeadroom: 2800,
      stretchBudgetHeadroom: 3600,
      fundingStatus: "safe",
      concentrationScore: 0.18,
      forcedPassConflictTeamId: null,
      forcedPassReason: null,
      drivers: [],
      rationale: [
        "Arizona carries a 0.539 conviction score with 2% relative pricing weight on the current board.",
        "Portfolio overlap penalty is 0.59 with 3 live conflict signals."
      ]
    } satisfies BidRecommendation;
    const dashboard = {
      availableAssets: [asset],
      soldAssets: soldFeed,
      session: {
        payoutRules,
        teamClassifications: {
          [team.id]: {
            teamId: team.id,
            classification: "must-have",
            updatedAt: "2026-03-15T00:00:00.000Z"
          }
        },
        teamNotes: {
          [team.id]: {
            teamId: team.id,
            note: "Preferred East-region anchor.",
            updatedAt: "2026-03-15T00:00:00.000Z"
          }
        }
      },
      nominatedAsset: asset,
      nominatedTeam: team,
      focusSyndicate: mothership,
      ledger: [mothership, riverboat],
      viewerAuction: {
        projectedFinalPot: 31200
      }
    } as unknown as ViewerDashboard;

    const markup = renderToStaticMarkup(
      createElement(ViewerAuctionWorkspace, {
        dashboard,
        currentBid: 500,
        breakEvenStage: null,
        nominatedMatchup: {
          opponent: {
            teamId: conflictTeam.id,
            name: conflictTeam.name,
            shortName: conflictTeam.shortName,
            seed: conflictTeam.seed,
            region: conflictTeam.region,
            buyerSyndicateId: mothership.id,
            buyerSyndicateName: mothership.name,
            buyerColor: mothership.color
          }
        },
        likelyRound2Matchup: {
          opponent: {
            teamId: "team-oregon",
            name: "Oregon",
            shortName: "Oregon",
            seed: 5,
            region: "East",
            buyerSyndicateId: null,
            buyerSyndicateName: null,
            buyerColor: null
          },
          probability: 0.765
        },
        hasOwnedRoundOneOpponent: true,
        hasOwnedLikelyRoundTwoOpponent: false,
        filteredRationale: recommendation.rationale,
        ownershipConflicts,
        teamLookup: new Map([
          [team.id, team],
          [conflictTeam.id, conflictTeam]
        ]),
        forcedPassConflictTeamId: null,
        ownershipSearch: "",
        onOwnershipSearchChange: () => undefined,
        ownershipGroups: [
          {
            syndicate: riverboat,
            sales: soldFeed,
            highlight: false
          }
        ],
        soldFeed,
        syndicateLookup: new Map([
          [mothership.id, mothership],
          [riverboat.id, riverboat]
        ]),
        isAuctionMarkedComplete: false
      })
    );

    expect(markup).toContain("Live Decision Board");
    expect(markup).toContain("1 Team Remaining");
    expect(markup).toContain("Nate Silver Path");
    expect(markup).toContain("Current bid");
    expect(markup).toContain("Recent Sales");
    expect(markup).toContain("Ownership Ledger");
    expect(markup).toContain("Round 1 Matchup:");
    expect(markup).toContain("1-seed Duke");
    expect(markup).toContain("Most likely Round 2:");
    expect(markup).toContain("5-seed Oregon");
    expect(markup).toContain("(76.5%)");
    expect(markup).toContain("Hide");
    expect(markup).toContain("1 team");
    expect(markup).not.toContain("Keep bidding");
    expect(markup).not.toContain("$1,200");
    expect(markup).not.toContain("Syndicate Board");
    expect(markup).not.toContain("Funding status");
  });

  it("renders selection language in the empty decision-board state", () => {
    const mothership = buildSyndicate("focus", "Mothership", "#111111");
    const dashboard = {
      availableAssets: [],
      soldAssets: [],
      session: {
        payoutRules,
        teamClassifications: {},
        teamNotes: {}
      },
      nominatedAsset: null,
      nominatedTeam: null,
      focusSyndicate: mothership,
      ledger: [mothership],
      viewerAuction: {
        projectedFinalPot: 0
      }
    } as unknown as ViewerDashboard;

    const markup = renderToStaticMarkup(
      createElement(ViewerAuctionWorkspace, {
        dashboard,
        currentBid: 0,
        breakEvenStage: null,
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup: new Map(),
        forcedPassConflictTeamId: null,
        ownershipSearch: "",
        onOwnershipSearchChange: () => undefined,
        ownershipGroups: [],
        soldFeed: [],
        syndicateLookup: new Map([[mothership.id, mothership]]),
        isAuctionMarkedComplete: false
      })
    );

    expect(markup).toContain("Awaiting selection");
    expect(markup).toContain("Waiting for selection");
    expect(markup).toContain("Awaiting bid");
    expect(markup).not.toContain("Needs Round of 32");
    expect(markup).toContain(
      "The next active team will take over this board when the operator makes a selection."
    );
  });

  it("marks bundle heroes for the stacked bid layout", () => {
    const team = buildTeam("team-hawaii", "Hawaii", 13);
    const asset = buildBundleAsset();
    const mothership = buildSyndicate("focus", "Mothership", "#111111");
    const dashboard = {
      availableAssets: [asset],
      soldAssets: [],
      session: {
        payoutRules,
        teamClassifications: {},
        teamNotes: {}
      },
      nominatedAsset: asset,
      nominatedTeam: team,
      focusSyndicate: mothership,
      ledger: [mothership],
      viewerAuction: {
        projectedFinalPot: 18400
      }
    } as unknown as ViewerDashboard;

    const markup = renderToStaticMarkup(
      createElement(ViewerAuctionWorkspace, {
        dashboard,
        currentBid: 0,
        breakEvenStage: null,
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup: new Map([[team.id, team]]),
        forcedPassConflictTeamId: null,
        ownershipSearch: "",
        onOwnershipSearchChange: () => undefined,
        ownershipGroups: [],
        soldFeed: [],
        syndicateLookup: new Map([[mothership.id, mothership]]),
        isAuctionMarkedComplete: false
      })
    );

    expect(markup).toContain("decision-panel__hero-topline--stacked");
  });

  it("renders Nate Silver round reach probabilities on the viewer board", () => {
    const team = {
      ...buildTeam("team-houston", "Houston", 1),
      nateSilverProjection: {
        seed: "1",
        roundOf64: 1,
        roundOf32: 0.914,
        sweet16: 0.429,
        elite8: 0.133,
        finalFour: 0.045,
        championshipGame: 0.017,
        champion: 0.005
      }
    } satisfies TeamProjection;
    const asset = buildAsset("asset-houston", "Houston", team.id, team.seed);
    const mothership = {
      ...buildSyndicate("focus", "Mothership", "#111111"),
      spend: 212000,
      estimatedRemainingBudget: 8000
    };
    const dashboard = {
      availableAssets: [asset],
      soldAssets: [],
      session: {
        payoutRules: {
          ...payoutRules
        },
        teamClassifications: {},
        teamNotes: {}
      },
      nominatedAsset: asset,
      nominatedTeam: team,
      focusSyndicate: mothership,
      ledger: [mothership],
      viewerAuction: {
        projectedFinalPot: 220000
      }
    } as unknown as ViewerDashboard;

    const markup = renderToStaticMarkup(
      createElement(ViewerAuctionWorkspace, {
        dashboard,
        currentBid: 8000,
        breakEvenStage: "sweet16",
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup: new Map([[team.id, team]]),
        forcedPassConflictTeamId: null,
        ownershipSearch: "",
        onOwnershipSearchChange: () => undefined,
        ownershipGroups: [],
        soldFeed: [],
        syndicateLookup: new Map([[mothership.id, mothership]]),
        isAuctionMarkedComplete: false
      })
    );

    expect(markup).toContain("Round return odds against the projected final pot");
    expect(markup).toContain("Payout if reached");
    expect(markup).toContain("91.4%");
    expect(markup).toContain("42.9%");
    expect(markup).toContain("13.3%");
    expect(markup).toContain("4.5%");
    expect(markup).toContain("1.7%");
    expect(markup).toContain("0.5%");
    expect(markup).toContain("$2,200");
    expect(markup).toContain("$5,500");
    expect(markup).toContain("$11,000");
    expect(markup).toContain("$17,600");
    expect(markup).toContain("$26,400");
    expect(markup).toContain("$35,200");
    expect(markup).toContain("Needs Elite 8");
    expect((markup.match(/nate-silver-board__cell--needs-depth/g) ?? []).length).toBe(3);
    expect((markup.match(/nate-silver-board__cell--clears-bid/g) ?? []).length).toBe(4);
  });

  it("renders an auction-complete viewer board without cost or equity summaries", () => {
    const duke = buildTeam("team-duke", "Duke", 1);
    const gonzaga = buildTeam("team-gonzaga", "Gonzaga", 4);
    const auburn = buildTeam("team-auburn", "Auburn", 2);
    const dukeAsset = buildAsset("asset-duke", "Duke", duke.id, duke.seed);
    const gonzagaAsset = buildAsset("asset-gonzaga", "Gonzaga", gonzaga.id, gonzaga.seed);
    const auburnAsset = buildAsset("asset-auburn", "Auburn", auburn.id, auburn.seed);
    const mothership = buildSyndicate("focus", "Mothership", "#111111");
    const riverboat = buildSyndicate("other", "Riverboat", "#222222");
    const soldAssets: SoldAssetSummary[] = [
      {
        asset: dukeAsset,
        price: 9200,
        buyerSyndicateId: mothership.id
      },
      {
        asset: gonzagaAsset,
        price: 4800,
        buyerSyndicateId: mothership.id
      },
      {
        asset: auburnAsset,
        price: 11000,
        buyerSyndicateId: riverboat.id
      }
    ];
    const dashboard = {
      availableAssets: [],
      session: {
        payoutRules,
        auctionAssets: [dukeAsset, gonzagaAsset, auburnAsset],
        teamClassifications: {},
        teamNotes: {}
      },
      nominatedAsset: null,
      nominatedTeam: null,
      soldAssets,
      focusSyndicate: mothership,
      ledger: [mothership, riverboat],
      viewerAuction: {
        projectedFinalPot: 25000
      }
    } as unknown as ViewerDashboard;

    const markup = renderToStaticMarkup(
      createElement(ViewerAuctionWorkspace, {
        dashboard,
        currentBid: 0,
        breakEvenStage: null,
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup: new Map([
          [duke.id, duke],
          [gonzaga.id, gonzaga],
          [auburn.id, auburn]
        ]),
        forcedPassConflictTeamId: null,
        ownershipSearch: "",
        onOwnershipSearchChange: () => undefined,
        ownershipGroups: [
          {
            syndicate: mothership,
            sales: soldAssets.filter((sale) => sale.buyerSyndicateId === mothership.id),
            highlight: true
          },
          {
            syndicate: riverboat,
            sales: soldAssets.filter((sale) => sale.buyerSyndicateId === riverboat.id),
            highlight: false
          }
        ],
        soldFeed: soldAssets,
        syndicateLookup: new Map([
          [mothership.id, mothership],
          [riverboat.id, riverboat]
        ]),
        isAuctionMarkedComplete: true
      })
    );

    expect(markup).toContain("Auction Complete");
    expect(markup).toContain("Books closed");
    expect(markup).toContain("Marked complete");
    expect(markup).toContain("Team Highlights");
    expect(markup).toContain("Rooting Guide");
    expect(markup).toContain("Assets sold");
    expect(markup).toContain("3/3");
    expect(markup).toContain("Lead sweat");
    expect(markup).toContain("Sleeper watch");
    expect(markup).toContain("Duke");
    expect(markup).toContain("Gonzaga");
    expect(markup).not.toContain("Current bid");
    expect(markup).not.toContain("Final pot");
    expect(markup).not.toContain("Title equity");
    expect(markup).not.toContain("Expected gross");
    expect(markup).not.toContain("$25,000");
  });
});
