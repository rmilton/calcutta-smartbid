import { deriveMothershipFundingSnapshot } from "@/lib/funding";
import { buildTeamIntelligence } from "@/lib/team-intelligence";
import {
  AnalysisBudgetRow,
  AnalysisRankingRow,
  AuctionSession,
  SessionAnalysisSnapshot,
  Syndicate
} from "@/lib/types";
import { clamp, roundCurrency } from "@/lib/utils";

export function buildSessionAnalysisSnapshot(
  session: AuctionSession,
  focusSyndicate: Syndicate
): SessionAnalysisSnapshot {
  const intelligence = buildTeamIntelligence(session.projections, session.liveState.nominatedTeamId);
  const soldProjectionIds = new Set(
    session.purchases.flatMap((purchase) => purchase.projectionIds ?? [purchase.teamId])
  );
  const classificationLookup = session.teamClassifications;
  const noteLookup = session.teamNotes;
  const ranking = intelligence.ranking.map(
    (row) =>
      ({
        ...row,
        classification: classificationLookup[row.teamId]?.classification ?? null,
        note: noteLookup[row.teamId]?.note ?? null
      }) satisfies AnalysisRankingRow
  );
  const availableRows = ranking.filter((row) => !soldProjectionIds.has(row.teamId));
  const funding = deriveMothershipFundingSnapshot(session.mothershipFunding, focusSyndicate.spend);
  const investableCash = roundCurrency(Math.max(0, funding.baseBidRoom));
  const stretchCash = roundCurrency(Math.max(0, funding.stretchBidRoom));

  const convictionRows = availableRows.map((row) => ({
    row,
    conviction: computeConviction(row)
  }));
  const convictionSum = convictionRows.reduce((total, item) => total + item.conviction, 0);
  const fallbackShare = convictionRows.length > 0 ? 1 / convictionRows.length : 0;

  const budgetRows = convictionRows
    .map(({ row, conviction }) => {
      const share = convictionSum > 0 ? conviction / convictionSum : fallbackShare;
      const simulationResult = session.simulationSnapshot?.teamResults[row.teamId];
      const expectedGrossPayout = simulationResult?.expectedGrossPayout ?? 0;
      const confidenceFloor = simulationResult?.confidenceBand[0] ?? 0;
      const confidenceCeiling = simulationResult?.confidenceBand[1] ?? 0;
      const relativeConviction =
        fallbackShare > 0 ? share / fallbackShare : 1;
      const convictionTilt = clamp(0.78 + relativeConviction * 0.22, 0.72, 1.28);

      const legacyTargetBid = investableCash * share;
      const legacyMaxBid = stretchCash * share;
      const valueAnchoredTargetBase =
        expectedGrossPayout > 0
          ? Math.max(expectedGrossPayout * 0.42, confidenceFloor * 0.72)
          : legacyTargetBid;
      const valueAnchoredMaxBase =
        expectedGrossPayout > 0
          ? Math.max(
              valueAnchoredTargetBase * 1.08,
              Math.min(expectedGrossPayout * 0.62, confidenceCeiling * 0.76)
            )
          : legacyMaxBid;
      const targetBid = roundCurrency(
        Math.min(investableCash, valueAnchoredTargetBase * convictionTilt)
      );
      const maxBid = roundCurrency(
        Math.max(
          targetBid,
          Math.min(stretchCash, valueAnchoredMaxBase * convictionTilt)
        )
      );
      const openingBid = roundCurrency(
        Math.max((targetBid > 0 ? targetBid : maxBid) * 0.62, 1)
      );

      return {
        teamId: row.teamId,
        teamName: row.teamName,
        classification: row.classification,
        rank: ranking.findIndex((candidate) => candidate.teamId === row.teamId) + 1,
        percentile: row.percentile,
        convictionScore: roundMetric(conviction, 4),
        investableShare: roundMetric(share, 4),
        openingBid,
        targetBid,
        maxBid,
        tier: classifyTier(row.percentile)
      } satisfies AnalysisBudgetRow;
    })
    .sort((left, right) => right.targetBid - left.targetBid);

  const budgetLookup = new Map(budgetRows.map((row) => [row.teamId, row]));
  const ownedPurchases = session.purchases.filter(
    (purchase) => purchase.buyerSyndicateId === focusSyndicate.id
  );
  const actualPaidSpend = roundCurrency(
    ownedPurchases.reduce((total, purchase) => total + purchase.price, 0)
  );

  return {
    ranking,
    fieldAverages: { ...intelligence.fieldAverages },
    budgetRows,
    funding,
    ownedTeams: ownedPurchases.flatMap((purchase) =>
      (purchase.projectionIds ?? [purchase.teamId]).map((teamId) => ({
        teamId,
        paidPrice: purchase.price,
        targetBid: budgetLookup.get(teamId)?.targetBid ?? null,
        maxBid: budgetLookup.get(teamId)?.maxBid ?? null
      }))
    ),
    investableCash,
    actualPaidSpend,
    remainingBankroll: roundCurrency(Math.max(0, funding.baseBidRoom))
  };
}

function computeConviction(row: AnalysisRankingRow) {
  const base = Math.max(row.compositeScore, 0.01);
  const coverageAdjustment = 0.82 + row.scoutingCoverage * 0.36;
  const strengthAdjustment = 1 + Math.min(row.strengths.length * 0.035, 0.14);
  const riskAdjustment = 1 - Math.min(row.risks.length * 0.055, 0.22);
  const percentileAdjustment = 0.9 + (row.percentile / 100) * 0.25;
  return base * coverageAdjustment * strengthAdjustment * riskAdjustment * percentileAdjustment;
}

function classifyTier(percentile: number): AnalysisBudgetRow["tier"] {
  if (percentile >= 88) {
    return "core";
  }
  if (percentile >= 68) {
    return "flex";
  }
  return "depth";
}

function roundMetric(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
