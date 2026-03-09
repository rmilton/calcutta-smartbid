import { getMockProjections } from "@/lib/sample-data";
import {
  ProjectionOverride,
  RemoteProjectionFeed,
  TeamProjection,
  TeamScoutingProfile,
  teamScoutingProfileSchema
} from "@/lib/types";
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
type RawProjection = Omit<TeamProjection, "source">;

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
