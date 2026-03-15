import { buildDashboard } from "@/lib/dashboard";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { buildSessionAnalysisSnapshot } from "@/lib/session-analysis";
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
    sessionId: "session_analysis",
    projections,
    payoutRules,
    finalFourPairings: getDefaultFinalFourPairings(),
    iterations: 1000,
    provider: "mock",
    seed: "session-analysis-seed"
  });

  return {
    id: "session_analysis",
    name: "Analysis Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    archivedByName: null,
    archivedByEmail: null,
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
        spend: 0,
        remainingBankroll: 55000,
        estimatedBudget: 55000,
        budgetConfidence: "high",
        budgetNotes: "",
        estimatedRemainingBudget: 55000,
        estimateExceeded: false,
        ownedTeamIds: [],
        portfolioExpectedValue: 0
      },
      {
        id: "syn_other",
        name: "Riverboat",
        color: "#2563eb",
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
      currentBid: 0,
      soldTeamIds: [],
      lastUpdatedAt: new Date().toISOString()
    },
    purchases: [],
    simulationSnapshot
  };
}

describe("session analysis classifications", () => {
  it("includes team classifications in analysis rows and dashboard payload", () => {
    const session = buildSession();
    const focus = session.syndicates[0];
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const rankingRow = analysis.ranking.find((row) => row.teamId === "alabama");
    const budgetRow = analysis.budgetRows.find((row) => row.teamId === "alabama");
    const dashboard = buildDashboard(session, "local");

    expect(rankingRow?.classification).toBe("must-have");
    expect(rankingRow?.note).toBe("Strong guard play");
    expect(budgetRow?.classification).toBe("must-have");
    expect(dashboard.session.teamClassifications.alabama?.classification).toBe("must-have");
    expect(dashboard.session.teamNotes.alabama?.note).toBe("Strong guard play");
    expect(
      dashboard.analysis.ranking.find((row) => row.teamId === "alabama")?.classification
    ).toBe("must-have");
    expect(dashboard.analysis.ranking.find((row) => row.teamId === "alabama")?.note).toBe(
      "Strong guard play"
    );
  });

  it("keeps unclassified teams null in analysis output", () => {
    const session = buildSession();
    const focus = session.syndicates[0];
    delete session.teamClassifications.alabama;
    delete session.teamNotes.alabama;
    const analysis = buildSessionAnalysisSnapshot(session, focus);

    expect(analysis.ranking.find((row) => row.teamId === "alabama")?.classification).toBeNull();
    expect(analysis.ranking.find((row) => row.teamId === "alabama")?.note).toBeNull();
    expect(analysis.budgetRows.find((row) => row.teamId === "alabama")?.classification).toBeNull();
  });

  it("builds bid guidance for the full available field", () => {
    const session = buildSession();
    const focus = session.syndicates[0];
    session.purchases.push({
      id: "purchase_2",
      sessionId: session.id,
      teamId: "alabama",
      buyerSyndicateId: "syn_other",
      price: 1500,
      createdAt: new Date().toISOString()
    });

    const analysis = buildSessionAnalysisSnapshot(session, focus);

    expect(analysis.budgetRows).toHaveLength(analysis.ranking.length - 1);
    expect(analysis.budgetRows.some((row) => row.teamId === "alabama")).toBe(false);
    expect(analysis.budgetRows.every((row) => row.targetBid > 0)).toBe(true);
  });

  it("anchors top-team bid guidance to simulated value, not just bankroll share", () => {
    const session = buildSession();
    const focus = session.syndicates[0];
    const analysis = buildSessionAnalysisSnapshot(session, focus);
    const alabamaBudget = analysis.budgetRows.find((row) => row.teamId === "alabama");
    const alabamaSimulation = session.simulationSnapshot?.teamResults.alabama;

    expect(alabamaBudget).toBeDefined();
    expect(alabamaSimulation).toBeDefined();
    expect(alabamaBudget?.targetBid).toBeGreaterThan(
      analysis.investableCash * (alabamaBudget?.investableShare ?? 0)
    );
    expect(alabamaBudget?.targetBid).toBeLessThanOrEqual(
      alabamaSimulation?.expectedGrossPayout ?? 0
    );
  });
});
