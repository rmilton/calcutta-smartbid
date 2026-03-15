import { AuctionAsset, AuctionAssetMember, BracketImportTeam, SessionBracketImport, TeamProjection } from "@/lib/types";

const BUNDLED_SEEDS = [13, 14, 15, 16];

export function buildAuctionAssets(args: {
  baseProjections: TeamProjection[];
  bracketImport: SessionBracketImport | null;
}): AuctionAsset[] {
  const { baseProjections, bracketImport } = args;
  if (!bracketImport) {
    return baseProjections.map((team) => buildSingleTeamAssetFromProjection(team));
  }

  const projectionLookup = new Map(baseProjections.map((team) => [team.id, team]));
  const teamsByRegion = new Map<string, BracketImportTeam[]>();
  const playInGroups = new Map<string, BracketImportTeam[]>();

  for (const team of bracketImport.teams) {
    const regionGroup = teamsByRegion.get(team.region) ?? [];
    regionGroup.push(team);
    teamsByRegion.set(team.region, regionGroup);

    if (team.playInGroup) {
      const playInGroup = playInGroups.get(team.playInGroup) ?? [];
      playInGroup.push(team);
      playInGroups.set(team.playInGroup, playInGroup);
    }
  }

  const playInMembersBySeedKey = new Map<string, AuctionAssetMember>();
  for (const [groupId, teams] of playInGroups.entries()) {
    const first = teams[0];
    if (!first) {
      continue;
    }

    playInMembersBySeedKey.set(
      buildSeedKey(first.region, first.seed),
      {
        id: groupId,
        type: "play_in_slot",
        label: teams.map((team) => team.name).join(" / "),
        region: first.region,
        seed: first.seed,
        regionSlot: first.regionSlot,
        teamIds: teams.map((team) => team.id),
        projectionIds: [buildPlayInProjectionId(first)],
        unresolved: teams.length > 1
      }
    );
  }

  const assets: AuctionAsset[] = [];
  for (const [region, teams] of teamsByRegion.entries()) {
    const teamsBySeed = new Map<number, BracketImportTeam[]>();
    for (const team of teams) {
      const seedGroup = teamsBySeed.get(team.seed) ?? [];
      seedGroup.push(team);
      teamsBySeed.set(team.seed, seedGroup);
    }

    for (let seed = 1; seed <= 12; seed += 1) {
      const seedKey = buildSeedKey(region, seed);
      const playInMember = playInMembersBySeedKey.get(seedKey);
      if (playInMember) {
        assets.push(buildPlayInAsset(playInMember));
        continue;
      }

      const team = pickBracketRepresentative(teamsBySeed.get(seed) ?? []);
      if (team) {
        assets.push(buildSingleTeamAsset(team, projectionLookup.get(team.id) ?? null));
      }
    }

    const bundleMembers = BUNDLED_SEEDS.flatMap((seed) => {
      const seedKey = buildSeedKey(region, seed);
      const playInMember = playInMembersBySeedKey.get(seedKey);
      if (playInMember) {
        return [playInMember];
      }

      const team = pickBracketRepresentative(teamsBySeed.get(seed) ?? []);
      return team ? [buildTeamMember(team, projectionLookup.get(team.id) ?? null)] : [];
    });

    if (bundleMembers.length > 0) {
      assets.push({
        id: `bundle:${normalizeSlug(region)}:13-16`,
        label: `${region} 13-16 Seeds`,
        type: "seed_bundle",
        region,
        seed: null,
        seedRange: [13, 16],
        memberTeamIds: bundleMembers.flatMap((member) => member.teamIds),
        projectionIds: bundleMembers.flatMap((member) => member.projectionIds),
        members: bundleMembers,
        unresolved: bundleMembers.some((member) => member.unresolved)
      });
    }
  }

  return assets;
}

function buildSingleTeamAsset(team: BracketImportTeam, projection: TeamProjection | null): AuctionAsset {
  const member = buildTeamMember(team, projection);
  return {
    id: team.id,
    label: projection?.name ?? team.name,
    type: "single_team",
    region: team.region,
    seed: team.seed,
    seedRange: null,
    memberTeamIds: member.teamIds,
    projectionIds: member.projectionIds,
    members: [member],
    unresolved: false
  };
}

function buildSingleTeamAssetFromProjection(team: TeamProjection): AuctionAsset {
  return {
    id: team.id,
    label: team.name,
    type: "single_team",
    region: team.region,
    seed: team.seed,
    seedRange: null,
    memberTeamIds: [team.id],
    projectionIds: [team.id],
    members: [
      {
        id: team.id,
        type: "team",
        label: team.name,
        region: team.region,
        seed: team.seed,
        regionSlot: `${team.region}-${team.seed}`,
        teamIds: [team.id],
        projectionIds: [team.id],
        unresolved: false
      }
    ],
    unresolved: false
  };
}

function buildPlayInAsset(member: AuctionAssetMember): AuctionAsset {
  return {
    id: `play-in:${member.id}`,
    label: member.label,
    type: "play_in_slot",
    region: member.region,
    seed: member.seed,
    seedRange: null,
    memberTeamIds: [...member.teamIds],
    projectionIds: [...member.projectionIds],
    members: [member],
    unresolved: member.unresolved
  };
}

function buildTeamMember(team: BracketImportTeam, projection: TeamProjection | null): AuctionAssetMember {
  return {
    id: team.id,
    type: "team",
    label: projection?.name ?? team.name,
    region: team.region,
    seed: team.seed,
    regionSlot: team.regionSlot,
    teamIds: [team.id],
    projectionIds: [projection?.id ?? team.id],
    unresolved: false
  };
}

function pickBracketRepresentative(teams: BracketImportTeam[]) {
  return teams.find((team) => !team.isPlayIn) ?? teams[0] ?? null;
}

function buildSeedKey(region: string, seed: number) {
  return `${region}::${seed}`;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPlayInProjectionId(team: Pick<BracketImportTeam, "playInGroup" | "region" | "seed" | "regionSlot">) {
  const base = team.playInGroup ?? team.regionSlot ?? `${team.region}-${team.seed}`;
  return `slot:${normalizeSlug(base)}`;
}
