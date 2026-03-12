import {
  AuctionSession,
  BidRecommendation,
  OwnershipExposure,
  SessionAnalysisSnapshot,
  Stage,
  Syndicate,
  TeamProjection
} from "@/lib/types";
import { clamp, roundCurrency, titleCaseStage } from "@/lib/utils";

export function buildBidRecommendation(
  session: AuctionSession,
  team: TeamProjection | null,
  focusSyndicate: Syndicate,
  analysis: SessionAnalysisSnapshot
): BidRecommendation | null {
  if (!team || !session.simulationSnapshot) {
    return null;
  }

  const teamResult = session.simulationSnapshot.teamResults[team.id];
  if (!teamResult) {
    return null;
  }

  const ownershipExposure = computeOwnershipExposure(session, team.id, focusSyndicate);
  const budgetRow = analysis.budgetRows.find((row) => row.teamId === team.id) ?? null;
  const currentBid = session.liveState.currentBid;
  const expectedGrossPayout = teamResult.expectedGrossPayout;
  const remainingBankroll = analysis.remainingBankroll;
  const openingBid = budgetRow?.openingBid ?? 0;
  const targetBid = budgetRow?.targetBid ?? 0;
  const baseMaxBid = budgetRow?.maxBid ?? 0;
  const conflictPenaltyMultiplier =
    1 -
    clamp(
      ownershipExposure.overlapScore * 0.18 +
        ownershipExposure.concentrationScore * 0.12,
      0,
      0.22
    );
  const maxBid = roundCurrency(Math.max(0, baseMaxBid * conflictPenaltyMultiplier));
  const expectedNetValue = roundCurrency(
    expectedGrossPayout - currentBid - ownershipExposure.overlapScore * 850
  );
  const valueGap = roundCurrency(maxBid - currentBid);
  const buyThreshold = Math.min(targetBid, maxBid);
  const hasBudgetWindow = buyThreshold > 0 || maxBid > 0;

  let stoplight: BidRecommendation["stoplight"] = "pass";
  if (hasBudgetWindow && buyThreshold > 0 && currentBid <= buyThreshold && expectedNetValue > 0) {
    stoplight = "buy";
  } else if (hasBudgetWindow && maxBid > 0 && currentBid <= maxBid && expectedNetValue >= -750) {
    stoplight = "caution";
  }

  const rationale = [
    `${team.name} carries a ${budgetRow ? budgetRow.convictionScore.toFixed(3) : "0.000"} conviction score with ${budgetRow ? Math.round(budgetRow.investableShare * 100) : 0}% of the current investable budget.`,
    `Portfolio overlap penalty is ${ownershipExposure.overlapScore.toFixed(2)} with ${ownershipExposure.likelyConflicts.length} live conflict signals.`,
    `${focusSyndicate.name} has ${roundCurrency(remainingBankroll)} in remaining bankroll after ${roundCurrency(focusSyndicate.spend)} spent.`
  ];

  if (ownershipExposure.likelyConflicts[0]) {
    const topConflict = ownershipExposure.likelyConflicts[0];
    rationale.push(
      `Largest collision risk is against ${topConflict.opponentId} in the ${titleCaseStage(topConflict.earliestRound)} window at ${Math.round(topConflict.probability * 100)}%.`
    );
  }

  const drivers = [
    {
      label: "Target / max",
      value: `${roundCurrency(targetBid)} / ${roundCurrency(maxBid)}`,
      tone: valueGap >= 0 ? "positive" : "negative"
    },
    {
      label: "Portfolio concentration",
      value: `${Math.round(ownershipExposure.concentrationScore * 100)}%`,
      tone: ownershipExposure.concentrationScore > 0.18 ? "negative" : "neutral"
    }
  ] as const;

  return {
    teamId: team.id,
    currentBid,
    openingBid,
    targetBid,
    maxBid,
    expectedGrossPayout,
    expectedNetValue,
    valueGap,
    confidenceBand: teamResult.confidenceBand,
    stoplight,
    ownershipPenalty: roundCurrency(ownershipExposure.overlapScore * 850),
    bankrollHeadroom: roundCurrency(remainingBankroll),
    concentrationScore: ownershipExposure.concentrationScore,
    drivers: [...drivers],
    rationale
  };
}

export function computeOwnershipExposure(
  session: AuctionSession,
  nominatedTeamId: string,
  focusSyndicate: Syndicate
): OwnershipExposure {
  const snapshot = session.simulationSnapshot;
  if (!snapshot) {
    return {
      overlapScore: 0,
      concentrationScore: 0,
      likelyConflicts: []
    };
  }

  const conflicts = focusSyndicate.ownedTeamIds
    .map((ownedTeamId) => {
      const probability = snapshot.matchupMatrix[nominatedTeamId]?.[ownedTeamId] ?? 0;
      const likelyConflict =
        snapshot.teamResults[nominatedTeamId]?.likelyConflicts.find((conflict) => conflict.opponentId === ownedTeamId) ??
        ({
          opponentId: ownedTeamId,
          probability,
          earliestRound: "sweet16" as Stage
        });
      return likelyConflict;
    })
    .filter((conflict) => conflict.probability > 0)
    .sort((left, right) => right.probability - left.probability);

  const overlapScore = conflicts.reduce((total, conflict) => total + conflict.probability, 0);
  const concentrationScore = focusSyndicate.ownedTeamIds.length / Math.max(session.projections.length, 1);

  return {
    overlapScore,
    concentrationScore,
    likelyConflicts: conflicts.slice(0, 5)
  };
}
