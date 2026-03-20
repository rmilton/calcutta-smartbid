import { buildDashboard } from "@/lib/dashboard";
import { computeOwnershipExposure } from "@/lib/engine/recommendations";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { deriveAuctionMatchups, deriveProjectedFinalPot, filterRecommendationRationale } from "@/lib/live-room";
import { getBreakEvenStage } from "@/lib/payouts";
import {
  getDefaultFinalFourPairings,
  getDefaultPayoutRules,
  getMockProjections
} from "@/lib/sample-data";
import { AuctionSession } from "@/lib/types";

function buildSession(): AuctionSession {
  const projections = getMockProjections();
  const payoutRules = getDefaultPayoutRules();
  const simulationSnapshot = simulateAuctionField({
    sessionId: "dashboard_test",
    projections,
    payoutRules,
    finalFourPairings: getDefaultFinalFourPairings(),
    iterations: 1000,
    provider: "mock",
    seed: "dashboard-seed"
  });

  return {
    id: "dashboard_test",
    name: "Dashboard Test",
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
        name: "Mothership",
        color: "#3d7a0a",
        spend: 4200,
        remainingBankroll: 50800,
        estimatedBudget: 55000,
        budgetConfidence: "high",
        budgetNotes: "",
        estimatedRemainingBudget: 50800,
        estimateExceeded: false,
        ownedTeamIds: ["duke"],
        portfolioExpectedValue: 0
      },
      {
        id: "syn_other",
        name: "Riverboat",
        color: "#2563eb",
        spend: 2500,
        remainingBankroll: 47500,
        estimatedBudget: 50000,
        budgetConfidence: "medium",
        budgetNotes: "",
        estimatedRemainingBudget: 47500,
        estimateExceeded: false,
        ownedTeamIds: [],
        portfolioExpectedValue: 0
      }
    ],
    baseProjections: projections,
    projections,
    projectionOverrides: {},
    teamClassifications: {
      alabama: {
        teamId: "alabama",
        classification: "must-have",
        updatedAt: new Date().toISOString()
      }
    },
    teamNotes: {
      alabama: {
        teamId: "alabama",
        note: "Strong guard play",
        updatedAt: new Date().toISOString()
      }
    },
    projectionProvider: "mock",
    activeDataSource: {
      key: "builtin:mock",
      name: "Built-in Mock Field",
      kind: "builtin"
    },
    finalFourPairings: getDefaultFinalFourPairings(),
    liveState: {
      nominatedTeamId: "alabama",
      currentBid: 1800,
      soldTeamIds: ["duke"],
      lastUpdatedAt: new Date().toISOString()
    },
    purchases: [
      {
        id: "purchase_1",
        sessionId: "dashboard_test",
        teamId: "duke",
        buyerSyndicateId: "syn_focus",
        price: 2400,
        createdAt: new Date().toISOString()
      }
    ],
    simulationSnapshot
  } as AuctionSession;
}

describe("buildDashboard audience split", () => {
  it("keeps the operator dashboard intact and trims the viewer payload", () => {
    const session = buildSession();
    const operator = buildDashboard(session, "local");
    const viewer = buildDashboard(session, "local", {
      audience: "viewer"
    });

    expect("analysis" in operator).toBe(true);
    expect("recommendation" in operator).toBe(true);
    expect("viewerAuction" in viewer).toBe(true);
    expect("analysis" in viewer).toBe(false);
    expect("recommendation" in viewer).toBe(false);
    expect("lastPurchase" in viewer).toBe(false);
    expect("projectionOverrideCount" in viewer).toBe(false);
    expect("simulationSnapshot" in viewer.session).toBe(false);
    expect(viewer.session.auctionStatus).toBe("active");
    expect(JSON.stringify(viewer)).not.toContain("matchupMatrix");
    expect(JSON.stringify(viewer)).not.toContain("teamResults");
    expect(JSON.stringify(viewer).length).toBeLessThan(JSON.stringify(operator).length);
  });

  it("derives viewer-facing auction details from the full session model", () => {
    const session = buildSession();
    const operator = buildDashboard(session, "local");
    const viewer = buildDashboard(session, "local", {
      audience: "viewer"
    });
    const nominatedTeam = operator.nominatedTeam;

    expect(viewer.viewerAuction.filteredRationale).toEqual(
      filterRecommendationRationale(
        operator.recommendation?.rationale,
        operator.recommendation?.forcedPassConflictTeamId
      )
    );
    expect(viewer.viewerAuction.breakEvenStage).toBe(
      nominatedTeam ? getBreakEvenStage(session.liveState.currentBid, session.payoutRules) : null
    );
    expect(viewer.viewerAuction.ownershipConflicts).toEqual(
      computeOwnershipExposure(
        operator.session,
        operator.nominatedAsset?.projectionIds ?? (nominatedTeam ? [nominatedTeam.id] : []),
        operator.focusSyndicate
      ).likelyConflicts
    );
    expect(viewer.viewerAuction.matchupSummary).toEqual(
      deriveAuctionMatchups({
        bracket: operator.bracket,
        snapshot: operator.session.simulationSnapshot,
        nominatedTeam,
        ownedTeamIds: operator.focusSyndicate.ownedTeamIds
      })
    );
    expect(viewer.viewerAuction.projectedFinalPot).toBe(
      deriveProjectedFinalPot({
        ledger: operator.ledger,
        availableAssets: operator.availableAssets,
        budgetRows: operator.analysis.budgetRows,
        liveAssetId: session.liveState.nominatedAssetId ?? "",
        liveBid: session.liveState.currentBid
      })
    );
    expect(viewer.viewerAuction.nominatedTeamClassification).toBe("must-have");
    expect(viewer.viewerAuction.nominatedTeamNote).toBe("Strong guard play");
  });
});
