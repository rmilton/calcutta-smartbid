import {
  CsvDataSourceConfig,
  DataSource,
  DataSourcePurpose,
  ProjectionOverride,
  RemoteProjectionFeed,
  SessionDataSourceRef,
  TeamProjection,
  TeamScoutingProfile,
  teamScoutingProfileSchema
} from "@/lib/types";
import { buildCsvProjectionFeed } from "@/lib/providers/csv-projections";
import { getMockProjections } from "@/lib/sample-data";
import { parseSessionAnalysisImport, parseSessionBracketImport } from "@/lib/session-imports";
import { clamp, uniqueBy } from "@/lib/utils";
import { z } from "zod";

const rawProjectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  region: z.string(),
  seed: z.number().int().positive(),
  rating: z.number(),
  offense: z.number(),
  defense: z.number(),
  tempo: z.number(),
  scouting: teamScoutingProfileSchema.optional()
});

const remoteProjectionFeedSchema = z.object({
  provider: z.string(),
  teams: z.array(rawProjectionSchema).min(16)
});

const requiredCsvHeaders = [
  "id",
  "name",
  "shortName",
  "region",
  "seed",
  "rating",
  "offense",
  "defense",
  "tempo"
] as const;

type RawProjection = Omit<TeamProjection, "source">;

export async function loadProjectionsFromSource(
  source: SessionDataSourceRef,
  dataSources: DataSource[]
) {
  if (source.key === "builtin:mock") {
    return {
      provider: "mock",
      teams: validateProjectionFieldShape(getMockProjections())
    };
  }

  const dataSource =
    dataSources.find((candidate) => candidate.id === source.key.replace(/^data-source:/, "")) ??
    null;

  if (!dataSource || !dataSource.active) {
    throw new Error("Selected data source is unavailable.");
  }

  if (dataSource.kind === "csv") {
    return loadCsvProjectionSource(dataSource);
  }

  return loadApiProjectionSource(dataSource);
}

export async function loadProjectionProvider(provider: "mock" | "remote") {
  if (provider === "mock") {
    return {
      provider: "mock",
      teams: validateProjectionFieldShape(getMockProjections())
    };
  }

  const url = process.env.SPORTS_PROJECTIONS_URL;
  if (!url) {
    throw new Error("SPORTS_PROJECTIONS_URL is not configured.");
  }

  const response = await fetch(url, {
    headers: process.env.SPORTS_PROJECTIONS_TOKEN
      ? {
          Authorization: `Bearer ${process.env.SPORTS_PROJECTIONS_TOKEN}`
        }
      : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Projection provider returned ${response.status}.`);
  }

  const parsed = remoteProjectionFeedSchema.parse((await response.json()) as RemoteProjectionFeed);
  return {
    provider: parsed.provider,
    teams: validateProjectionFieldShape(normalizeProjectionFeed(parsed.provider, parsed.teams))
  };
}

export async function testDataSourceConnection(dataSource: DataSource) {
  if (dataSource.kind === "csv") {
    const config = dataSource.config as CsvDataSourceConfig;
    validateCsvDataSource(dataSource.purpose, config.csvContent, dataSource.name, config.fileName);
    return;
  }

  await loadApiProjectionSource(dataSource);
}

export function validateCsvDataSource(
  purpose: DataSourcePurpose,
  csvContent: string,
  sourceName: string,
  fileName?: string | null
) {
  if (purpose === "bracket") {
    parseSessionBracketImport(csvContent, sourceName, fileName);
    return;
  }

  parseSessionAnalysisImport(csvContent, sourceName, fileName);
}

async function loadApiProjectionSource(dataSource: DataSource) {
  const config = dataSource.config as { url: string; bearerToken?: string };
  if (!config.url) {
    throw new Error("API data source is missing a URL.");
  }

  const response = await fetch(config.url, {
    headers: config.bearerToken
      ? {
          Authorization: `Bearer ${config.bearerToken}`
        }
      : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Projection provider returned ${response.status}.`);
  }

  const parsed = remoteProjectionFeedSchema.parse((await response.json()) as RemoteProjectionFeed);
  return {
    provider: parsed.provider || dataSource.name,
    teams: validateProjectionFieldShape(normalizeProjectionFeed(dataSource.name, parsed.teams))
  };
}

function loadCsvProjectionSource(dataSource: DataSource) {
  const config = dataSource.config as CsvDataSourceConfig;
  const providerName = `${dataSource.name} CSV`;

  try {
    const teams = parseProjectionCsv(config.csvContent, dataSource.name);
    return {
      provider: providerName,
      teams: validateProjectionFieldShape(teams)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse CSV.";
    if (!message.startsWith("CSV import is missing headers:")) {
      throw error;
    }

    const fallbackFeed = buildCsvProjectionFeed(config.csvContent, providerName);
    return {
      provider: fallbackFeed.provider,
      teams: validateProjectionFieldShape(fallbackFeed.teams)
    };
  }
}

export function parseProjectionCsv(csvContent: string, provider: string) {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) {
    throw new Error("CSV import must include a header row and at least one team.");
  }

  const headers = rows[0].map((value) => value.trim());
  const normalizedHeaders = headers.map((header) => normalizeCsvHeader(header));
  const missingHeaders = requiredCsvHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV import is missing headers: ${missingHeaders.join(", ")}.`);
  }

  const indices = Object.fromEntries(headers.map((header, index) => [header, index]));
  const scoutingColumns = {
    netRank: findOptionalCsvColumnIndex(normalizedHeaders, ["net rank", "netrank"]),
    kenpomRank: findOptionalCsvColumnIndex(normalizedHeaders, [
      "kenpom rank",
      "kenpomrank",
      "kenpom"
    ]),
    rankedWins: findOptionalCsvColumnIndex(normalizedHeaders, ["ranked wins", "rankedwins"]),
    threePointPct: findOptionalCsvColumnIndex(normalizedHeaders, [
      "offensive three point percentage",
      "offensive 3 point percentage",
      "offensive 3pt percentage",
      "three point percentage",
      "3pt percentage",
      "3pt%",
      "3 point percentage"
    ]),
    q1Wins: findOptionalCsvColumnIndex(normalizedHeaders, [
      "quadrant 1 wins",
      "quad 1 wins",
      "q1 wins"
    ]),
    q2Wins: findOptionalCsvColumnIndex(normalizedHeaders, [
      "quadrant 2 wins",
      "quad 2 wins",
      "q2 wins"
    ]),
    q3Wins: findOptionalCsvColumnIndex(normalizedHeaders, [
      "quadrant 3 wins",
      "quad 3 wins",
      "q3 wins"
    ]),
    q4Wins: findOptionalCsvColumnIndex(normalizedHeaders, [
      "quadrant 4 wins",
      "quad 4 wins",
      "q4 wins"
    ]),
    winsAboveBubble: findOptionalCsvColumnIndex(normalizedHeaders, [
      "wins above bubble",
      "winsabovebubble"
    ])
  };
  const teams = rows.slice(1).filter((row) => row.some((value) => value.trim() !== ""));
  return normalizeProjectionFeed(
    provider,
    teams.map((row) => ({
      id: row[indices.id] ?? "",
      name: row[indices.name] ?? "",
      shortName: row[indices.shortName] ?? "",
      region: row[indices.region] ?? "",
      seed: Number(row[indices.seed] ?? "0"),
      rating: Number(row[indices.rating] ?? "0"),
      offense: Number(row[indices.offense] ?? "0"),
      defense: Number(row[indices.defense] ?? "0"),
      tempo: Number(row[indices.tempo] ?? "0"),
      scouting: parseCsvScoutingProfile(row, scoutingColumns)
    }))
  );
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

function normalizeCsvHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function findOptionalCsvColumnIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseCsvScoutingProfile(
  row: string[],
  columns: {
    netRank: number;
    kenpomRank: number;
    rankedWins: number;
    threePointPct: number;
    q1Wins: number;
    q2Wins: number;
    q3Wins: number;
    q4Wins: number;
    winsAboveBubble: number;
  }
): TeamScoutingProfile | undefined {
  const netRank = parseOptionalCsvNumber(row, columns.netRank, true);
  const explicitKenpomRank = parseOptionalCsvNumber(row, columns.kenpomRank, true);
  const rankedWins = parseOptionalCsvNumber(row, columns.rankedWins, true);
  const threePointPct = parseOptionalCsvNumber(row, columns.threePointPct, false);
  const q1Wins = parseOptionalCsvNumber(row, columns.q1Wins, true);
  const q2Wins = parseOptionalCsvNumber(row, columns.q2Wins, true);
  const q3Wins = parseOptionalCsvNumber(row, columns.q3Wins, true);
  const q4Wins = parseOptionalCsvNumber(row, columns.q4Wins, true);
  const winsAboveBubble = parseOptionalCsvNumber(row, columns.winsAboveBubble, false);

  const quadWins =
    q1Wins !== undefined && q2Wins !== undefined && q3Wins !== undefined && q4Wins !== undefined
      ? {
          q1: q1Wins,
          q2: q2Wins,
          q3: q3Wins,
          q4: q4Wins
        }
      : winsAboveBubble !== undefined
        ? inferQuadWins(winsAboveBubble)
        : undefined;

  const scouting: TeamScoutingProfile = {
    netRank,
    kenpomRank: explicitKenpomRank ?? netRank,
    rankedWins,
    threePointPct,
    quadWins
  };

  return Object.values(scouting).some((value) => value !== undefined) ? scouting : undefined;
}

function parseOptionalCsvNumber(row: string[], index: number, asInteger: boolean) {
  if (index < 0) {
    return undefined;
  }

  const raw = row[index]?.trim();
  if (!raw) {
    return undefined;
  }

  const normalized = raw.endsWith("%") ? raw.slice(0, -1).trim() : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return asInteger ? Math.round(parsed) : parsed;
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

export function normalizeProjectionFeed(provider: string, teams: RawProjection[]): TeamProjection[] {
  return uniqueBy(
    teams
      .map((team) => ({
        ...team,
        source: provider,
        name: team.name.trim(),
        shortName: team.shortName.trim().toUpperCase(),
        region: team.region.trim(),
        seed: Number(team.seed),
        rating: Number(team.rating),
        offense: Number(team.offense),
        defense: Number(team.defense),
        tempo: Number(team.tempo),
        scouting: normalizeScoutingProfile(team.scouting)
      }))
      .sort((left, right) => {
        if (left.region === right.region) {
          return left.seed - right.seed;
        }
        return left.region.localeCompare(right.region);
      }),
    (team) => team.id
  );
}

export function applyProjectionOverrides(
  teams: TeamProjection[],
  overrides: Record<string, ProjectionOverride>
): TeamProjection[] {
  return teams.map((team) => {
    const override = overrides[team.id];
    if (!override) {
      return team;
    }

    return {
      ...team,
      rating: override.rating ?? team.rating,
      offense: override.offense ?? team.offense,
      defense: override.defense ?? team.defense,
      tempo: override.tempo ?? team.tempo,
      source: `${team.source}+override`
    };
  });
}

export function validateProjectionFieldShape(teams: TeamProjection[]) {
  const regions = new Map<string, TeamProjection[]>();
  for (const team of teams) {
    const list = regions.get(team.region) ?? [];
    list.push(team);
    regions.set(team.region, list);
  }

  if (regions.size !== 4) {
    throw new Error("Projection feed must contain exactly four tournament regions.");
  }

  const regionSizes = new Set([...regions.values()].map((group) => group.length));
  if (regionSizes.size !== 1) {
    throw new Error("Projection feed must contain the same number of teams in each region.");
  }

  for (const [region, group] of regions.entries()) {
    const seeds = group.map((team) => team.seed);
    const duplicateSeed = seeds.find((seed, index) => seeds.indexOf(seed) !== index);
    if (duplicateSeed) {
      throw new Error(`Projection feed contains duplicate ${duplicateSeed}-seeds in ${region}.`);
    }
  }

  return teams;
}

function normalizeScoutingProfile(
  scouting: TeamScoutingProfile | undefined
): TeamScoutingProfile | undefined {
  if (!scouting) {
    return undefined;
  }

  const normalized: TeamScoutingProfile = {
    netRank: scouting.netRank ? Number(scouting.netRank) : undefined,
    kenpomRank: scouting.kenpomRank ? Number(scouting.kenpomRank) : undefined,
    threePointPct:
      scouting.threePointPct !== undefined
        ? Number(scouting.threePointPct)
        : undefined,
    rankedWins:
      scouting.rankedWins !== undefined ? Number(scouting.rankedWins) : undefined,
    quadWins: scouting.quadWins
      ? {
          q1: Number(scouting.quadWins.q1),
          q2: Number(scouting.quadWins.q2),
          q3: Number(scouting.quadWins.q3),
          q4: Number(scouting.quadWins.q4)
        }
      : undefined,
    ats: scouting.ats
      ? {
          wins: Number(scouting.ats.wins),
          losses: Number(scouting.ats.losses),
          pushes: Number(scouting.ats.pushes)
        }
      : undefined,
    offenseStyle: scouting.offenseStyle?.trim() || undefined,
    defenseStyle: scouting.defenseStyle?.trim() || undefined
  };

  return Object.values(normalized).some((value) => value !== undefined)
    ? normalized
    : undefined;
}
