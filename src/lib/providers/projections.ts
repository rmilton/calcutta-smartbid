import {
  CsvDataSourceConfig,
  DataSource,
  ProjectionOverride,
  RemoteProjectionFeed,
  SessionDataSourceRef,
  TeamProjection,
  TeamScoutingProfile,
  teamScoutingProfileSchema
} from "@/lib/types";
import { buildCsvProjectionFeed } from "@/lib/providers/csv-projections";
import { getMockProjections } from "@/lib/sample-data";
import { uniqueBy } from "@/lib/utils";
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
    await loadCsvProjectionSource(dataSource);
    return;
  }

  await loadApiProjectionSource(dataSource);
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
  const missingHeaders = requiredCsvHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV import is missing headers: ${missingHeaders.join(", ")}.`);
  }

  const indices = Object.fromEntries(headers.map((header, index) => [header, index]));
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
      tempo: Number(row[indices.tempo] ?? "0")
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
