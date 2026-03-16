import {
  AnalysisImportTeam,
  BracketImportTeam,
  NateSilverProjection,
  SessionAnalysisImport,
  SessionBracketImport,
  SessionImportReadiness,
  SessionImportStatus,
  SimulationSnapshot,
  TeamProjection,
  TeamScoutingProfile
} from "@/lib/types";
import { buildPlayInProjectionId } from "@/lib/auction-assets";
import { clamp } from "@/lib/utils";

interface MergeBracketAnalysisResult {
  projections: TeamProjection[];
  issues: string[];
  warnings: string[];
}

const teamNameAliases: Record<string, string[]> = {
  "michigan st": ["michigan state"],
  "michigan state": ["michigan st"],
  "alabama st": ["alabama state"],
  "alabama state": ["alabama st"],
  "mississippi st": ["mississippi state"],
  "mississippi state": ["mississippi st"],
  "iowa st": ["iowa state"],
  "iowa state": ["iowa st"],
  "utah st": ["utah state"],
  "utah state": ["utah st"],
  "san diego st": ["san diego state"],
  "san diego state": ["san diego st"],
  "colorado st": ["colorado state"],
  "colorado state": ["colorado st"],
  "norfolk st": ["norfolk state"],
  "norfolk state": ["norfolk st"],
  "mcneese": ["mcneese st"],
  "mcneese st": ["mcneese"],
  "ole miss": ["mississippi"],
  mississippi: ["ole miss"],
  uconn: ["connecticut"],
  connecticut: ["uconn"],
  omaha: ["nebraska omaha"],
  "nebraska omaha": ["omaha"]
};

const bracketHeaderAliases = {
  id: ["id", "team id", "teamid"],
  name: ["name", "team", "team name", "school"],
  shortName: ["shortname", "short name", "abbr", "abbreviation"],
  region: ["region"],
  seed: ["seed"],
  regionSlot: ["regionslot", "region slot", "slot", "bracket slot", "position", "location on bracket"],
  site: ["site", "location", "host site"],
  subregion: ["subregion", "sub-region", "pod"],
  isPlayIn: ["isplayin", "is play in", "play in", "first four", "play-in"],
  playInGroup: ["playingroup", "play in group", "first four group", "play-in group"],
  playInSeed: ["playinseed", "play in seed", "play-in seed"]
} as const;

const analysisHeaderAliases = {
  teamId: ["teamid", "team id", "id"],
  name: ["name", "team", "team name", "school"],
  shortName: ["shortname", "short name", "abbr", "abbreviation"],
  rating: [
    "rating",
    "power rating",
    "power rating chance of beating average d1 team",
    "power rating - chance of beating average d1 team"
  ],
  offense: ["offense", "adjusted offense efficiency", "adjust offense efficiency"],
  defense: ["defense", "adjusted defense efficiency", "adjust defense efficiency"],
  tempo: ["tempo", "adjusted tempo"],
  netRank: ["net rank", "netrank"],
  kenpomRank: ["kenpom rank", "kenpomrank", "kenpom"],
  rankedWins: ["ranked wins", "rankedwins"],
  threePointPct: [
    "offensive three point percentage",
    "offensive 3 point percentage",
    "offensive 3pt percentage",
    "three point percentage",
    "3pt percentage",
    "3pt%",
    "3 point percentage"
  ],
  q1Wins: ["quadrant 1 wins", "quad 1 wins", "q1 wins"],
  q2Wins: ["quadrant 2 wins", "quad 2 wins", "q2 wins"],
  q3Wins: ["quadrant 3 wins", "quad 3 wins", "q3 wins"],
  q4Wins: ["quadrant 4 wins", "quad 4 wins", "q4 wins"],
  winsAboveBubble: ["wins above bubble", "winsabovebubble"]
  ,
  nateSilverSeed: ["nate silver projection seed"],
  nateSilverRoundOf64: ["nate silver projection round of 64"],
  nateSilverRoundOf32: ["nate silver projection round of 32"],
  nateSilverSweet16: ["nate silver projection sweet 16"],
  nateSilverElite8: ["nate silver projection elite 8"],
  nateSilverFinalFour: ["nate silver projection final four"],
  nateSilverChampionshipGame: ["nate silver projection championship game"],
  nateSilverChampion: ["nate silver projection champion"]
} as const;

export function parseSessionBracketImport(
  csvContent: string,
  sourceName: string,
  fileName?: string | null
): SessionBracketImport {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) {
    throw new Error("Bracket CSV must include a header row and at least one team.");
  }

  const headerLookup = buildHeaderLookup(rows[0]);
  const nameIndex = getRequiredIndex(headerLookup, bracketHeaderAliases.name, "name");
  const regionIndex = getRequiredIndex(headerLookup, bracketHeaderAliases.region, "region");
  const seedIndex = getRequiredIndex(headerLookup, bracketHeaderAliases.seed, "seed");
  const idIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.id);
  const shortNameIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.shortName);
  const regionSlotIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.regionSlot);
  const siteIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.site);
  const subregionIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.subregion);
  const isPlayInIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.isPlayIn);
  const playInGroupIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.playInGroup);
  const playInSeedIndex = getOptionalIndex(headerLookup, bracketHeaderAliases.playInSeed);

  const usedIds = new Set<string>();
  const teams = rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => {
      const name = String(row[nameIndex] ?? "").trim();
      const region = String(row[regionIndex] ?? "").trim();
      const seed = Number(String(row[seedIndex] ?? "").trim());
      if (!name) {
        throw new Error("Bracket CSV contains a row without a team name.");
      }
      if (!region) {
        throw new Error(`Bracket CSV is missing a region for ${name}.`);
      }
      if (!Number.isInteger(seed) || seed <= 0) {
        throw new Error(`Bracket CSV has an invalid seed for ${name}.`);
      }

      const explicitId = stringOrNull(row[idIndex]);
      const id = toUniqueId(explicitId || name, usedIds);
      usedIds.add(id);
      const shortName = stringOrNull(row[shortNameIndex]) ?? buildShortName(name);
      const playInGroup = stringOrNull(row[playInGroupIndex]);
      const playInSeed = numberOrNull(row[playInSeedIndex], true);
      const isPlayIn = parseBooleanLike(row[isPlayInIndex]) || playInGroup !== null;

      return {
        id,
        name,
        shortName,
        region,
        seed,
        regionSlot: stringOrNull(row[regionSlotIndex]) ?? `${region}-${seed}`,
        site: stringOrNull(row[siteIndex]),
        subregion: stringOrNull(row[subregionIndex]),
        isPlayIn,
        playInGroup,
        playInSeed
      } satisfies BracketImportTeam;
    });

  if (teams.length === 0) {
    throw new Error("Bracket CSV did not contain any team rows.");
  }

  return {
    sourceName,
    fileName: fileName ?? null,
    importedAt: new Date().toISOString(),
    teamCount: teams.length,
    teams
  };
}

export function parseSessionAnalysisImport(
  csvContent: string,
  sourceName: string,
  fileName?: string | null
): SessionAnalysisImport {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) {
    throw new Error("Analysis CSV must include a header row and at least one team.");
  }

  const headerLookup = buildHeaderLookup(rows[0]);
  const nameIndex = getRequiredIndex(headerLookup, analysisHeaderAliases.name, "name");
  const ratingIndex = getRequiredIndex(headerLookup, analysisHeaderAliases.rating, "rating");
  const offenseIndex = getRequiredIndex(headerLookup, analysisHeaderAliases.offense, "offense");
  const defenseIndex = getRequiredIndex(headerLookup, analysisHeaderAliases.defense, "defense");
  const tempoIndex = getRequiredIndex(headerLookup, analysisHeaderAliases.tempo, "tempo");
  const teamIdIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.teamId);
  const shortNameIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.shortName);
  const netRankIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.netRank);
  const kenpomRankIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.kenpomRank);
  const rankedWinsIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.rankedWins);
  const threePointPctIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.threePointPct);
  const q1WinsIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.q1Wins);
  const q2WinsIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.q2Wins);
  const q3WinsIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.q3Wins);
  const q4WinsIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.q4Wins);
  const winsAboveBubbleIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.winsAboveBubble);
  const nateSilverSeedIndex = getOptionalIndex(headerLookup, analysisHeaderAliases.nateSilverSeed);
  const nateSilverRoundOf64Index = getOptionalIndex(
    headerLookup,
    analysisHeaderAliases.nateSilverRoundOf64
  );
  const nateSilverRoundOf32Index = getOptionalIndex(
    headerLookup,
    analysisHeaderAliases.nateSilverRoundOf32
  );
  const nateSilverSweet16Index = getOptionalIndex(
    headerLookup,
    analysisHeaderAliases.nateSilverSweet16
  );
  const nateSilverElite8Index = getOptionalIndex(headerLookup, analysisHeaderAliases.nateSilverElite8);
  const nateSilverFinalFourIndex = getOptionalIndex(
    headerLookup,
    analysisHeaderAliases.nateSilverFinalFour
  );
  const nateSilverChampionshipGameIndex = getOptionalIndex(
    headerLookup,
    analysisHeaderAliases.nateSilverChampionshipGame
  );
  const nateSilverChampionIndex = getOptionalIndex(
    headerLookup,
    analysisHeaderAliases.nateSilverChampion
  );

  const parsedTeams = rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => {
      const name = String(row[nameIndex] ?? "").trim();
      if (!name) {
        throw new Error("Analysis CSV contains a row without a team name.");
      }

      const rating = requireNumber(row[ratingIndex], `rating for ${name}`);
      const offense = requireNumber(row[offenseIndex], `offense for ${name}`);
      const defense = requireNumber(row[defenseIndex], `defense for ${name}`);
      const tempo = requireNumber(row[tempoIndex], `tempo for ${name}`);
      const quadWins = buildQuadWins(
        numberOrNull(row[q1WinsIndex], true),
        numberOrNull(row[q2WinsIndex], true),
        numberOrNull(row[q3WinsIndex], true),
        numberOrNull(row[q4WinsIndex], true)
      );

      return {
        teamId: stringOrNull(row[teamIdIndex]),
        name,
        shortName: stringOrNull(row[shortNameIndex]) ?? buildShortName(name),
        rating,
        offense,
        defense,
        tempo,
        scouting: {
          netRank: numberOrNull(row[netRankIndex], true),
          kenpomRank: numberOrNull(row[kenpomRankIndex], true),
          rankedWins: numberOrNull(row[rankedWinsIndex], true),
          threePointPct: numberOrNull(row[threePointPctIndex], false),
          quadWins
        },
        winsAboveBubble: numberOrNull(row[winsAboveBubbleIndex], false),
        nateSilverProjection: buildNateSilverProjection({
          seed: row[nateSilverSeedIndex],
          roundOf64: row[nateSilverRoundOf64Index],
          roundOf32: row[nateSilverRoundOf32Index],
          sweet16: row[nateSilverSweet16Index],
          elite8: row[nateSilverElite8Index],
          finalFour: row[nateSilverFinalFourIndex],
          championshipGame: row[nateSilverChampionshipGameIndex],
          champion: row[nateSilverChampionIndex]
        })
      };
    });

  if (parsedTeams.length === 0) {
    throw new Error("Analysis CSV did not contain any team rows.");
  }

  const sortedByRating = [...parsedTeams].sort((left, right) => right.rating - left.rating);
  const derivedRankLookup = new Map(sortedByRating.map((team, index) => [team, index + 1]));
  const teams = parsedTeams.map((team) => ({
    teamId: team.teamId,
    name: team.name,
    shortName: team.shortName,
    rating: team.rating,
    offense: team.offense,
    defense: team.defense,
    tempo: team.tempo,
    winsAboveBubble: team.winsAboveBubble,
    scouting: enrichScoutingProfile(team, derivedRankLookup.get(team) ?? null),
    nateSilverProjection: team.nateSilverProjection
  })) satisfies AnalysisImportTeam[];

  return {
    sourceName,
    fileName: fileName ?? null,
    importedAt: new Date().toISOString(),
    teamCount: teams.length,
    teams
  };
}

export function mergeBracketAndAnalysisImports(
  bracketImport: SessionBracketImport,
  analysisImport: SessionAnalysisImport
): MergeBracketAnalysisResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const bracketTeams = bracketImport.teams;
  const analysisTeams = enrichAnalysisImportTeams(analysisImport.teams);

  const structureIssues = validateBracketStructure(bracketTeams);
  issues.push(...structureIssues);

  const analysisById = buildAnalysisLookup(analysisTeams, (team) => (team.teamId ? [team.teamId] : []));
  const analysisByName = buildAnalysisLookup(analysisTeams, (team) =>
    buildTeamNameKeys(team.name, team.shortName)
  );
  const analysisByShortName = buildAnalysisLookup(analysisTeams, (team) =>
    team.shortName ? [normalizeKey(team.shortName)] : []
  );
  const matchedAnalysis = new Set<number>();
  const slotGroups = buildBracketSlotGroups(bracketTeams);

  const projections: Array<TeamProjection | null> = slotGroups.map((group) => {
    if (group.length > 1) {
      const matches = group
        .map((team) => ({
          team,
          match:
            findFirstUniqueMatch([team.id], analysisById) ??
            findFirstUniqueMatch(buildTeamNameKeys(team.name, team.shortName), analysisByName) ??
            findFirstUniqueMatch(team.shortName ? [normalizeKey(team.shortName)] : [], analysisByShortName)
        }))
        .filter((entry) => entry.match !== null);

      if (matches.length !== group.length) {
        group.forEach((team) => {
          const hasMatch = matches.some((entry) => entry.team.id === team.id);
          if (!hasMatch) {
            issues.push(`Analysis import is missing metrics for ${team.name}.`);
          }
        });
        return null;
      }

      matches.forEach((entry) => matchedAnalysis.add(entry.match!.index));
      const first = group[0];
      const averaged = averageMatchedTeams(matches.map((entry) => entry.match!.team));
      return {
        id: buildPlayInProjectionId(first),
        name: group.map((team) => team.name).join(" / "),
        shortName: group.map((team) => team.shortName).join("/"),
        region: first.region,
        seed: first.seed,
        rating: averaged.rating,
        offense: averaged.offense,
        defense: averaged.defense,
        tempo: averaged.tempo,
        source: `${bracketImport.sourceName} + ${analysisImport.sourceName}`,
        scouting: averaged.scouting,
        nateSilverProjection: averageNateSilverProjections(
          matches.map((entry) => entry.match!.team.nateSilverProjection)
        )
      } satisfies TeamProjection;
    }

    const team = group[0];
    const match =
      findFirstUniqueMatch([team.id], analysisById) ??
      findFirstUniqueMatch(buildTeamNameKeys(team.name, team.shortName), analysisByName) ??
      findFirstUniqueMatch(team.shortName ? [normalizeKey(team.shortName)] : [], analysisByShortName);

    if (!match) {
      issues.push(`Analysis import is missing metrics for ${team.name}.`);
      return null;
    }

    matchedAnalysis.add(match.index);
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      region: team.region,
      seed: team.seed,
      rating: match.team.rating,
      offense: match.team.offense,
      defense: match.team.defense,
      tempo: match.team.tempo,
      source: `${bracketImport.sourceName} + ${analysisImport.sourceName}`,
      scouting: match.team.scouting,
      nateSilverProjection: match.team.nateSilverProjection
    } satisfies TeamProjection;
  });

  const unmatchedAnalysisRows = analysisTeams.filter((_, index) => !matchedAnalysis.has(index));
  if (unmatchedAnalysisRows.length > 0) {
    warnings.push(
      `${unmatchedAnalysisRows.length} analysis row${unmatchedAnalysisRows.length === 1 ? "" : "s"} did not match a bracket team.`
    );
  }

  return {
    projections: enrichProjectionFieldScouting(
      projections.filter((team): team is TeamProjection => team !== null)
    ),
    issues: uniqueMessages(issues),
    warnings: uniqueMessages(warnings)
  };
}

export function buildSessionImportReadiness(args: {
  bracketImport: SessionBracketImport | null;
  analysisImport: SessionAnalysisImport | null;
  baseProjections: TeamProjection[];
  simulationSnapshot: SimulationSnapshot | null;
}): SessionImportReadiness {
  const { bracketImport, analysisImport, baseProjections, simulationSnapshot } = args;

  if (!bracketImport && !analysisImport) {
    if (baseProjections.length === 0) {
      return {
        mode: "session-imports",
        status: "attention",
        summary: "Session-managed imports still need attention before the room is ready.",
        issues: ["Bracket import is still missing.", "Analysis import is still missing."],
        warnings: [],
        hasBracket: false,
        hasAnalysis: false,
        mergedProjectionCount: 0,
        lastBracketImportAt: null,
        lastAnalysisImportAt: null
      };
    }

    const status: SessionImportStatus = simulationSnapshot ? "ready" : "attention";

    return {
      mode: "legacy",
      status,
      summary:
        status === "ready"
          ? "Legacy projection source is loaded and simulations are ready."
          : "Legacy projection flow still needs a completed import and simulation snapshot.",
      issues: status === "ready" ? [] : ["Simulations have not been rebuilt for the legacy field yet."],
      warnings: [],
      hasBracket: false,
      hasAnalysis: false,
      mergedProjectionCount: baseProjections.length,
      lastBracketImportAt: null,
      lastAnalysisImportAt: null
    };
  }

  const issues: string[] = [];
  const warnings: string[] = [];
  let mergedProjectionCount = 0;

  if (!bracketImport) {
    issues.push("Bracket import is still missing.");
  }
  if (!analysisImport) {
    issues.push("Analysis import is still missing.");
  }

  if (bracketImport && analysisImport) {
    const merge = mergeBracketAndAnalysisImports(bracketImport, analysisImport);
    mergedProjectionCount = merge.projections.length;
    issues.push(...merge.issues);
    warnings.push(...merge.warnings);
    if (!simulationSnapshot && merge.issues.length === 0) {
      issues.push("Simulations have not been rebuilt for the merged bracket and analysis field yet.");
    }
  }

  const status: SessionImportStatus = issues.length === 0 ? "ready" : "attention";

  return {
    mode: "session-imports",
    status,
    summary:
      status === "ready"
        ? "Bracket and analysis imports are aligned and ready for the live room."
        : "Session-managed imports still need attention before the room is ready.",
    issues: uniqueMessages(issues),
    warnings: uniqueMessages(warnings),
    hasBracket: Boolean(bracketImport),
    hasAnalysis: Boolean(analysisImport),
    mergedProjectionCount,
    lastBracketImportAt: bracketImport?.importedAt ?? null,
    lastAnalysisImportAt: analysisImport?.importedAt ?? null
  };
}

function validateBracketStructure(teams: BracketImportTeam[]) {
  const issues: string[] = [];
  const byRegion = new Map<string, BracketImportTeam[]>();

  teams.forEach((team) => {
    const group = byRegion.get(team.region) ?? [];
    group.push(team);
    byRegion.set(team.region, group);
  });

  if (byRegion.size !== 4) {
    issues.push(`Bracket import contains ${byRegion.size} regions. Exactly four regions are required.`);
  }

  const regionSizes = new Set(
    [...byRegion.values()].map((group) => new Set(group.map((team) => team.regionSlot)).size)
  );
  if (regionSizes.size > 1) {
    issues.push("Each bracket region must contain the same number of bracket slots.");
  }

  for (const [region, group] of byRegion.entries()) {
    const slotGroups = buildBracketSlotGroups(group);
    const seenSeeds = new Set<number>();
    const expectedSeedMax = 16;

    if (slotGroups.length !== expectedSeedMax) {
      issues.push(
        `Bracket import contains ${slotGroups.length} bracket slots in ${region}. Exactly 16 slots are required per region.`
      );
    }

    for (const slotGroup of slotGroups) {
      const first = slotGroup[0];
      if (slotGroup.some((team) => team.seed !== first.seed || team.regionSlot !== first.regionSlot)) {
        issues.push(`Bracket import has inconsistent slot metadata in ${region} ${first.regionSlot}.`);
        continue;
      }

      if (slotGroup.length > 2) {
        issues.push(`Bracket import has more than two teams assigned to ${first.regionSlot}.`);
      }

      const isPlayInSlot = slotGroup.length > 1;
      if (isPlayInSlot && slotGroup.some((team) => !team.isPlayIn)) {
        issues.push(`Bracket import mixes play-in and non-play-in rows in ${first.regionSlot}.`);
      }
      if (isPlayInSlot && slotGroup.some((team) => team.playInGroup !== first.playInGroup)) {
        issues.push(`Bracket import uses inconsistent play-in groups for ${first.regionSlot}.`);
      }

      if (seenSeeds.has(first.seed)) {
        issues.push(`Bracket import contains duplicate ${first.seed}-seeds in ${region}.`);
      }
      seenSeeds.add(first.seed);
    }

    if ([...seenSeeds].some((seed) => seed > expectedSeedMax)) {
      issues.push(
        `Bracket import contains out-of-range seeds in ${region}. Expected seeds 1-${expectedSeedMax}.`
      );
    }

    for (let seed = 1; seed <= expectedSeedMax; seed += 1) {
      if (!seenSeeds.has(seed)) {
        issues.push(`Bracket import is missing seed ${seed} in ${region}.`);
      }
    }
  }

  return issues;
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

function averageMatchedTeams(teams: AnalysisImportTeam[]) {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    rating: average(teams.map((team) => team.rating)),
    offense: average(teams.map((team) => team.offense)),
    defense: average(teams.map((team) => team.defense)),
    tempo: average(teams.map((team) => team.tempo)),
    scouting: mergeScoutingProfiles(teams.map((team) => team.scouting))
  };
}

function mergeScoutingProfiles(profiles: Array<TeamScoutingProfile | undefined>) {
  const available = profiles.filter((profile): profile is TeamScoutingProfile => Boolean(profile));
  if (available.length === 0) {
    return undefined;
  }

  const collect = (selector: (profile: TeamScoutingProfile) => number | undefined) =>
    available.map(selector).filter((value): value is number => typeof value === "number");
  const quadProfiles = available
    .map((profile) => profile.quadWins)
    .filter((value): value is NonNullable<TeamScoutingProfile["quadWins"]> => Boolean(value));

  return {
    netRank: roundedAverageOrUndefined(collect((profile) => profile.netRank)),
    kenpomRank: roundedAverageOrUndefined(collect((profile) => profile.kenpomRank)),
    rankedWins: roundedAverageOrUndefined(collect((profile) => profile.rankedWins)),
    threePointPct: averageOrUndefined(collect((profile) => profile.threePointPct)),
    quadWins:
      quadProfiles.length > 0
        ? {
            q1: roundedAverageOrZero(quadProfiles.map((profile) => profile.q1)),
            q2: roundedAverageOrZero(quadProfiles.map((profile) => profile.q2)),
            q3: roundedAverageOrZero(quadProfiles.map((profile) => profile.q3)),
            q4: roundedAverageOrZero(quadProfiles.map((profile) => profile.q4))
          }
        : undefined
  } satisfies TeamScoutingProfile;
}

function averageOrUndefined(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundedAverageOrUndefined(values: number[]) {
  const average = averageOrUndefined(values);
  return average === undefined ? undefined : Math.round(average);
}

function roundedAverageOrZero(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1));
}

function buildAnalysisLookup(
  teams: AnalysisImportTeam[],
  getKeys: (team: AnalysisImportTeam) => string[]
) {
  const lookup = new Map<string, Array<{ team: AnalysisImportTeam; index: number }>>();
  teams.forEach((team, index) => {
    for (const key of getKeys(team)) {
      if (!key) {
        continue;
      }
      const current = lookup.get(key) ?? [];
      current.push({ team, index });
      lookup.set(key, current);
    }
  });
  return lookup;
}

function findFirstUniqueMatch(
  keys: string[],
  lookup: Map<string, Array<{ team: AnalysisImportTeam; index: number }>>
) {
  for (const key of keys) {
    const matches = lookup.get(key) ?? [];
    if (matches.length === 1) {
      return matches[0];
    }
  }
  return null;
}

function buildScoutingProfile(input: {
  netRank: number | null;
  kenpomRank: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  quadWins: TeamScoutingProfile["quadWins"] | undefined;
  offenseStyle?: string;
  defenseStyle?: string;
}) {
  const scouting: TeamScoutingProfile = {
    netRank: input.netRank ?? undefined,
    kenpomRank: input.kenpomRank ?? undefined,
    rankedWins: input.rankedWins ?? undefined,
    threePointPct: input.threePointPct ?? undefined,
    quadWins: input.quadWins,
    offenseStyle: input.offenseStyle,
    defenseStyle: input.defenseStyle
  };
  return Object.values(scouting).some((value) => value !== undefined) ? scouting : undefined;
}

function enrichScoutingProfile(
  team: {
    rating: number;
    offense: number;
    defense: number;
    tempo: number;
    scouting: {
      netRank: number | null;
      kenpomRank: number | null;
      rankedWins: number | null;
      threePointPct: number | null;
      quadWins: TeamScoutingProfile["quadWins"] | undefined;
    };
    winsAboveBubble: number | null;
  },
  derivedRank: number | null
) {
  const explicitQuadWins = team.scouting.quadWins;
  const inferredQuadWins =
    explicitQuadWins ?? (team.winsAboveBubble !== null ? inferQuadWins(team.winsAboveBubble) : undefined);
  const q1Wins = inferredQuadWins?.q1 ?? null;

  return buildScoutingProfile({
    netRank: team.scouting.netRank ?? derivedRank,
    kenpomRank: team.scouting.kenpomRank ?? derivedRank,
    rankedWins: team.scouting.rankedWins ?? inferRankedWins(q1Wins, derivedRank),
    threePointPct: team.scouting.threePointPct,
    quadWins: inferredQuadWins,
    offenseStyle: describeOffense(team.offense, team.tempo),
    defenseStyle: describeDefense(team.defense)
  });
}

export function enrichAnalysisImportTeams(teams: AnalysisImportTeam[]) {
  const sortedByRating = [...teams].sort((left, right) => right.rating - left.rating);
  const derivedRankLookup = new Map(sortedByRating.map((team, index) => [team, index + 1]));

  return teams.map((team) => ({
    ...team,
    scouting: enrichScoutingProfile(
      {
        rating: team.rating,
        offense: team.offense,
        defense: team.defense,
        tempo: team.tempo,
        scouting: {
          netRank: team.scouting?.netRank ?? null,
          kenpomRank: team.scouting?.kenpomRank ?? null,
          rankedWins: team.scouting?.rankedWins ?? null,
          threePointPct: team.scouting?.threePointPct ?? null,
          quadWins: team.scouting?.quadWins
        },
        winsAboveBubble: team.winsAboveBubble ?? null
      },
      derivedRankLookup.get(team) ?? null
    ),
    nateSilverProjection: team.nateSilverProjection
  }));
}

export function enrichProjectionFieldScouting(projections: TeamProjection[]) {
  const sortedByRating = [...projections].sort((left, right) => right.rating - left.rating);
  const derivedRankLookup = new Map(sortedByRating.map((team, index) => [team.id, index + 1]));

  return projections.map((team) => ({
    ...team,
    scouting: enrichScoutingProfile(
      {
        rating: team.rating,
        offense: team.offense,
        defense: team.defense,
        tempo: team.tempo,
        scouting: {
          netRank: team.scouting?.netRank ?? null,
          kenpomRank: team.scouting?.kenpomRank ?? null,
          rankedWins: team.scouting?.rankedWins ?? null,
          threePointPct: team.scouting?.threePointPct ?? null,
          quadWins: team.scouting?.quadWins
        },
        winsAboveBubble: null
      },
      derivedRankLookup.get(team.id) ?? null
    ),
    nateSilverProjection: team.nateSilverProjection
  }));
}

function buildNateSilverProjection(input: {
  seed: string | undefined;
  roundOf64: string | undefined;
  roundOf32: string | undefined;
  sweet16: string | undefined;
  elite8: string | undefined;
  finalFour: string | undefined;
  championshipGame: string | undefined;
  champion: string | undefined;
}) {
  const projection: NateSilverProjection = {
    seed: stringOrNull(input.seed),
    roundOf64: numberOrNull(input.roundOf64, false),
    roundOf32: numberOrNull(input.roundOf32, false),
    sweet16: numberOrNull(input.sweet16, false),
    elite8: numberOrNull(input.elite8, false),
    finalFour: numberOrNull(input.finalFour, false),
    championshipGame: numberOrNull(input.championshipGame, false),
    champion: numberOrNull(input.champion, false)
  };

  return Object.values(projection).some((value) => value !== null) ? projection : undefined;
}

function averageNateSilverProjections(
  projections: Array<NateSilverProjection | undefined>
): NateSilverProjection | undefined {
  const available = projections.filter(
    (projection): projection is NateSilverProjection => Boolean(projection)
  );
  if (available.length === 0) {
    return undefined;
  }

  const averageMetric = (selector: (projection: NateSilverProjection) => number | null) => {
    const values = available
      .map(selector)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) {
      return null;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  return {
    seed: available[0]?.seed ?? null,
    roundOf64: averageMetric((projection) => projection.roundOf64),
    roundOf32: averageMetric((projection) => projection.roundOf32),
    sweet16: averageMetric((projection) => projection.sweet16),
    elite8: averageMetric((projection) => projection.elite8),
    finalFour: averageMetric((projection) => projection.finalFour),
    championshipGame: averageMetric((projection) => projection.championshipGame),
    champion: averageMetric((projection) => projection.champion)
  };
}

function buildQuadWins(
  q1: number | null,
  q2: number | null,
  q3: number | null,
  q4: number | null
) {
  if ([q1, q2, q3, q4].some((value) => value === null)) {
    return undefined;
  }
  return {
    q1: q1 as number,
    q2: q2 as number,
    q3: q3 as number,
    q4: q4 as number
  };
}

function inferQuadWins(winsAboveBubble: number) {
  const signal = winsAboveBubble + 10;
  return {
    q1: clamp(Math.round(signal / 2), 0, 12),
    q2: clamp(Math.round((signal + 4) / 3), 0, 10),
    q3: clamp(Math.round((signal + 8) / 4), 0, 10),
    q4: clamp(Math.round((signal + 12) / 5), 0, 10)
  };
}

function inferRankedWins(q1Wins: number | null, derivedRank: number | null) {
  if (q1Wins === null) {
    return null;
  }

  const bonus = derivedRank !== null && derivedRank <= 16 ? 1 : 0;
  return clamp(Math.round(q1Wins * 0.65 + bonus), 0, 12);
}

function describeOffense(offense: number, tempo: number) {
  if (tempo >= 71.5) {
    return "Transition-forward tempo offense";
  }
  if (offense >= 120) {
    return "Spacing-heavy half-court shot creation";
  }
  if (offense <= 110) {
    return "Paint-leaning offense with selective kick-outs";
  }
  return "Balanced attack with pace control";
}

function describeDefense(defense: number) {
  if (defense <= 93) {
    return "Switch pressure with elite point-of-attack defense";
  }
  if (defense <= 98) {
    return "Disciplined man defense and clean rotations";
  }
  if (defense <= 103) {
    return "Containment-first shell defense";
  }
  return "High-variance defense that concedes runs";
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  const input = content.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function buildHeaderLookup(headers: string[]) {
  return headers.map((header) => normalizeHeader(header));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getRequiredIndex(headers: string[], aliases: readonly string[], label: string) {
  const index = getOptionalIndex(headers, aliases);
  if (index < 0) {
    throw new Error(`CSV import is missing the ${label} column.`);
  }
  return index;
}

function getOptionalIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function stringOrNull(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function numberOrNull(value: string | undefined, integer: boolean) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized.endsWith("%") ? normalized.slice(0, -1).trim() : normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return integer ? Math.round(parsed) : parsed;
}

function requireNumber(value: string | undefined, label: string) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Analysis CSV has an invalid ${label}.`);
  }
  return parsed;
}

function parseBooleanLike(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildTeamNameKeys(name: string, shortName?: string | null) {
  const keys = new Set<string>();
  const normalizedName = normalizeKey(name);
  if (normalizedName) {
    keys.add(normalizedName);
    for (const alias of expandTeamAliases(normalizedName)) {
      keys.add(alias);
    }
  }

  if (shortName) {
    const normalizedShortName = normalizeKey(shortName);
    if (normalizedShortName) {
      keys.add(normalizedShortName);
      for (const alias of expandTeamAliases(normalizedShortName)) {
        keys.add(alias);
      }
    }
  }

  return [...keys];
}

function expandTeamAliases(key: string) {
  return teamNameAliases[key] ?? [];
}

function toUniqueId(base: string, usedIds: Set<string>) {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "team";
  if (!usedIds.has(slug)) {
    return slug;
  }

  let counter = 2;
  while (usedIds.has(`${slug}-${counter}`)) {
    counter += 1;
  }
  return `${slug}-${counter}`;
}

function buildShortName(teamName: string) {
  const words = teamName
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "TEAM";
  }

  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }

  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 5)
    .toUpperCase();
}

function uniqueMessages(messages: string[]) {
  return [...new Set(messages)];
}
