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
import type { AuctionDashboard, Syndicate, TeamProjection } from "@/lib/types";

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
        callHeadline: "Waiting on nomination",
        callSupportText: "Set an active team to unlock guidance.",
        callDetailText: null,
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
    expect(markup).toContain("Current spend");
    expect(markup).toContain("Projected final pot");
    expect(markup).toContain("$7,000");
    expect(markup).toContain("$8,800");
  });

  it("renders Nate Silver round reach probabilities with payout-if-reached values", () => {
    globalThis.React = React;

    const mothership = buildSyndicate("focus", "Mothership", "#111111", 4000, 6000);
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
      ledger: [mothership],
      focusSyndicate: mothership
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
        callHeadline: "Pass above $8,000",
        callSupportText: "Model does not support chasing here.",
        callDetailText: null,
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
    expect(markup).toContain("Round return odds against the projected pot");
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
    expect(markup).toContain("Clears by Sweet 16");
    expect(markup).not.toContain("Value at odds");
  });
});
