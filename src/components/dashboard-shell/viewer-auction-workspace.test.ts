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
  AuctionDashboard,
  BidRecommendation,
  MatchupConflict,
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
      session: {
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
      ledger: [mothership, riverboat]
    } as unknown as AuctionDashboard;

    const markup = renderToStaticMarkup(
      createElement(ViewerAuctionWorkspace, {
        dashboard,
        currentBid: 500,
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
        ])
      })
    );

    expect(markup).toContain("Live Decision Board");
    expect(markup).toContain("Current bid");
    expect(markup).toContain("Recent Sales");
    expect(markup).toContain("Ownership Ledger");
    expect(markup).toContain("Round 1 Matchup: 1-seed Duke");
    expect(markup).toContain("Most likely Round 2: 5-seed Oregon (76.5%)");
    expect(markup).toContain("Hide");
    expect(markup).toContain("1 team");
    expect(markup).not.toContain("Keep bidding");
    expect(markup).not.toContain("$1,200");
    expect(markup).not.toContain("Syndicate Board");
    expect(markup).not.toContain("Funding status");
    expect(markup).not.toContain("Teams remaining to sell");
  });
});
