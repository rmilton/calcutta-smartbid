import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/team-classification-badge", () => ({
  TeamClassificationBadge: ({ classification }: { classification: string }) =>
    createElement("span", null, classification)
}));

vi.mock("@/components/team-logo", () => ({
  TeamLogo: ({ teamName }: { teamName: string }) => createElement("span", null, teamName),
  AssetLogo: ({ asset }: { asset: { label: string } }) => createElement("span", null, asset.label)
}));

import { OperatorAuctionWorkspace } from "@/components/dashboard-shell/operator-auction-workspace";
import type { AuctionAsset, AuctionDashboard, SoldAssetSummary, Syndicate, TeamProjection } from "@/lib/types";

function buildSyndicate(
  id: string,
  name: string,
  color: string,
  spend: number,
  estimatedBudget: number
): Syndicate {
  return {
    id,
    name,
    color,
    spend,
    remainingBankroll: Math.max(estimatedBudget - spend, 0),
    estimatedBudget,
    budgetConfidence: "high",
    budgetNotes: "",
    estimatedRemainingBudget: estimatedBudget - spend,
    estimateExceeded: spend > estimatedBudget,
    ownedTeamIds: [],
    portfolioExpectedValue: 0
  };
}

function buildDashboard(overrides?: Partial<AuctionDashboard>): AuctionDashboard {
  const session = {
    payoutRules: {
      roundOf64: 1,
      roundOf32: 1.5,
      sweet16: 2.5,
      elite8: 3,
      finalFour: 4,
      champion: 4,
      projectedPot: 220000
    }
  };

  return {
    session,
    focusSyndicate: buildSyndicate("focus", "Mothership", "#111111", 0, 0),
    nominatedAsset: null,
    nominatedTeam: null,
    availableAssets: [],
    soldAssets: [],
    availableTeams: [],
    soldTeams: [],
    ledger: [],
    analysis: {
      budgetRows: []
    } as AuctionDashboard["analysis"],
    bracket: {} as AuctionDashboard["bracket"],
    recommendation: null,
    lastPurchase: null,
    projectionOverrideCount: 0,
    storageBackend: "local",
    ...overrides
  } as unknown as AuctionDashboard;
}

function buildTeam(id: string, name: string, region: string, seed: number): TeamProjection {
  return {
    id,
    name,
    shortName: name,
    region,
    seed,
    rating: 90,
    offense: 118,
    defense: 96,
    tempo: 67,
    source: "test"
  };
}

function buildAsset(team: TeamProjection): AuctionAsset {
  return {
    id: `asset_${team.id}`,
    label: team.name,
    type: "single_team",
    region: team.region,
    seed: team.seed,
    seedRange: null,
    memberTeamIds: [team.id],
    projectionIds: [team.id],
    members: [
      {
        id: team.id,
        type: "team",
        label: team.name,
        region: team.region,
        seed: team.seed,
        regionSlot: `${team.region}-${team.seed}`,
        teamIds: [team.id],
        projectionIds: [team.id],
        unresolved: false
      }
    ],
    unresolved: false
  };
}

describe("OperatorAuctionWorkspace", () => {
  it("shows room totals using remaining-asset forecast instead of syndicate budget ceilings", () => {
    globalThis.React = React;

    const mothership = buildSyndicate("focus", "Mothership", "#111111", 4000, 6000);
    const riverboat = buildSyndicate("other", "Riverboat", "#222222", 3000, 9000);
    const remainingTeam: TeamProjection = {
      id: "remaining",
      name: "Drake",
      shortName: "DRK",
      region: "West",
      seed: 11,
      rating: 88,
      offense: 112,
      defense: 99,
      tempo: 67,
      source: "test"
    };
    const remainingAsset = {
      id: "asset_remaining",
      label: "Drake",
      type: "single_team",
      region: "West",
      seed: 11,
      seedRange: null,
      memberTeamIds: ["remaining"],
      projectionIds: ["remaining"],
      members: [
        {
          id: "remaining",
          type: "team",
          label: "Drake",
          region: "West",
          seed: 11,
          regionSlot: "West-11",
          teamIds: ["remaining"],
          projectionIds: ["remaining"],
          unresolved: false
        }
      ],
      unresolved: false
    } as const;
    const dashboard = buildDashboard({
      availableAssets: [remainingAsset],
      ledger: [mothership, riverboat],
      focusSyndicate: mothership,
      analysis: {
        budgetRows: [
          {
            teamId: "remaining",
            teamName: "Drake",
            classification: null,
            rank: 1,
            percentile: 0.5,
            convictionScore: 0.5,
            investableShare: 0.05,
            openingBid: 1200,
            targetBid: 1800,
            maxBid: 2400,
            tier: "depth"
          }
        ]
      } as AuctionDashboard["analysis"]
    });

    const markup = renderToStaticMarkup(
      createElement(OperatorAuctionWorkspace, {
        dashboard,
        recommendation: null,
        notice: null,
        error: null,
        selectedAssetId: "",
        bidInputValue: "",
        parsedBidInputValue: 0,
        buyerId: mothership.id,
        currentBid: 0,
        isUndoingPurchase: false,
        teamSelectRef: { current: null },
        bidInputRef: { current: null },
        onAssetChange: () => undefined,
        onBidInputChange: () => undefined,
        onBidBlur: () => undefined,
        onBidKeyDown: () => undefined,
        onBuyerChange: () => undefined,
        onUndoPurchase: () => undefined,
        onRecordPurchase: () => undefined,
        lastPurchaseTeamName: null,
        lastPurchaseBuyerName: null,
        signalLabel: null,
        nominatedAsset: null,
        nominatedTeam: null,
        nominatedTeamClassification: null,
        nominatedTeamNote: null,
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        breakEvenStage: null,
        targetBidDisplay: "--",
        maxBidDisplay: "--",
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup: new Map([["remaining", remainingTeam]]),
        forcedPassConflictTeamId: null,
        projectedBaseRoom: 0,
        projectedStretchRoom: 0,
        titleOdds: 0,
        operatorSyndicateHoldings: [
          { syndicate: mothership, sales: [] },
          { syndicate: riverboat, sales: [] }
        ],
        expandedSyndicateIds: [],
        onToggleSyndicate: () => undefined,
        onExpandAll: () => undefined,
        onCollapseAll: () => undefined,
        recentSales: [],
        syndicateLookup: new Map([
          [mothership.id, mothership],
          [riverboat.id, riverboat]
        ]),
        focusFundingImpliedSharePrice: null
      })
    );

    expect(markup).toContain("Syndicate Board");
    expect(markup).toContain("1 Team Remaining");
    expect(markup).toContain("Current spend");
    expect(markup).toContain("Projected final pot");
    expect(markup).toContain("$7,000");
    expect(markup).toContain("$8,800");
  });

  it("renders Nate Silver round reach probabilities with payout-if-reached values", () => {
    globalThis.React = React;

    const mothership = buildSyndicate("focus", "Mothership", "#111111", 212000, 220000);
    const nominatedTeam: TeamProjection = {
      id: "purdue",
      name: "Purdue",
      shortName: "PUR",
      region: "West",
      seed: 2,
      rating: 0.97,
      offense: 120,
      defense: 95,
      tempo: 67,
      source: "test",
      nateSilverProjection: {
        seed: "2",
        roundOf64: 1,
        roundOf32: 0.973,
        sweet16: 0.749,
        elite8: 0.462,
        finalFour: 0.18,
        championshipGame: 0.083,
        champion: 0.041
      }
    };
    const nominatedAsset = {
      id: "asset_purdue",
      label: "Purdue",
      type: "single_team",
      region: "West",
      seed: 2,
      seedRange: null,
      memberTeamIds: ["purdue"],
      projectionIds: ["purdue"],
      members: [
        {
          id: "purdue",
          type: "team",
          label: "Purdue",
          region: "West",
          seed: 2,
          regionSlot: "West-2",
          teamIds: ["purdue"],
          projectionIds: ["purdue"],
          unresolved: false
        }
      ],
      unresolved: false
    } as const;
    const dashboard = buildDashboard({
      availableAssets: [nominatedAsset],
      ledger: [mothership],
      focusSyndicate: mothership,
      analysis: {
        budgetRows: []
      } as AuctionDashboard["analysis"]
    });

    const markup = renderToStaticMarkup(
      createElement(OperatorAuctionWorkspace, {
        dashboard,
        recommendation: null,
        notice: null,
        error: null,
        selectedAssetId: nominatedAsset.id,
        bidInputValue: "8000",
        parsedBidInputValue: 8000,
        buyerId: mothership.id,
        currentBid: 8000,
        isUndoingPurchase: false,
        teamSelectRef: { current: null },
        bidInputRef: { current: null },
        onAssetChange: () => undefined,
        onBidInputChange: () => undefined,
        onBidBlur: () => undefined,
        onBidKeyDown: () => undefined,
        onBuyerChange: () => undefined,
        onUndoPurchase: () => undefined,
        onRecordPurchase: () => undefined,
        lastPurchaseTeamName: null,
        lastPurchaseBuyerName: null,
        signalLabel: null,
        nominatedAsset,
        nominatedTeam,
        nominatedTeamClassification: null,
        nominatedTeamNote: null,
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        breakEvenStage: "sweet16",
        targetBidDisplay: "--",
        maxBidDisplay: "--",
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup: new Map([["purdue", nominatedTeam]]),
        forcedPassConflictTeamId: null,
        projectedBaseRoom: 0,
        projectedStretchRoom: 0,
        titleOdds: 0.041,
        operatorSyndicateHoldings: [{ syndicate: mothership, sales: [] }],
        expandedSyndicateIds: [],
        onToggleSyndicate: () => undefined,
        onExpandAll: () => undefined,
        onCollapseAll: () => undefined,
        recentSales: [],
        syndicateLookup: new Map([[mothership.id, mothership]]),
        focusFundingImpliedSharePrice: null
      })
    );

    expect(markup).toContain("Nate Silver Path");
    expect(markup).toContain("Round return odds against the projected final pot");
    expect(markup).toContain("Payout if reached");
    expect(markup).not.toContain("Round of 64");
    expect(markup).toContain("Round of 32");
    expect(markup).toContain("Championship");
    expect(markup).toContain("Champion");
    expect(markup).toContain("97.3%");
    expect(markup).toContain("74.9%");
    expect(markup).toContain("18.0%");
    expect(markup).toContain("4.1%");
    expect(markup).toContain("$2,200");
    expect(markup).toContain("$5,500");
    expect(markup).toContain("$11,000");
    expect(markup).toContain("$17,600");
    expect(markup).toContain("$26,400");
    expect(markup).toContain("$35,200");
    expect(markup).toContain("Needs Elite 8");
    expect((markup.match(/nate-silver-board__cell--clears-bid/g) ?? []).length).toBe(3);
    expect(markup).not.toContain("Value at odds");
  });

  it("switches to an auction-complete board with portfolio recap when every asset is sold", () => {
    globalThis.React = React;

    const mothership = buildSyndicate("focus", "Mothership", "#111111", 14000, 16000);
    const riverboat = buildSyndicate("other", "Riverboat", "#222222", 11000, 12000);
    const duke = buildTeam("duke", "Duke", "East", 1);
    const houston = buildTeam("houston", "Houston", "Midwest", 2);
    const auburn = buildTeam("auburn", "Auburn", "South", 1);
    const dukeAsset = buildAsset(duke);
    const houstonAsset = buildAsset(houston);
    const auburnAsset = buildAsset(auburn);
    const soldAssets: SoldAssetSummary[] = [
      {
        asset: dukeAsset,
        price: 9200,
        buyerSyndicateId: mothership.id
      },
      {
        asset: houstonAsset,
        price: 4800,
        buyerSyndicateId: mothership.id
      },
      {
        asset: auburnAsset,
        price: 11000,
        buyerSyndicateId: riverboat.id
      }
    ];
    const dashboard = buildDashboard({
      session: {
        payoutRules: {
          roundOf64: 1,
          roundOf32: 1.5,
          sweet16: 2.5,
          elite8: 3,
          finalFour: 4,
          champion: 4,
          projectedPot: 220000
        },
        auctionAssets: [dukeAsset, houstonAsset, auburnAsset],
        simulationSnapshot: {
          id: "sim-1",
          sessionId: "session-1",
          provider: "test",
          iterations: 1000,
          generatedAt: "2026-03-18T00:00:00.000Z",
          teamResults: {
            [duke.id]: {
              teamId: duke.id,
              roundProbabilities: {
                roundOf64: 1,
                roundOf32: 0.95,
                sweet16: 0.78,
                elite8: 0.5,
                finalFour: 0.32,
                champion: 0.16
              },
              expectedGrossPayout: 14000,
              confidenceBand: [5000, 25000],
              likelyConflicts: []
            },
            [houston.id]: {
              teamId: houston.id,
              roundProbabilities: {
                roundOf64: 1,
                roundOf32: 0.88,
                sweet16: 0.63,
                elite8: 0.35,
                finalFour: 0.18,
                champion: 0.08
              },
              expectedGrossPayout: 9800,
              confidenceBand: [3000, 17000],
              likelyConflicts: []
            },
            [auburn.id]: {
              teamId: auburn.id,
              roundProbabilities: {
                roundOf64: 1,
                roundOf32: 0.91,
                sweet16: 0.68,
                elite8: 0.4,
                finalFour: 0.21,
                champion: 0.1
              },
              expectedGrossPayout: 11200,
              confidenceBand: [3500, 18000],
              likelyConflicts: []
            }
          },
          matchupMatrix: {}
        }
      } as AuctionDashboard["session"],
      ledger: [mothership, riverboat],
      focusSyndicate: {
        ...mothership,
        ownedTeamIds: [duke.id, houston.id]
      },
      soldAssets,
      recentSales: soldAssets,
      availableAssets: [],
      soldTeams: [
        { team: duke, price: 9200, buyerSyndicateId: mothership.id },
        { team: houston, price: 4800, buyerSyndicateId: mothership.id },
        { team: auburn, price: 11000, buyerSyndicateId: riverboat.id }
      ],
      availableTeams: [],
      nominatedAsset: null,
      nominatedTeam: null
    });

    const teamLookup = new Map([
      [duke.id, duke],
      [houston.id, houston],
      [auburn.id, auburn]
    ]);
    const syndicateLookup = new Map([
      [mothership.id, mothership],
      [riverboat.id, riverboat]
    ]);

    const markup = renderToStaticMarkup(
      createElement(OperatorAuctionWorkspace, {
        dashboard,
        recommendation: null,
        notice: null,
        error: null,
        selectedAssetId: "",
        bidInputValue: "",
        parsedBidInputValue: 0,
        buyerId: mothership.id,
        currentBid: 0,
        isUndoingPurchase: false,
        teamSelectRef: { current: null },
        bidInputRef: { current: null },
        onAssetChange: () => undefined,
        onBidInputChange: () => undefined,
        onBidBlur: () => undefined,
        onBidKeyDown: () => undefined,
        onBuyerChange: () => undefined,
        onUndoPurchase: () => undefined,
        onRecordPurchase: () => undefined,
        lastPurchaseTeamName: null,
        lastPurchaseBuyerName: null,
        signalLabel: null,
        nominatedAsset: null,
        nominatedTeam: null,
        nominatedTeamClassification: null,
        nominatedTeamNote: null,
        nominatedMatchup: null,
        likelyRound2Matchup: null,
        hasOwnedRoundOneOpponent: false,
        hasOwnedLikelyRoundTwoOpponent: false,
        breakEvenStage: null,
        targetBidDisplay: "--",
        maxBidDisplay: "--",
        filteredRationale: [],
        ownershipConflicts: [],
        teamLookup,
        forcedPassConflictTeamId: null,
        projectedBaseRoom: 0,
        projectedStretchRoom: 0,
        titleOdds: 0,
        operatorSyndicateHoldings: [
          {
            syndicate: {
              ...mothership,
              ownedTeamIds: [duke.id, houston.id]
            },
            sales: soldAssets.filter((sale) => sale.buyerSyndicateId === mothership.id)
          },
          {
            syndicate: {
              ...riverboat,
              ownedTeamIds: [auburn.id]
            },
            sales: soldAssets.filter((sale) => sale.buyerSyndicateId === riverboat.id)
          }
        ],
        expandedSyndicateIds: [],
        onToggleSyndicate: () => undefined,
        onExpandAll: () => undefined,
        onCollapseAll: () => undefined,
        recentSales: soldAssets,
        syndicateLookup,
        focusFundingImpliedSharePrice: null
      })
    );

    expect(markup).toContain("Auction Complete");
    expect(markup).toContain("Books closed");
    expect(markup).toContain("Portfolio locked in");
    expect(markup).toContain("Best bargain");
    expect(markup).toContain("Rooting Guide");
    expect(markup).toContain("Final pot");
    expect(markup).toContain("$25,000");
    expect(markup).toContain("2/3");
    expect(markup).toContain("Duke");
    expect(markup).toContain("Houston");
    expect(markup).not.toContain("Waiting for selection");
  });
});
