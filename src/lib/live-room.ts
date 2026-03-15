import {
  AuctionDashboard,
  BracketGame,
  BracketGameTeam,
  BracketViewModel,
  SimulationSnapshot,
  SoldAssetSummary,
  Syndicate,
  TeamProjection
} from "@/lib/types";

export interface RoundMatchup {
  opponent: BracketGameTeam;
  game?: BracketGame;
  probability?: number;
}

export interface AuctionMatchupSummary {
  nominatedMatchup: RoundMatchup | null;
  likelyRound2Matchup: RoundMatchup | null;
  hasOwnedRoundOneOpponent: boolean;
  hasOwnedLikelyRoundTwoOpponent: boolean;
}

export interface ViewerOwnershipGroup {
  syndicate: Syndicate;
  sales: SoldAssetSummary[];
  highlight: boolean;
}

export function orderSyndicateBoard(ledger: Syndicate[], focusSyndicateId: string) {
  return [...ledger].sort((left, right) => {
    if (left.id === focusSyndicateId) {
      return -1;
    }
    if (right.id === focusSyndicateId) {
      return 1;
    }
    return 0;
  });
}

export function buildOperatorSyndicateHoldings(
  soldAssets: SoldAssetSummary[],
  orderedSyndicateBoard: Syndicate[]
) {
  return orderedSyndicateBoard.map((syndicate) => ({
    syndicate,
    sales: soldAssets
      .filter((item) => item.buyerSyndicateId === syndicate.id)
      .sort(
        (left, right) =>
          right.price - left.price || left.asset.label.localeCompare(right.asset.label)
      )
  }));
}

export function buildViewerOwnershipGroups(
  soldAssets: SoldAssetSummary[],
  focusSyndicate: Syndicate,
  ledger: Syndicate[],
  search: string
): ViewerOwnershipGroup[] {
  const normalized = search.trim().toLowerCase();
  const hasActiveSearch = normalized.length > 0;
  const matchesSearch = (sale: SoldAssetSummary) =>
    !normalized ||
    sale.asset.label.toLowerCase().includes(normalized) ||
    sale.asset.members.some((member) => member.label.toLowerCase().includes(normalized));

  return [
    ...[
      {
        syndicate: focusSyndicate,
        sales: soldAssets.filter(
          (sale) => sale.buyerSyndicateId === focusSyndicate.id && matchesSearch(sale)
        ),
        highlight: true
      }
    ].filter((group) => group.sales.length > 0 || !hasActiveSearch),
    ...ledger
      .filter((syndicate) => syndicate.id !== focusSyndicate.id)
      .map((syndicate) => ({
        syndicate,
        sales: soldAssets.filter(
          (sale) => sale.buyerSyndicateId === syndicate.id && matchesSearch(sale)
        ),
        highlight: false
      }))
      .filter((group) => group.sales.length > 0 || !hasActiveSearch)
  ];
}

export function filterRecommendationRationale(
  rationale: string[] | undefined,
  forcedPassConflictTeamId: string | null | undefined
) {
  return (
    rationale?.filter((line) => {
      const normalized = line.toLowerCase();
      if (normalized.includes("likely bidder pressure")) {
        return false;
      }
      if (
        normalized.includes("bundles") ||
        normalized.includes("is an unresolved play-in team made up of")
      ) {
        return false;
      }
      if (
        normalized.includes("sits within base funding") ||
        normalized.includes("inside stretch funding") ||
        normalized.includes("above the current funding plan")
      ) {
        return false;
      }
      if (
        forcedPassConflictTeamId &&
        normalized.includes("largest collision risk is against")
      ) {
        return false;
      }
      return true;
    }) ?? []
  );
}

export function getFirstRoundMatchup(bracket: BracketViewModel, teamId: string) {
  if (!bracket.isSupported) {
    return null;
  }

  for (const region of bracket.regions) {
    const openingRound = region.rounds.find((round) => round.key === "roundOf64");
    if (!openingRound) {
      continue;
    }

    for (const game of openingRound.games) {
      const containsTeam = game.entrants.some((entrant) => entrant?.teamId === teamId);
      if (!containsTeam) {
        continue;
      }

      const opponent = game.entrants.find(
        (entrant): entrant is BracketGameTeam => entrant !== null && entrant.teamId !== teamId
      );

      return opponent ? { opponent, game } : null;
    }
  }

  return null;
}

export function getLikelyRound2Matchup(
  bracket: BracketViewModel,
  snapshot: SimulationSnapshot | null,
  teamId: string
) {
  if (!bracket.isSupported || !snapshot) {
    return null;
  }

  for (const region of bracket.regions) {
    const openingRound = region.rounds.find((round) => round.key === "roundOf64");
    if (!openingRound) {
      continue;
    }

    const openingGameIndex = openingRound.games.findIndex((game) =>
      game.entrants.some((entrant) => entrant?.teamId === teamId)
    );
    if (openingGameIndex === -1) {
      continue;
    }

    const pairedGameIndex =
      openingGameIndex % 2 === 0 ? openingGameIndex + 1 : openingGameIndex - 1;
    const pairedGame = openingRound.games[pairedGameIndex];
    if (!pairedGame) {
      return null;
    }

    const candidates = pairedGame.entrants.filter(
      (entrant): entrant is BracketGameTeam => entrant !== null
    );
    if (!candidates.length) {
      return null;
    }

    const matchupProbabilities = snapshot.matchupMatrix[teamId] ?? {};
    const opponent = [...candidates].sort((left, right) => {
      const rightProbability = matchupProbabilities[right.teamId] ?? 0;
      const leftProbability = matchupProbabilities[left.teamId] ?? 0;
      return rightProbability - leftProbability;
    })[0];

    if (!opponent) {
      return null;
    }

    return {
      opponent,
      probability: matchupProbabilities[opponent.teamId] ?? 0
    };
  }

  return null;
}

export function deriveAuctionMatchups(args: {
  bracket: BracketViewModel;
  snapshot: SimulationSnapshot | null;
  nominatedTeam: TeamProjection | null;
  ownedTeamIds: string[];
}): AuctionMatchupSummary {
  const { bracket, snapshot, nominatedTeam, ownedTeamIds } = args;
  const nominatedMatchup = nominatedTeam ? getFirstRoundMatchup(bracket, nominatedTeam.id) : null;
  const likelyRound2Matchup = nominatedTeam
    ? getLikelyRound2Matchup(bracket, snapshot, nominatedTeam.id)
    : null;

  return {
    nominatedMatchup,
    likelyRound2Matchup,
    hasOwnedRoundOneOpponent: Boolean(
      nominatedMatchup && ownedTeamIds.includes(nominatedMatchup.opponent.teamId)
    ),
    hasOwnedLikelyRoundTwoOpponent: Boolean(
      likelyRound2Matchup && ownedTeamIds.includes(likelyRound2Matchup.opponent.teamId)
    )
  };
}

export function getFocusOwnedTeams(dashboard: AuctionDashboard) {
  return dashboard.soldTeams
    .filter((item) => item.buyerSyndicateId === dashboard.focusSyndicate.id)
    .sort(
      (left, right) => right.price - left.price || left.team.name.localeCompare(right.team.name)
    );
}
