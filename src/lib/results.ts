import {
  AuctionSession,
  BracketGame,
  BracketRoundKey,
  BracketViewModel,
  MothershipAssetResult,
  MothershipPortfolioResults,
  Stage,
  TeamProjection
} from "@/lib/types";
import { deriveEquivalentShares } from "@/lib/funding";
import { getCumulativeStagePayouts, getBreakEvenStage } from "@/lib/payouts";
import { roundCurrency } from "@/lib/utils";

const STAGE_ORDER: Stage[] = [
  "roundOf64",
  "roundOf32",
  "sweet16",
  "elite8",
  "finalFour",
  "champion"
];

const BRACKET_ROUND_TO_STAGE: Record<BracketRoundKey, Stage | null> = {
  playIn: null,
  roundOf64: "roundOf64",
  roundOf32: "roundOf32",
  sweet16: "sweet16",
  elite8: "elite8",
  finalFour: "finalFour",
  championship: "champion"
};

interface TeamProgression {
  roundsWon: Stage[];
  isEliminated: boolean;
}

function getBracketGames(bracket: BracketViewModel): BracketGame[] {
  return [
    ...(bracket.playIns?.games ?? []),
    ...bracket.regions.flatMap((region) => region.rounds.flatMap((round) => round.games)),
    ...bracket.finals.flatMap((round) => round.games)
  ];
}

function getBroadcastTimestamp(game: Pick<BracketGame, "broadcastIsoDate">): number | null {
  if (!game.broadcastIsoDate) {
    return null;
  }

  const timestamp = Date.parse(game.broadcastIsoDate);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Derives the rounds a single team won by traversing the bracket view.
 * A team is eliminated when it appears as an entrant in a game that has
 * a decided winner who is not that team.
 */
export function deriveTeamRoundProgression(
  teamId: string,
  bracket: BracketViewModel
): TeamProgression {
  if (!bracket.isSupported) {
    return { roundsWon: [], isEliminated: false };
  }

  const roundsWon: Stage[] = [];
  let isEliminated = false;

  for (const game of getBracketGames(bracket)) {
    const isEntrant = game.entrants.some((e) => e?.teamId === teamId);
    if (!isEntrant) continue;

    const stage = BRACKET_ROUND_TO_STAGE[game.round];
    if (!stage) continue;

    if (game.winnerTeamId === teamId) {
      roundsWon.push(stage);
    } else if (game.winnerTeamId !== null) {
      isEliminated = true;
    }
  }

  return { roundsWon, isEliminated };
}

/**
 * Computes the realized payout for a set of round wins using the
 * cumulative payout table. The payout is the cumulative sum through
 * the highest stage won.
 */
export function computeRealizedPayoutForRoundsWon(
  roundsWon: Stage[],
  session: Pick<AuctionSession, "payoutRules">
): number {
  if (roundsWon.length === 0) return 0;

  const maxStageIndex = roundsWon.reduce((maxIdx, stage) => {
    const idx = STAGE_ORDER.indexOf(stage);
    return Math.max(maxIdx, idx);
  }, -1);

  if (maxStageIndex === -1) return 0;

  const maxStage = STAGE_ORDER[maxStageIndex];
  const cumulativePayouts = getCumulativeStagePayouts(session.payoutRules);
  return cumulativePayouts.find((p) => p.stage === maxStage)?.payout ?? 0;
}

/**
 * Builds the full Mothership portfolio results for the tournament tracker.
 * One result row per Mothership purchase (asset). For grouped assets
 * (play-ins, 13-16 bundles), payouts are summed across all underlying teams.
 * Returns null if Mothership has no purchases or shares are not configured.
 */
export function computeMothershipPortfolioResults(
  session: AuctionSession,
  bracket: BracketViewModel,
  focusSyndicateId: string
): MothershipPortfolioResults | null {
  const mothershipPurchases = session.purchases.filter(
    (p) => p.buyerSyndicateId === focusSyndicateId
  );

  if (mothershipPurchases.length === 0) return null;

  const equivalentShares = deriveEquivalentShares(session.mothershipFunding);
  if (equivalentShares <= 0) return null;

  const totalCost = roundCurrency(
    mothershipPurchases.reduce((sum, p) => sum + p.price, 0)
  );
  const costBasisPerShare = roundCurrency(totalCost / equivalentShares);

  const projectionLookup = new Map<string, TeamProjection>(
    session.projections.map((t) => [t.id, t])
  );

  const auctionAssets = session.auctionAssets ?? [];

  const assetResults: MothershipAssetResult[] = mothershipPurchases.map((purchase) => {
    const asset = auctionAssets.find((a) => a.id === (purchase.assetId ?? purchase.teamId));
    const projectionIds = purchase.projectionIds ?? [purchase.teamId];
    const teams = projectionIds
      .map((id) => projectionLookup.get(id))
      .filter((t): t is TeamProjection => t != null);

    const isGrouped = projectionIds.length > 1;
    const singleTeam = !isGrouped ? teams[0] ?? null : null;

    // Determine round wins and elimination status per underlying team
    const teamProgressions = projectionIds.map((teamId) =>
      deriveTeamRoundProgression(teamId, bracket)
    );

    // For grouped assets: union of round wins; eliminated only when ALL are out
    const wonStageSet = new Set<Stage>(teamProgressions.flatMap((p) => p.roundsWon));
    const roundsWon = STAGE_ORDER.filter((stage) => wonStageSet.has(stage));
    const isEliminated = teamProgressions.every((p) => p.isEliminated);
    const isStillAlive = !isEliminated && bracket.isSupported;

    // For grouped assets, sum the realized payout of each underlying team
    const realizedPayout = roundCurrency(
      teamProgressions.reduce(
        (sum, progression) =>
          sum + computeRealizedPayoutForRoundsWon(progression.roundsWon, session),
        0
      )
    );

    const costPerShare = roundCurrency(purchase.price / equivalentShares);
    const returnPerShare = roundCurrency(realizedPayout / equivalentShares);
    const netPerShare = roundCurrency(returnPerShare - costPerShare);
    const breakEvenStage = !isGrouped
      ? getBreakEvenStage(purchase.price, session.payoutRules)
      : null;

    const assetLabel = asset?.label ?? singleTeam?.name ?? purchase.teamId;
    const region = singleTeam?.region ?? asset?.region ?? teams[0]?.region ?? "";

    const percentOfSpend = totalCost > 0 ? roundCurrency((purchase.price / totalCost) * 100) : 0;

    // Find next unplayed game for still-alive teams
    let nextGameIsoDate: string | null = null;
    let nextGameNetwork: string | null = null;
    let nextGameOpponentId: string | null = null;
    let nextGameOpponentName: string | null = null;
    if (isStillAlive) {
      const candidateGames = getBracketGames(bracket).filter(
        (game) =>
          game.winnerTeamId === null &&
          game.entrants.some((entrant) => entrant && projectionIds.includes(entrant.teamId))
      );
      let nextGame = candidateGames[0];
      let nextGameTimestamp = nextGame ? getBroadcastTimestamp(nextGame) : null;

      for (const game of candidateGames.slice(1)) {
        const gameTimestamp = getBroadcastTimestamp(game);
        if (gameTimestamp === null) {
          continue;
        }

        if (nextGameTimestamp === null || gameTimestamp < nextGameTimestamp) {
          nextGame = game;
          nextGameTimestamp = gameTimestamp;
        }
      }

      if (nextGame) {
        nextGameIsoDate = nextGame.broadcastIsoDate;
        nextGameNetwork = nextGame.broadcastNetwork;
        const opponent = nextGame.entrants.find((e) => e && !projectionIds.includes(e.teamId));
        nextGameOpponentId = opponent?.teamId ?? null;
        nextGameOpponentName = opponent?.name ?? null;
      }
    }

    return {
      assetId: purchase.assetId ?? purchase.teamId,
      assetLabel,
      teamId: singleTeam?.id ?? null,
      teamName: singleTeam?.name ?? null,
      seed: singleTeam?.seed ?? null,
      region,
      isGrouped,
      teamCount: projectionIds.length,
      percentOfSpend,
      costPerShare,
      breakEvenStage,
      roundsWon,
      realizedPayout,
      returnPerShare,
      netPerShare,
      isEliminated,
      isStillAlive,
      nextGameIsoDate,
      nextGameNetwork,
      nextGameOpponentId,
      nextGameOpponentName
    } satisfies MothershipAssetResult;
  });

  // Sort by price descending (biggest purchase first)
  assetResults.sort((a, b) => b.costPerShare - a.costPerShare);

  const totalRealizedPayout = roundCurrency(
    assetResults.reduce((sum, r) => sum + r.realizedPayout, 0)
  );
  const netPnL = roundCurrency(totalRealizedPayout - totalCost);
  const currentReturnPerShare = roundCurrency(totalRealizedPayout / equivalentShares);
  const currentNetPerShare = roundCurrency(currentReturnPerShare - costBasisPerShare);

  return {
    assets: assetResults,
    totalCost,
    totalRealizedPayout,
    netPnL,
    equivalentShares,
    costBasisPerShare,
    currentReturnPerShare,
    currentNetPerShare
  };
}
