import { deriveBudgetHeadroom, deriveFundingStatus } from "@/lib/funding";
import {
  AuctionAsset,
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
  analysis: SessionAnalysisSnapshot,
  asset?: AuctionAsset | null
): BidRecommendation | null {
  const projectionIds = asset?.projectionIds?.length ? asset.projectionIds : team ? [team.id] : [];
  if (projectionIds.length === 0 || !session.simulationSnapshot) {
    return null;
  }

  const teamResults = projectionIds
    .map((projectionId) => session.simulationSnapshot!.teamResults[projectionId])
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  if (teamResults.length === 0) {
    return null;
  }

  const ownershipExposure = computeOwnershipExposure(session, projectionIds, focusSyndicate);
  const budgetRows = analysis.budgetRows.filter((row) => projectionIds.includes(row.teamId));
  const currentBid = session.liveState.currentBid;
  const expectedGrossPayout = roundCurrency(
    teamResults.reduce((total, result) => total + result.expectedGrossPayout, 0)
  );
  const openingBid = roundCurrency(budgetRows.reduce((total, row) => total + row.openingBid, 0));
  const targetBid = roundCurrency(budgetRows.reduce((total, row) => total + row.targetBid, 0));
  const baseMaxBid = roundCurrency(budgetRows.reduce((total, row) => total + row.maxBid, 0));
  const baseBudgetHeadroom = deriveBudgetHeadroom(
    session.mothershipFunding.budgetBase,
    focusSyndicate.spend,
    currentBid
  );
  const stretchBudgetHeadroom = deriveBudgetHeadroom(
    session.mothershipFunding.budgetStretch,
    focusSyndicate.spend,
    currentBid
  );
  const fundingStatus = deriveFundingStatus(
    focusSyndicate.spend + currentBid,
    session.mothershipFunding
  );
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
  const forcedPassConflict =
    ownershipExposure.likelyConflicts.find(
      (conflict) => conflict.earliestRound === "roundOf64" && conflict.probability >= 0.999
    ) ?? null;

  let stoplight: BidRecommendation["stoplight"] = "pass";
  if (hasBudgetWindow && buyThreshold > 0 && currentBid <= buyThreshold && expectedNetValue > 0) {
    stoplight = "buy";
  } else if (hasBudgetWindow && maxBid > 0 && currentBid <= maxBid && expectedNetValue >= -750) {
    stoplight = "caution";
  }
  if (forcedPassConflict) {
    stoplight = "pass";
  }

  const subjectLabel = asset?.label ?? team?.name ?? "This team";
  const convictionScore =
    budgetRows.length > 0
      ? budgetRows.reduce((total, row) => total + row.convictionScore, 0) / budgetRows.length
      : 0;
  const investableShare = budgetRows.reduce((total, row) => total + row.investableShare, 0);

  const rationale = [
    `${subjectLabel} carries a ${convictionScore.toFixed(3)} conviction score with ${Math.round(investableShare * 100)}% relative pricing weight on the current board.`,
    `Portfolio overlap penalty is ${ownershipExposure.overlapScore.toFixed(2)} with ${ownershipExposure.likelyConflicts.length} live conflict signals.`,
    `${focusSyndicate.name} sits ${fundingStatus === "safe" ? "within base funding" : fundingStatus === "stretch" ? "inside stretch funding" : "above the current funding plan"} with ${roundCurrency(baseBudgetHeadroom)} base room and ${roundCurrency(stretchBudgetHeadroom)} stretch room after this bid.`
  ];

  if (asset?.type === "seed_bundle") {
    rationale.unshift(
      `${subjectLabel} bundles ${asset.members
        .map((member) => `${member.seed} ${member.label}`)
        .join(", ")} into one auction team.`
    );
  } else if (asset?.type === "play_in_slot") {
    rationale.unshift(
      `${subjectLabel} is an unresolved play-in team made up of ${asset.members
        .map((member) => member.label)
        .join(" and ")}.`
    );
  }

  if (ownershipExposure.likelyConflicts[0]) {
    const topConflict = ownershipExposure.likelyConflicts[0];
    rationale.push(
      `Largest collision risk is against ${topConflict.opponentId} in the ${titleCaseStage(topConflict.earliestRound)} window at ${Math.round(topConflict.probability * 100)}%.`
    );
  }
  if (forcedPassConflict) {
    rationale.unshift(
      `Automatic pass: ${subjectLabel} is guaranteed to hit owned team ${forcedPassConflict.opponentId} in the Round of 64.`
    );
  }

  const drivers = [
    {
      label: "Target / max",
      value: `${roundCurrency(targetBid)} / ${roundCurrency(maxBid)}`,
      tone: valueGap >= 0 ? "positive" : "negative"
    },
    {
      label: "Funding plan",
      value:
        fundingStatus === "safe"
          ? "Within base budget"
          : fundingStatus === "stretch"
            ? "Requires stretch budget"
            : "Above current plan",
      tone:
        fundingStatus === "safe"
          ? "positive"
          : fundingStatus === "stretch"
            ? "neutral"
            : "negative"
    },
    {
      label: "Portfolio concentration",
      value: `${Math.round(ownershipExposure.concentrationScore * 100)}%`,
      tone: ownershipExposure.concentrationScore > 0.18 ? "negative" : "neutral"
    }
  ] as const;

  return {
    teamId: team?.id ?? projectionIds[0],
    assetId: asset?.id,
    currentBid,
    openingBid,
    targetBid,
    maxBid,
    expectedGrossPayout,
    expectedNetValue,
    valueGap,
    confidenceBand: [
      roundCurrency(teamResults.reduce((total, result) => total + result.confidenceBand[0], 0)),
      roundCurrency(teamResults.reduce((total, result) => total + result.confidenceBand[1], 0))
    ],
    stoplight,
    ownershipPenalty: roundCurrency(ownershipExposure.overlapScore * 850),
    bankrollHeadroom: roundCurrency(Math.max(0, analysis.remainingBankroll)),
    baseBudgetHeadroom: roundCurrency(baseBudgetHeadroom),
    stretchBudgetHeadroom: roundCurrency(stretchBudgetHeadroom),
    fundingStatus,
    concentrationScore: ownershipExposure.concentrationScore,
    forcedPassConflictTeamId: forcedPassConflict?.opponentId ?? null,
    forcedPassReason: forcedPassConflict
      ? `Guaranteed Round of 64 collision with owned team ${forcedPassConflict.opponentId}.`
      : null,
    drivers: [...drivers],
    rationale
  };
}

export function computeOwnershipExposure(
  session: AuctionSession,
  nominatedProjectionIds: string[],
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

  const conflictsByOpponent = new Map<string, OwnershipExposure["likelyConflicts"][number]>();
  for (const nominatedTeamId of nominatedProjectionIds) {
    for (const ownedTeamId of focusSyndicate.ownedTeamIds) {
      const probability = snapshot.matchupMatrix[nominatedTeamId]?.[ownedTeamId] ?? 0;
      const likelyConflict =
        snapshot.teamResults[nominatedTeamId]?.likelyConflicts.find(
          (conflict) => conflict.opponentId === ownedTeamId
        ) ??
        ({
          opponentId: ownedTeamId,
          probability,
          earliestRound: "sweet16" as Stage
        });

      if (likelyConflict.probability <= 0) {
        continue;
      }

      const existing = conflictsByOpponent.get(ownedTeamId);
      if (!existing) {
        conflictsByOpponent.set(ownedTeamId, likelyConflict);
        continue;
      }

      conflictsByOpponent.set(ownedTeamId, {
        opponentId: ownedTeamId,
        probability: Math.max(existing.probability, likelyConflict.probability),
        earliestRound: stageRank(existing.earliestRound) <= stageRank(likelyConflict.earliestRound)
          ? existing.earliestRound
          : likelyConflict.earliestRound
      });
    }
  }

  const conflicts = [...conflictsByOpponent.values()].sort(
    (left, right) => right.probability - left.probability
  );
  const overlapScore = conflicts.reduce((total, conflict) => total + conflict.probability, 0);
  const concentrationScore = focusSyndicate.ownedTeamIds.length / Math.max(session.projections.length, 1);

  return {
    overlapScore,
    concentrationScore,
    likelyConflicts: conflicts.slice(0, 5)
  };
}

function stageRank(stage: Stage) {
  return {
    roundOf64: 0,
    roundOf32: 1,
    sweet16: 2,
    elite8: 3,
    finalFour: 4,
    champion: 5
  }[stage];
}
