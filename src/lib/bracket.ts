import {
  AuctionSession,
  BracketGame,
  BracketGameTeam,
  BracketRoundKey,
  BracketState,
  BracketViewModel,
  PurchaseRecord,
  StoredAuctionSession,
  Syndicate,
  TeamProjection
} from "@/lib/types";

const FIRST_ROUND_SEED_PAIRS: Array<[number, number]> = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15]
];

const REGIONAL_ROUND_ORDER: Array<{ key: BracketRoundKey; label: string; gameCount: number }> = [
  { key: "roundOf64", label: "Round of 64", gameCount: 8 },
  { key: "roundOf32", label: "Round of 32", gameCount: 4 },
  { key: "sweet16", label: "Sweet 16", gameCount: 2 },
  { key: "elite8", label: "Elite 8", gameCount: 1 }
];

const FINAL_ROUND_ORDER: Array<{ key: BracketRoundKey; label: string; gameCount: number }> = [
  { key: "finalFour", label: "Final Four", gameCount: 2 },
  { key: "championship", label: "Championship", gameCount: 1 }
];

interface RegionRoundBuild {
  key: BracketRoundKey;
  label: string;
  games: BracketGame[];
}

interface RegionBuild {
  name: string;
  rounds: RegionRoundBuild[];
}

interface BracketBuildResult {
  view: BracketViewModel;
  gameLookup: Map<string, BracketGame>;
}

interface SupportedBracketValidation {
  isSupported: true;
  regionLookup: Map<string, TeamProjection[]>;
  regionOrder: string[];
}

interface UnsupportedBracketValidation {
  isSupported: false;
  reason: string;
}

type BracketValidation = SupportedBracketValidation | UnsupportedBracketValidation;

interface PurchaseLookupRow {
  buyerSyndicateId: string;
  buyerSyndicateName: string | null;
  buyerColor: string | null;
}

function toGameId(prefix: string, round: string, slot: number) {
  return `${prefix}-${round}-${slot}`;
}

function toRegionKey(region: string) {
  return region.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildUnsupportedBracket(reason: string): BracketBuildResult {
  return {
    view: {
      isSupported: false,
      unsupportedReason: reason,
      regions: [],
      finals: []
    },
    gameLookup: new Map()
  };
}

function buildPurchaseLookup(purchases: PurchaseRecord[], syndicates: Syndicate[]) {
  const syndicateLookup = new Map(syndicates.map((syndicate) => [syndicate.id, syndicate]));
  return new Map(
    purchases.flatMap((purchase) => {
      const syndicate = syndicateLookup.get(purchase.buyerSyndicateId);
      const lookupRow = {
        buyerSyndicateId: purchase.buyerSyndicateId,
        buyerSyndicateName: syndicate?.name ?? null,
        buyerColor: syndicate?.color ?? null
      } satisfies PurchaseLookupRow;
      return (purchase.projectionIds ?? [purchase.teamId]).map((projectionId) => [
        projectionId,
        lookupRow
      ] as const);
    })
  );
}

function toBracketTeam(
  team: TeamProjection,
  purchaseLookup: Map<string, PurchaseLookupRow>
): BracketGameTeam {
  const purchase = purchaseLookup.get(team.id);
  return {
    teamId: team.id,
    name: team.name,
    shortName: team.shortName,
    seed: team.seed,
    region: team.region,
    buyerSyndicateId: purchase?.buyerSyndicateId ?? null,
    buyerSyndicateName: purchase?.buyerSyndicateName ?? null,
    buyerColor: purchase?.buyerColor ?? null
  };
}

function findWinner(
  entrants: [BracketGameTeam | null, BracketGameTeam | null],
  storedWinnerTeamId: string | null | undefined
) {
  if (!storedWinnerTeamId) {
    return null;
  }

  return entrants.some((entrant) => entrant?.teamId === storedWinnerTeamId)
    ? storedWinnerTeamId
    : null;
}

function getWinnerTeam(game: BracketGame) {
  return game.entrants.find((entrant) => entrant?.teamId === game.winnerTeamId) ?? null;
}

function createGame(
  id: string,
  round: BracketRoundKey,
  label: string,
  region: string | null,
  slot: number,
  sourceGameIds: [string | null, string | null],
  entrants: [BracketGameTeam | null, BracketGameTeam | null],
  winnersByGameId: Record<string, string | null>
): BracketGame {
  return {
    id,
    round,
    label,
    region,
    slot,
    sourceGameIds,
    entrants,
    winnerTeamId: findWinner(entrants, winnersByGameId[id])
  };
}

function getRegionalRoundSlug(round: BracketRoundKey) {
  switch (round) {
    case "roundOf32":
      return "round-of-32";
    case "sweet16":
      return "sweet-16";
    case "elite8":
      return "elite-8";
    default:
      return "round-of-64";
  }
}

function buildRegionalGames(
  region: string,
  teams: TeamProjection[],
  winnersByGameId: Record<string, string | null>,
  purchaseLookup: Map<string, PurchaseLookupRow>
) {
  const gameLookup = new Map<string, BracketGame>();
  const seedLookup = new Map(teams.map((team) => [team.seed, team]));
  const rounds: RegionRoundBuild[] = [];
  const regionKey = toRegionKey(region);

  const roundOf64Games = FIRST_ROUND_SEED_PAIRS.map(([leftSeed, rightSeed], index) => {
    const gameId = toGameId(regionKey, "round-of-64", index + 1);
    const entrants: [BracketGameTeam | null, BracketGameTeam | null] = [
      seedLookup.get(leftSeed) ? toBracketTeam(seedLookup.get(leftSeed)!, purchaseLookup) : null,
      seedLookup.get(rightSeed) ? toBracketTeam(seedLookup.get(rightSeed)!, purchaseLookup) : null
    ];
    const game = createGame(
      gameId,
      "roundOf64",
      "Round of 64",
      region,
      index + 1,
      [null, null],
      entrants,
      winnersByGameId
    );
    gameLookup.set(gameId, game);
    return game;
  });
  rounds.push({
    key: "roundOf64",
    label: "Round of 64",
    games: roundOf64Games
  });

  let previousRound = roundOf64Games;
  for (const round of REGIONAL_ROUND_ORDER.slice(1)) {
    const games = Array.from({ length: round.gameCount }, (_, index) => {
      const leftSource = previousRound[index * 2];
      const rightSource = previousRound[index * 2 + 1];
      const entrants: [BracketGameTeam | null, BracketGameTeam | null] = [
        leftSource ? getWinnerTeam(leftSource) : null,
        rightSource ? getWinnerTeam(rightSource) : null
      ];
      const gameId = toGameId(regionKey, getRegionalRoundSlug(round.key), index + 1);
      const game = createGame(
        gameId,
        round.key,
        round.label,
        region,
        index + 1,
        [leftSource?.id ?? null, rightSource?.id ?? null],
        entrants,
        winnersByGameId
      );
      gameLookup.set(gameId, game);
      return game;
    });

    rounds.push({
      key: round.key,
      label: round.label,
      games
    });
    previousRound = games;
  }

  return {
    name: region,
    rounds,
    gameLookup
  } satisfies RegionBuild & { gameLookup: Map<string, BracketGame> };
}

function validateBracketSupport(session: AuctionSession): BracketValidation {
  if (session.projections.length !== 64) {
    return {
      isSupported: false,
      reason: "Bracket view requires a complete 64-team field for this session."
    };
  }

  const regionLookup = session.projections.reduce((lookup, team) => {
    const current = lookup.get(team.region) ?? [];
    current.push(team);
    lookup.set(team.region, current);
    return lookup;
  }, new Map<string, TeamProjection[]>());

  if (regionLookup.size !== 4) {
    return {
      isSupported: false,
      reason: "Bracket view requires exactly four seeded regions."
    };
  }

  for (const [region, teams] of regionLookup) {
    if (teams.length !== 16) {
      return {
        isSupported: false,
        reason: `Bracket view requires 16 seeded teams in ${region}.`
      };
    }

    const seeds = [...teams].sort((left, right) => left.seed - right.seed).map((team) => team.seed);
    const expected = Array.from({ length: 16 }, (_, index) => index + 1);
    if (seeds.join(",") !== expected.join(",")) {
      return {
        isSupported: false,
        reason: `Bracket view requires one team at each seed in ${region}.`
      };
    }
  }

  if (session.finalFourPairings.length !== 2) {
    return {
      isSupported: false,
      reason: "Bracket view requires two Final Four regional pairings."
    };
  }

  const pairedRegions = session.finalFourPairings.flat();
  if (pairedRegions.length !== 4 || new Set(pairedRegions).size !== 4) {
    return {
      isSupported: false,
      reason: "Bracket view requires unique Final Four region pairings."
    };
  }

  for (const region of pairedRegions) {
    if (!regionLookup.has(region)) {
      return {
        isSupported: false,
        reason: `Final Four pairing region ${region} is missing from the field.`
      };
    }
  }

  return {
    isSupported: true,
    regionLookup,
    regionOrder: pairedRegions
  };
}

function pruneInvalidWinners(session: StoredAuctionSession) {
  let changed = true;

  while (changed) {
    changed = false;
    const rebuilt = buildBracket(session);

    for (const [storedGameId, storedWinnerId] of Object.entries(session.bracketState.winnersByGameId)) {
      const rebuiltGame = rebuilt.gameLookup.get(storedGameId);
      const validEntrants = rebuiltGame?.entrants.flatMap((entrant) =>
        entrant ? [entrant.teamId] : []
      ) ?? [];

      if (!rebuiltGame || storedWinnerId === null || !validEntrants.includes(storedWinnerId)) {
        delete session.bracketState.winnersByGameId[storedGameId];
        changed = true;
      }
    }
  }
}

function buildBracket(session: AuctionSession): BracketBuildResult {
  const support = validateBracketSupport(session);
  if (!support.isSupported) {
    return buildUnsupportedBracket(support.reason);
  }

  const purchaseLookup = buildPurchaseLookup(session.purchases, session.syndicates);
  const gameLookup = new Map<string, BracketGame>();
  const regionBuilds = support.regionOrder.map((region) => {
    const build = buildRegionalGames(
      region,
      support.regionLookup.get(region) ?? [],
      session.bracketState.winnersByGameId,
      purchaseLookup
    );
    for (const [gameId, game] of build.gameLookup) {
      gameLookup.set(gameId, game);
    }
    return {
      name: build.name,
      rounds: build.rounds.map((round) => ({
        key: round.key,
        label: round.label,
        region: region,
        games: round.games
      }))
    };
  });

  const leftFinalists = support.regionOrder.slice(0, 2).map((region) => {
    const eliteEightGameId = toGameId(toRegionKey(region), "elite-8", 1);
    return gameLookup.get(eliteEightGameId) ?? null;
  });
  const rightFinalists = support.regionOrder.slice(2, 4).map((region) => {
    const eliteEightGameId = toGameId(toRegionKey(region), "elite-8", 1);
    return gameLookup.get(eliteEightGameId) ?? null;
  });

  const finalFourGames = [
    createGame(
      "final-four-1",
      "finalFour",
      "Final Four",
      null,
      1,
      [leftFinalists[0]?.id ?? null, leftFinalists[1]?.id ?? null],
      [leftFinalists[0] ? getWinnerTeam(leftFinalists[0]) : null, leftFinalists[1] ? getWinnerTeam(leftFinalists[1]) : null],
      session.bracketState.winnersByGameId
    ),
    createGame(
      "final-four-2",
      "finalFour",
      "Final Four",
      null,
      2,
      [rightFinalists[0]?.id ?? null, rightFinalists[1]?.id ?? null],
      [rightFinalists[0] ? getWinnerTeam(rightFinalists[0]) : null, rightFinalists[1] ? getWinnerTeam(rightFinalists[1]) : null],
      session.bracketState.winnersByGameId
    )
  ];

  for (const game of finalFourGames) {
    gameLookup.set(game.id, game);
  }

  const championshipGame = createGame(
    "championship-1",
    "championship",
    "Championship",
    null,
    1,
    [finalFourGames[0].id, finalFourGames[1].id],
    [getWinnerTeam(finalFourGames[0]), getWinnerTeam(finalFourGames[1])],
    session.bracketState.winnersByGameId
  );
  gameLookup.set(championshipGame.id, championshipGame);

  return {
    view: {
      isSupported: true,
      unsupportedReason: null,
      regions: regionBuilds,
      finals: [
        {
          key: FINAL_ROUND_ORDER[0].key,
          label: FINAL_ROUND_ORDER[0].label,
          region: null,
          games: finalFourGames
        },
        {
          key: FINAL_ROUND_ORDER[1].key,
          label: FINAL_ROUND_ORDER[1].label,
          region: null,
          games: [championshipGame]
        }
      ]
    },
    gameLookup
  };
}

export function createEmptyBracketState(): BracketState {
  return {
    winnersByGameId: {}
  };
}

export function normalizeBracketState(
  bracketState: Partial<BracketState> | null | undefined
): BracketState {
  const winnersByGameId = Object.fromEntries(
    Object.entries(bracketState?.winnersByGameId ?? {}).filter(
      ([gameId, winnerTeamId]) =>
        gameId.trim().length > 0 && (typeof winnerTeamId === "string" || winnerTeamId === null)
    )
  );

  return {
    winnersByGameId
  };
}

export function buildBracketView(session: AuctionSession): BracketViewModel {
  session.bracketState = normalizeBracketState(session.bracketState);
  return buildBracket(session).view;
}

export function applyBracketWinnerMutation(
  session: StoredAuctionSession,
  gameId: string,
  winnerTeamId: string | null
) {
  const currentState = normalizeBracketState(session.bracketState);
  session.bracketState = currentState;

  const initialBracket = buildBracket(session);
  if (!initialBracket.view.isSupported) {
    throw new Error(initialBracket.view.unsupportedReason ?? "Bracket view is unavailable.");
  }

  const game = initialBracket.gameLookup.get(gameId);
  if (!game) {
    throw new Error("Bracket game not found.");
  }

  const validWinnerIds = game.entrants.flatMap((entrant) => (entrant ? [entrant.teamId] : []));
  if (winnerTeamId !== null && !validWinnerIds.includes(winnerTeamId)) {
    throw new Error("Selected winner must be one of the current matchup entrants.");
  }

  if (winnerTeamId === null) {
    delete session.bracketState.winnersByGameId[gameId];
  } else {
    session.bracketState.winnersByGameId[gameId] = winnerTeamId;
  }

  pruneInvalidWinners(session);

  session.updatedAt = new Date().toISOString();
}
