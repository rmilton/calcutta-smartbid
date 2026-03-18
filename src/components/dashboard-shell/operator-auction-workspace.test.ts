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
import type { AuctionDashboard, Syndicate } from "@/lib/types";

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

describe("OperatorAuctionWorkspace", () => {
  it("shows compact room totals above the syndicate list on the operator board", () => {
    globalThis.React = React;

    const mothership = buildSyndicate("focus", "Mothership", "#111111", 4000, 6000);
    const riverboat = buildSyndicate("other", "Riverboat", "#222222", 3000, 9000);
    const dashboard = {
      availableAssets: [],
      soldAssets: [],
      lastPurchase: null,
      ledger: [mothership, riverboat],
      focusSyndicate: mothership
    } as unknown as AuctionDashboard;

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
        teamLookup: new Map(),
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
    expect(markup).toContain("$15,000");
  });
});
