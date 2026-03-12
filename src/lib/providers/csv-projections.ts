import { promises as fs } from "node:fs";
import { TeamProjection, TeamScoutingProfile } from "@/lib/types";
import { buildTeamIntelligence, TeamIntelligence } from "@/lib/team-intelligence";
import { clamp, roundCurrency } from "@/lib/utils";

const DEFAULT_PROVIDER_NAME = "csv-local";
const REGIONS = ["South", "West", "East", "Midwest"] as const;
const TEAM_COUNT = 64;
const TEAMS_PER_REGION = 16;

type CsvProjectionTeam = TeamProjection;

interface ParsedCsvRow {
  teamName: string;
  offense: number;
  defense: number;
  rating: number;
  tempo: number;
  wins: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  offensiveReboundPct: number | null;
  winsAboveBubble: number | null;
}

interface RankedCsvRow extends ParsedCsvRow {
  rank: number;
}

export interface CsvAnalysisTeam {
  id: string;
  name: string;
  shortName: string;
  rank: number;
  rating: number;
  offense: number;
  defense: number;
  tempo: number;
  wins: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  offensiveReboundPct: number | null;
  winsAboveBubble: number | null;
}

export interface CsvTeamAnalysis {
  provider: string;
  teamCount: number;
  teams: CsvAnalysisTeam[];
  intelligence: TeamIntelligence;
}

export interface CsvBudgetOptions {
  bankroll: number;
  targetTeamCount?: number;
  reservePct?: number;
  candidatePoolMultiplier?: number;
  maxSingleTeamPct?: number;
}

export interface CsvBudgetRow {
  teamId: string;
  teamName: string;
  rank: number;
  percentile: number;
  convictionScore: number;
  investableShare: number;
  openingBid: number;
  targetBid: number;
  maxBid: number;
  tier: "core" | "flex" | "depth";
}

export interface CsvBudgetPlan {
  bankroll: number;
  reservePct: number;
  reservedCash: number;
  investableCash: number;
  targetTeamCount: number;
  maxSingleTeamPct: number;
  candidateCount: number;
  rows: CsvBudgetRow[];
  selected: CsvBudgetRow | null;
}

export async function loadCsvProjectionFeed(
  filePath: string,
  providerName = DEFAULT_PROVIDER_NAME
) {
  const csvText = await readCsvFile(filePath);
  return buildCsvProjectionFeed(csvText, providerName);
}

export async function loadCsvTeamAnalysis(
  filePath: string,
  providerName = DEFAULT_PROVIDER_NAME,
  selectedTeamId?: string | null
) {
  const csvText = await readCsvFile(filePath);
  return buildCsvTeamAnalysis(csvText, providerName, selectedTeamId);
}

export async function loadCsvBudgetPlan(
  filePath: string,
  options: CsvBudgetOptions,
  providerName = DEFAULT_PROVIDER_NAME,
  selectedTeamId?: string | null
) {
  const analysis = await loadCsvTeamAnalysis(filePath, providerName, selectedTeamId);
  return buildCsvBudgetPlan(analysis, options, selectedTeamId);
}

export function buildCsvProjectionFeed(
  csvText: string,
  providerName = DEFAULT_PROVIDER_NAME
) {
  const rankedRows = parseAndRankRows(csvText);
  if (rankedRows.length < TEAM_COUNT) {
    throw new Error(
      `Projection CSV must include at least ${TEAM_COUNT} valid teams. Parsed ${rankedRows.length}.`
    );
  }

  return {
    provider: providerName,
    teams: seedAndRegionize(rankedRows.slice(0, TEAM_COUNT), providerName)
  };
}

export function buildCsvTeamAnalysis(
  csvText: string,
  providerName = DEFAULT_PROVIDER_NAME,
  selectedTeamId?: string | null
): CsvTeamAnalysis {
  const rankedRows = parseAndRankRows(csvText);
  const teams = buildAnalysisTeams(rankedRows, providerName);
  const intelligence = buildTeamIntelligence(teams, selectedTeamId);

  return {
    provider: providerName,
    teamCount: teams.length,
    teams: teams.map((team, index) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      rank: index + 1,
      rating: team.rating,
      offense: team.offense,
      defense: team.defense,
      tempo: team.tempo,
      wins: rankedRows[index]?.wins ?? null,
      rankedWins: rankedRows[index]?.rankedWins ?? null,
      threePointPct: rankedRows[index]?.threePointPct ?? null,
      offensiveReboundPct: rankedRows[index]?.offensiveReboundPct ?? null,
      winsAboveBubble: rankedRows[index]?.winsAboveBubble ?? null
    })),
    intelligence
  };
}

export function buildCsvBudgetPlan(
  analysis: CsvTeamAnalysis,
  options: CsvBudgetOptions,
  selectedTeamId?: string | null
): CsvBudgetPlan {
  if (!Number.isFinite(options.bankroll) || options.bankroll <= 0) {
    throw new Error("Bankroll must be a positive number.");
  }

  const bankroll = roundCurrency(options.bankroll);
  const targetTeamCount = clamp(Math.round(options.targetTeamCount ?? 8), 2, 24);
  const reservePct = clamp(options.reservePct ?? 0, 0, 0.7);
  const candidatePoolMultiplier = clamp(options.candidatePoolMultiplier ?? 4, 2, 8);
  const maxSingleTeamPct = clamp(options.maxSingleTeamPct ?? 0.22, 0.08, 0.45);
  const candidateCount = clamp(
    Math.round(targetTeamCount * candidatePoolMultiplier),
    targetTeamCount,
    analysis.intelligence.ranking.length
  );
  const investableCash = roundCurrency(bankroll * (1 - reservePct));
  const reservedCash = roundCurrency(bankroll - investableCash);
  const hardTeamCap = roundCurrency(bankroll * maxSingleTeamPct);

  const rankedPool = analysis.intelligence.ranking.slice(0, candidateCount);
  const selectedRow =
    (selectedTeamId
      ? analysis.intelligence.ranking.find((row) => row.teamId === selectedTeamId) ?? null
      : null);
  const poolRows =
    selectedRow && !rankedPool.some((row) => row.teamId === selectedRow.teamId)
      ? [...rankedPool, selectedRow]
      : rankedPool;

  const convictionRows = poolRows.map((row) => ({
    row,
    conviction: computeConviction(row)
  }));
  const convictionSum = convictionRows.reduce((total, item) => total + item.conviction, 0);
  const fallbackShare = 1 / Math.max(convictionRows.length, 1);

  const rows = convictionRows
    .map(({ row, conviction }) => {
      const share = convictionSum > 0 ? conviction / convictionSum : fallbackShare;
      const rawBid = investableCash * share;
      const targetBid = roundCurrency(Math.min(rawBid, hardTeamCap));
      const maxBid = roundCurrency(Math.min(targetBid * 1.18, hardTeamCap));
      const openingBid = roundCurrency(Math.max(targetBid * 0.62, 1));

      return {
        teamId: row.teamId,
        teamName: row.teamName,
        rank: findTeamRank(analysis, row.teamId),
        percentile: row.percentile,
        convictionScore: roundMetric(conviction, 4),
        investableShare: roundMetric(share, 4),
        openingBid,
        targetBid,
        maxBid,
        tier: classifyTier(row.percentile)
      } satisfies CsvBudgetRow;
    })
    .sort((left, right) => right.targetBid - left.targetBid);

  return {
    bankroll,
    reservePct: roundMetric(reservePct, 4),
    reservedCash,
    investableCash,
    targetTeamCount,
    maxSingleTeamPct: roundMetric(maxSingleTeamPct, 4),
    candidateCount: rows.length,
    rows,
    selected: selectedTeamId ? rows.find((row) => row.teamId === selectedTeamId) ?? null : null
  };
}

function computeConviction(
  row: CsvTeamAnalysis["intelligence"]["ranking"][number]
) {
  const base = Math.max(row.compositeScore, 0.01);
  const coverageAdjustment = 0.82 + row.scoutingCoverage * 0.36;
  const strengthAdjustment = 1 + Math.min(row.strengths.length * 0.035, 0.14);
  const riskAdjustment = 1 - Math.min(row.risks.length * 0.055, 0.22);
  const percentileAdjustment = 0.9 + (row.percentile / 100) * 0.25;
  return base * coverageAdjustment * strengthAdjustment * riskAdjustment * percentileAdjustment;
}

function findTeamRank(analysis: CsvTeamAnalysis, teamId: string) {
  return analysis.teams.find((team) => team.id === teamId)?.rank ?? 0;
}

function classifyTier(percentile: number): CsvBudgetRow["tier"] {
  if (percentile >= 88) {
    return "core";
  }
  if (percentile >= 68) {
    return "flex";
  }
  return "depth";
}

function parseAndRankRows(csvText: string) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("Projection CSV is empty.");
  }

  const headerLookup = buildHeaderLookup(rows[0]);
  const requiredColumns = {
    teamName: getRequiredHeaderIndex(headerLookup, "teamName", ["team name"]),
    offense: getRequiredHeaderIndex(headerLookup, "offense", [
      "adjusted offense efficiency",
      "adjust offense efficiency"
    ]),
    defense: getRequiredHeaderIndex(headerLookup, "defense", [
      "adjusted defense efficiency",
      "adjust defense efficiency"
    ]),
    rating: getRequiredHeaderIndex(headerLookup, "rating", [
      "power rating chance of beating average d1 team",
      "power rating - chance of beating average d1 team"
    ]),
    tempo: getRequiredHeaderIndex(headerLookup, "tempo", ["adjusted tempo"])
  };

  const optionalColumns = {
    wins: getOptionalHeaderIndex(headerLookup, ["wins"]),
    rankedWins: getOptionalHeaderIndex(headerLookup, ["ranked wins"]),
    threePointPct: getOptionalHeaderIndex(headerLookup, [
      "offensive three point percentage",
      "offensive 3 point percentage",
      "offensive 3pt percentage",
      "three point percentage",
      // Some exports repeat this header text for the three-point column.
      "offensive two point percentage"
    ]),
    offensiveReboundPct: getOptionalHeaderIndex(headerLookup, [
      "offensive rebound percentage",
      "offensive rebounds",
      "off reb percentage",
      "off rebounding percentage"
    ]),
    winsAboveBubble: getOptionalHeaderIndex(headerLookup, ["wins above bubble"])
  };

  const parsedRows = rows
    .slice(1)
    .map((row) => parseProjectionRow(row, requiredColumns, optionalColumns))
    .filter((row): row is ParsedCsvRow => row !== null)
    .sort((left, right) => right.rating - left.rating);

  if (parsedRows.length === 0) {
    throw new Error("Projection CSV did not contain any valid team rows.");
  }

  return parsedRows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function seedAndRegionize(teams: RankedCsvRow[], providerName: string): CsvProjectionTeam[] {
  const seeded: CsvProjectionTeam[] = [];
  const usedIds = new Set<string>();

  for (let seed = 1; seed <= TEAMS_PER_REGION; seed += 1) {
    const seedLine = teams.slice((seed - 1) * 4, seed * 4);
    const regionOrder = seed % 2 === 1 ? [...REGIONS] : [...REGIONS].reverse();

    for (let index = 0; index < seedLine.length; index += 1) {
      const team = seedLine[index];
      const region = regionOrder[index];
      const id = toUniqueId(team.teamName, usedIds);
      usedIds.add(id);

      seeded.push({
        id,
        name: team.teamName,
        shortName: buildShortName(team.teamName),
        region,
        seed,
        rating: roundMetric(team.rating, 6),
        offense: roundMetric(team.offense, 3),
        defense: roundMetric(team.defense, 3),
        tempo: roundMetric(team.tempo, 3),
        source: providerName,
        scouting: buildScouting(team)
      });
    }
  }

  return seeded.sort((left, right) => {
    if (left.region === right.region) {
      return left.seed - right.seed;
    }
    return left.region.localeCompare(right.region);
  });
}

function buildAnalysisTeams(rankedRows: RankedCsvRow[], providerName: string): TeamProjection[] {
  const usedIds = new Set<string>();

  return rankedRows.map((row, index) => {
    const id = toUniqueId(row.teamName, usedIds);
    usedIds.add(id);

    return {
      id,
      name: row.teamName,
      shortName: buildShortName(row.teamName),
      // Analysis-only mode does not use bracket simulation, so placeholders are acceptable.
      region: "CSV",
      seed: index + 1,
      rating: roundMetric(row.rating, 6),
      offense: roundMetric(row.offense, 3),
      defense: roundMetric(row.defense, 3),
      tempo: roundMetric(row.tempo, 3),
      source: providerName,
      scouting: buildScouting(row)
    };
  });
}

function buildScouting(team: RankedCsvRow): TeamScoutingProfile {
  return {
    netRank: team.rank,
    kenpomRank: team.rank,
    threePointPct: team.threePointPct ?? undefined,
    rankedWins: team.rankedWins ?? undefined,
    quadWins: team.winsAboveBubble === null ? undefined : inferQuadWins(team.winsAboveBubble),
    offenseStyle: describeOffense(team.offense, team.tempo),
    defenseStyle: describeDefense(team.defense)
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

function parseProjectionRow(
  row: string[],
  requiredColumns: {
    teamName: number;
    offense: number;
    defense: number;
    rating: number;
    tempo: number;
  },
  optionalColumns: {
    wins: number | null;
    rankedWins: number | null;
    threePointPct: number | null;
    offensiveReboundPct: number | null;
    winsAboveBubble: number | null;
  }
): ParsedCsvRow | null {
  const teamName = getCell(row, requiredColumns.teamName).trim();
  const offense = parseNumber(getCell(row, requiredColumns.offense));
  const defense = parseNumber(getCell(row, requiredColumns.defense));
  const rating = parseNumber(getCell(row, requiredColumns.rating));
  const tempo = parseNumber(getCell(row, requiredColumns.tempo));

  if (!teamName || offense === null || defense === null || rating === null || tempo === null) {
    return null;
  }

  return {
    teamName,
    offense,
    defense,
    rating,
    tempo,
    wins:
      optionalColumns.wins === null
        ? null
        : parseNumber(getCell(row, optionalColumns.wins), { asInteger: true }),
    rankedWins:
      optionalColumns.rankedWins === null
        ? null
        : parseNumber(getCell(row, optionalColumns.rankedWins), { asInteger: true }),
    threePointPct:
      optionalColumns.threePointPct === null
        ? null
        : parseNumber(getCell(row, optionalColumns.threePointPct)),
    offensiveReboundPct:
      optionalColumns.offensiveReboundPct === null
        ? null
        : parseNumber(getCell(row, optionalColumns.offensiveReboundPct)),
    winsAboveBubble:
      optionalColumns.winsAboveBubble === null
        ? null
        : parseNumber(getCell(row, optionalColumns.winsAboveBubble))
  };
}

function parseCsv(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const text = csvText.replace(/\r\n?/g, "\n");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      const nextChar = text[index + 1];
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function buildHeaderLookup(headerRow: string[]) {
  return new Map(headerRow.map((header, index) => [normalizeHeader(header), index]));
}

function getRequiredHeaderIndex(
  headerLookup: Map<string, number>,
  label: string,
  aliases: string[]
) {
  const index = getOptionalHeaderIndex(headerLookup, aliases);
  if (index === null) {
    throw new Error(`Projection CSV is missing required column: ${label}.`);
  }
  return index;
}

function getOptionalHeaderIndex(headerLookup: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const index = headerLookup.get(normalizeHeader(alias));
    if (index !== undefined) {
      return index;
    }
  }
  return null;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCell(row: string[], index: number) {
  return row[index] ?? "";
}

function parseNumber(
  value: string,
  options?: {
    asInteger?: boolean;
  }
) {
  const cleaned = value.replace(/\u00a0/g, " ").replace(/,/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (options?.asInteger) {
    return Math.round(parsed);
  }

  return parsed;
}

async function readCsvFile(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(`Unable to read projection CSV at ${filePath}.`);
  }
}

function toUniqueId(teamName: string, usedIds: Set<string>) {
  const baseId = slugify(teamName);
  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function slugify(teamName: string) {
  const slug = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "team";
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

function roundMetric(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
