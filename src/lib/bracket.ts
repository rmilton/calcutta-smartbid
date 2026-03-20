import { findAuctionAssetForPurchase } from "@/lib/auction-assets";
import {
  AuctionSession,
  BracketGame,
  BracketGameTeam,
  BracketImportTeam,
  BracketRoundKey,
  BracketState,
  BracketViewModel,
  StoredAuctionSession,
  TeamProjection
} from "@/lib/types";
import { EspnScheduleMap, normalizeTeamName } from "@/lib/espn";

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

interface SupportedProjectionBracketValidation {
  isSupported: true;
  source: "projection";
  regionLookup: Map<string, TeamProjection[]>;
  regionOrder: string[];
}

interface SupportedImportBracketValidation {
  isSupported: true;
  source: "import";
  slotGroupsByRegion: Map<string, BracketImportTeam[][]>;
  regionOrder: string[];
}

interface UnsupportedBracketValidation {
  isSupported: false;
  reason: string;
}

type SupportedBracketValidation =
  | SupportedProjectionBracketValidation
  | SupportedImportBracketValidation;
type BracketValidation = SupportedBracketValidation | UnsupportedBracketValidation;

interface PurchaseLookupRow {
  buyerSyndicateId: string;
  buyerSyndicateName: string | null;
  buyerColor: string | null;
}

interface BracketSlotBuild {
  region: string;
  seed: number;
  regionSlot: string;
  entrant: BracketGameTeam | null;
  sourceGameId: string | null;
}

function toGameId(prefix: string, round: string, slot: number) {
  return `${prefix}-${round}-${slot}`;
}

function toRegionKey(region: string) {
  return region.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function toPlayInGameId(groupKey: string) {
  return `play-in-${toRegionKey(groupKey)}`;
}

function buildUnsupportedBracket(reason: string): BracketBuildResult {
  return {
    view: {
      isSupported: false,
      unsupportedReason: reason,
      playIns: null,
      regions: [],
      finals: []
    },
    gameLookup: new Map()
  };
}

function buildPurchaseLookup(session: AuctionSession) {
  const syndicateLookup = new Map(session.syndicates.map((syndicate) => [syndicate.id, syndicate]));
  const auctionAssets = session.auctionAssets ?? [];

  return new Map(
    session.purchases.flatMap((purchase) => {
      const syndicate = syndicateLookup.get(purchase.buyerSyndicateId);
      const lookupRow = {
        buyerSyndicateId: purchase.buyerSyndicateId,
        buyerSyndicateName: syndicate?.name ?? null,
        buyerColor: syndicate?.color ?? null
      } satisfies PurchaseLookupRow;
      const asset = findAuctionAssetForPurchase(auctionAssets, purchase);
      const ids = new Set<string>([
        ...(purchase.projectionIds ?? [purchase.teamId]),
        ...(asset?.memberTeamIds ?? [])
      ]);

      return [...ids].map((id) => [id, lookupRow] as const);
    })
  );
}

function toBracketTeam(
  team: Pick<BracketImportTeam, "id" | "name" | "shortName" | "seed" | "region">,
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

function toBracketTeamFromProjection(
  team: TeamProjection,
  purchaseLookup: Map<string, PurchaseLookupRow>
): BracketGameTeam {
  return toBracketTeam(team, purchaseLookup);
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
  winnersByGameId: Record<string, string | null>,
  scheduleMap?: EspnScheduleMap | null
): BracketGame {
  let broadcastIsoDate: string | null = null;
  let broadcastNetwork: string | null = null;

  if (scheduleMap) {
    const nameA = entrants[0]?.name;
    const nameB = entrants[1]?.name;
    if (nameA && nameB) {
      // Play-in groups have names like "Prairie View A&M / Lehigh" — try each individual
      // team name so they can match ESPN's per-team names
      const variantsA = nameA.includes(" / ") ? nameA.split(" / ").map((n) => n.trim()) : [nameA];
      const variantsB = nameB.includes(" / ") ? nameB.split(" / ").map((n) => n.trim()) : [nameB];
      outer: for (const va of variantsA) {
        for (const vb of variantsB) {
          const key = [normalizeTeamName(va), normalizeTeamName(vb)].sort().join("|");
          const info = scheduleMap.get(key);
          if (info) {
            broadcastIsoDate = info.isoDate;
            broadcastNetwork = info.network;
            break outer;
          }
        }
      }
    }
  }

  return {
    id,
    round,
    label,
    region,
    slot,
    sourceGameIds,
    entrants,
    winnerTeamId: findWinner(entrants, winnersByGameId[id]),
    broadcastIsoDate,
    broadcastNetwork
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

function buildProjectionRegionalGames(
  region: string,
  teams: TeamProjection[],
  winnersByGameId: Record<string, string | null>,
  purchaseLookup: Map<string, PurchaseLookupRow>,
  scheduleMap?: EspnScheduleMap | null
) {
  const gameLookup = new Map<string, BracketGame>();
  const seedLookup = new Map(teams.map((team) => [team.seed, team]));
  const rounds: RegionRoundBuild[] = [];
  const regionKey = toRegionKey(region);

  const roundOf64Games = FIRST_ROUND_SEED_PAIRS.map(([leftSeed, rightSeed], index) => {
    const gameId = toGameId(regionKey, "round-of-64", index + 1);
    const entrants: [BracketGameTeam | null, BracketGameTeam | null] = [
      seedLookup.get(leftSeed)
        ? toBracketTeamFromProjection(seedLookup.get(leftSeed)!, purchaseLookup)
        : null,
      seedLookup.get(rightSeed)
        ? toBracketTeamFromProjection(seedLookup.get(rightSeed)!, purchaseLookup)
        : null
    ];
    const game = createGame(
      gameId,
      "roundOf64",
      "Round of 64",
      region,
      index + 1,
      [null, null],
      entrants,
      winnersByGameId,
      scheduleMap
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
        winnersByGameId,
        scheduleMap
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

function buildImportRegionalGames(
  region: string,
  slotGroups: BracketImportTeam[][],
  winnersByGameId: Record<string, string | null>,
  purchaseLookup: Map<string, PurchaseLookupRow>
) {
  const gameLookup = new Map<string, BracketGame>();
  const rounds: RegionRoundBuild[] = [];
  const regionKey = toRegionKey(region);
  const orderedSlotGroups = [...slotGroups].sort((left, right) => left[0]!.seed - right[0]!.seed);
  const playInGames: BracketGame[] = [];
  const slotsBySeed = new Map<number, BracketSlotBuild>();

  orderedSlotGroups.forEach((slotGroup, index) => {
    const first = slotGroup[0];
    if (!first) {
      return;
    }

    if (slotGroup.length > 1) {
      const playInGame = createGame(
        toPlayInGameId(first.playInGroup ?? first.regionSlot),
        "playIn",
        "First Four",
        first.region,
        index + 1,
        [null, null],
        [
          slotGroup[0] ? toBracketTeam(slotGroup[0], purchaseLookup) : null,
          slotGroup[1] ? toBracketTeam(slotGroup[1], purchaseLookup) : null
        ],
        winnersByGameId
      );
      playInGames.push(playInGame);
      gameLookup.set(playInGame.id, playInGame);
      slotsBySeed.set(first.seed, {
        region: first.region,
        seed: first.seed,
        regionSlot: first.regionSlot,
        entrant: getWinnerTeam(playInGame),
        sourceGameId: playInGame.id
      });
      return;
    }

    slotsBySeed.set(first.seed, {
      region: first.region,
      seed: first.seed,
      regionSlot: first.regionSlot,
      entrant: toBracketTeam(first, purchaseLookup),
      sourceGameId: null
    });
  });

  const roundOf64Games = FIRST_ROUND_SEED_PAIRS.map(([leftSeed, rightSeed], index) => {
    const leftSlot = slotsBySeed.get(leftSeed) ?? null;
    const rightSlot = slotsBySeed.get(rightSeed) ?? null;
    const gameId = toGameId(regionKey, "round-of-64", index + 1);
    const entrants: [BracketGameTeam | null, BracketGameTeam | null] = [
      leftSlot?.entrant ?? null,
      rightSlot?.entrant ?? null
    ];
    const game = createGame(
      gameId,
      "roundOf64",
      "Round of 64",
      region,
      index + 1,
      [leftSlot?.sourceGameId ?? null, rightSlot?.sourceGameId ?? null],
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
    playInGames,
    gameLookup
  } satisfies RegionBuild & {
    playInGames: BracketGame[];
    gameLookup: Map<string, BracketGame>;
  };
}

function validateFinalFourPairings(
  regions: Set<string>,
  finalFourPairings: [string, string][]
): string | null {
  if (finalFourPairings.length !== 2) {
    return "Bracket view requires two Final Four regional pairings.";
  }

  const pairedRegions = finalFourPairings.flat();
  if (pairedRegions.length !== 4 || new Set(pairedRegions).size !== 4) {
    return "Bracket view requires unique Final Four region pairings.";
  }

  for (const region of pairedRegions) {
    if (!regions.has(region)) {
      return `Final Four pairing region ${region} is missing from the field.`;
    }
  }

  return null;
}

function buildBracketSlotGroups(teams: BracketImportTeam[]) {
  const groups = new Map<string, BracketImportTeam[]>();
  const orderedKeys: string[] = [];

  for (const team of teams) {
    const key = team.playInGroup ?? team.regionSlot;
    if (!groups.has(key)) {
      groups.set(key, []);
      orderedKeys.push(key);
    }
    groups.get(key)!.push(team);
  }

  return orderedKeys.map((key) => groups.get(key) ?? []).filter((group) => group.length > 0);
}

function validateImportBracketSupport(session: AuctionSession): BracketValidation {
  const bracketImport = session.bracketImport;
  if (!bracketImport) {
    return validateProjectionBracketSupport(session);
  }

  const byRegion = bracketImport.teams.reduce((lookup, team) => {
    const current = lookup.get(team.region) ?? [];
    current.push(team);
    lookup.set(team.region, current);
    return lookup;
  }, new Map<string, BracketImportTeam[]>());

  if (byRegion.size !== 4) {
    return {
      isSupported: false,
      reason: "Bracket view requires exactly four seeded regions."
    };
  }

  const slotGroupsByRegion = new Map<string, BracketImportTeam[][]>();
  for (const [region, teams] of byRegion.entries()) {
    const slotGroups = buildBracketSlotGroups(teams).sort(
      (left, right) => left[0]!.seed - right[0]!.seed
    );
    if (slotGroups.length !== 16) {
      return {
        isSupported: false,
        reason: `Bracket view requires 16 seeded slots in ${region}.`
      };
    }

    const seenSeeds = new Set<number>();
    for (const slotGroup of slotGroups) {
      const first = slotGroup[0];
      if (!first) {
        continue;
      }

      if (
        slotGroup.some(
          (team) => team.seed !== first.seed || team.regionSlot !== first.regionSlot
        )
      ) {
        return {
          isSupported: false,
          reason: `Bracket view found inconsistent slot metadata in ${region} ${first.regionSlot}.`
        };
      }
      if (slotGroup.length > 2) {
        return {
          isSupported: false,
          reason: `Bracket view found more than two teams assigned to ${first.regionSlot}.`
        };
      }
      if (slotGroup.length > 1 && slotGroup.some((team) => !team.isPlayIn)) {
        return {
          isSupported: false,
          reason: `Bracket view found mixed play-in metadata in ${first.regionSlot}.`
        };
      }
      if (slotGroup.length > 1 && slotGroup.some((team) => team.playInGroup !== first.playInGroup)) {
        return {
          isSupported: false,
          reason: `Bracket view found inconsistent play-in group metadata in ${first.regionSlot}.`
        };
      }
      if (seenSeeds.has(first.seed)) {
        return {
          isSupported: false,
          reason: `Bracket view requires one team slot at each seed in ${region}.`
        };
      }
      seenSeeds.add(first.seed);
    }

    for (let seed = 1; seed <= 16; seed += 1) {
      if (!seenSeeds.has(seed)) {
        return {
          isSupported: false,
          reason: `Bracket view requires one team slot at each seed in ${region}.`
        };
      }
    }

    slotGroupsByRegion.set(region, slotGroups);
  }

  const pairingReason = validateFinalFourPairings(
    new Set(slotGroupsByRegion.keys()),
    session.finalFourPairings
  );
  if (pairingReason) {
    return {
      isSupported: false,
      reason: pairingReason
    };
  }

  return {
    isSupported: true,
    source: "import",
    slotGroupsByRegion,
    regionOrder: session.finalFourPairings.flat()
  };
}

function validateProjectionBracketSupport(session: AuctionSession): BracketValidation {
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

  const pairingReason = validateFinalFourPairings(new Set(regionLookup.keys()), session.finalFourPairings);
  if (pairingReason) {
    return {
      isSupported: false,
      reason: pairingReason
    };
  }

  return {
    isSupported: true,
    source: "projection",
    regionLookup,
    regionOrder: session.finalFourPairings.flat()
  };
}

function validateBracketSupport(session: AuctionSession): BracketValidation {
  if (session.bracketImport?.teams.length) {
    return validateImportBracketSupport(session);
  }

  return validateProjectionBracketSupport(session);
}

function pruneInvalidWinners(session: StoredAuctionSession) {
  let changed = true;

  while (changed) {
    changed = false;
    const rebuilt = buildBracket(session);

    for (const [storedGameId, storedWinnerId] of Object.entries(session.bracketState.winnersByGameId)) {
      const rebuiltGame = rebuilt.gameLookup.get(storedGameId);
      const validEntrants =
        rebuiltGame?.entrants.flatMap((entrant) => (entrant ? [entrant.teamId] : [])) ?? [];

      if (!rebuiltGame || storedWinnerId === null || !validEntrants.includes(storedWinnerId)) {
        delete session.bracketState.winnersByGameId[storedGameId];
        changed = true;
      }
    }
  }
}

function buildBracket(session: AuctionSession, scheduleMap?: EspnScheduleMap | null): BracketBuildResult {
  const support = validateBracketSupport(session);
  if (!support.isSupported) {
    return buildUnsupportedBracket(support.reason);
  }

  const purchaseLookup = buildPurchaseLookup(session);
  const gameLookup = new Map<string, BracketGame>();
  const playInGames: BracketGame[] = [];
  const regionBuilds = support.regionOrder.map((region) => {
    if (support.source === "import") {
      const build = buildImportRegionalGames(
        region,
        support.slotGroupsByRegion.get(region) ?? [],
        session.bracketState.winnersByGameId,
        purchaseLookup
      );

      for (const [gameId, game] of build.gameLookup) {
        gameLookup.set(gameId, game);
      }

      playInGames.push(...build.playInGames);

      return {
        name: build.name,
        rounds: build.rounds.map((round) => ({
          key: round.key,
          label: round.label,
          region,
          games: round.games
        }))
      };
    }

    const build = buildProjectionRegionalGames(
      region,
      support.regionLookup.get(region) ?? [],
      session.bracketState.winnersByGameId,
      purchaseLookup,
      scheduleMap
    );

    for (const [gameId, game] of build.gameLookup) {
      gameLookup.set(gameId, game);
    }

    return {
      name: build.name,
      rounds: build.rounds.map((round) => ({
        key: round.key,
        label: round.label,
        region,
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
      session.bracketState.winnersByGameId,
      scheduleMap
    ),
    createGame(
      "final-four-2",
      "finalFour",
      "Final Four",
      null,
      2,
      [rightFinalists[0]?.id ?? null, rightFinalists[1]?.id ?? null],
      [rightFinalists[0] ? getWinnerTeam(rightFinalists[0]) : null, rightFinalists[1] ? getWinnerTeam(rightFinalists[1]) : null],
      session.bracketState.winnersByGameId,
      scheduleMap
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
    session.bracketState.winnersByGameId,
    scheduleMap
  );
  gameLookup.set(championshipGame.id, championshipGame);

  return {
    view: {
      isSupported: true,
      unsupportedReason: null,
      playIns:
        playInGames.length > 0
          ? {
              key: "playIn",
              label: "First Four",
              region: null,
              games: playInGames
            }
          : null,
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

export function buildBracketView(session: AuctionSession, scheduleMap?: EspnScheduleMap | null): BracketViewModel {
  session.bracketState = normalizeBracketState(session.bracketState);
  return buildBracket(session, scheduleMap).view;
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
