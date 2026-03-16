import logoManifest from "../../public/team-logos/prototype/manifest.json";
import { AuctionAsset, TeamProjection } from "@/lib/types";

export interface TeamLogoRef {
  teamId?: string | null;
  teamName?: string | null;
}

interface LogoManifestEntry {
  id: string;
  name: string;
  status: string;
  localPath?: string;
  sourceTeamName?: string | null;
  alternateName?: string | null;
}

interface TeamLogoRecord {
  id: string;
  path: string;
  names: string[];
}

const teamNameAliases = new Map<string, string[]>(
  ([
    ["saint mary's", ["saint marys", "st marys", "st mary's"]],
    ["saint marys", ["saint mary's", "st marys", "st mary's"]],
    ["st marys", ["saint mary's", "saint marys", "st mary's"]],
    ["st mary's", ["saint mary's", "saint marys", "st marys"]],
    ["texas a&m", ["texas a and m", "texas am"]],
    ["texas a and m", ["texas a&m", "texas am"]],
    ["texas am", ["texas a&m", "texas a and m"]],
    ["uconn", ["connecticut"]],
    ["connecticut", ["uconn"]],
    ["iowa st", ["iowa state"]],
    ["iowa state", ["iowa st"]],
    ["michigan st", ["michigan state"]],
    ["michigan state", ["michigan st"]],
    ["mississippi st", ["mississippi state"]],
    ["mississippi state", ["mississippi st"]],
    ["san diego st", ["san diego state"]],
    ["san diego state", ["san diego st"]],
    ["utah st", ["utah state"]],
    ["utah state", ["utah st"]]
  ] as Array<[string, string[]]>).map(([key, values]) => [
    normalizeTeamLogoKey(key),
    values.map(normalizeTeamLogoKey)
  ])
);

const teamLogoRecords = buildTeamLogoRecords();
const teamLogoById = new Map(teamLogoRecords.map((record) => [record.id, record]));
const teamLogoByName = new Map<string, TeamLogoRecord>();

for (const record of teamLogoRecords) {
  for (const name of record.names) {
    if (!teamLogoByName.has(name)) {
      teamLogoByName.set(name, record);
    }
  }
}

export function getTeamLogoPath(ref: TeamLogoRef) {
  return resolveTeamLogoRecord(ref)?.path ?? null;
}

export function getAssetLogoRefs(
  asset: AuctionAsset,
  teamLookup?: Map<string, TeamProjection>
): TeamLogoRef[] {
  const refs: TeamLogoRef[] = [];
  const seenPaths = new Set<string>();

  const pushRef = (ref: TeamLogoRef) => {
    const record = resolveTeamLogoRecord(ref);
    if (!record || seenPaths.has(record.path)) {
      return;
    }
    seenPaths.add(record.path);
    refs.push(ref);
  };

  for (const projectionId of asset.projectionIds) {
    const team = teamLookup?.get(projectionId) ?? null;
    if (team) {
      pushRef({ teamId: team.id, teamName: team.name });
    }
  }

  for (const member of asset.members) {
    for (const teamId of [...member.projectionIds, ...member.teamIds]) {
      const team = teamLookup?.get(teamId) ?? null;
      pushRef({
        teamId: team?.id ?? teamId,
        teamName: team?.name ?? member.label
      });
    }
  }

  if (refs.length === 0) {
    pushRef({ teamId: asset.id, teamName: asset.label });
  }

  return refs;
}

export function getTeamLogoFallbackText(ref: TeamLogoRef) {
  const label = ref.teamName?.trim() || ref.teamId?.trim() || "Team";
  const segments = label
    .split(/\s+/u)
    .map((segment) => segment.replace(/[^A-Za-z0-9]/gu, ""))
    .filter(Boolean);

  return (segments[0]?.[0] ?? "") + (segments[1]?.[0] ?? "");
}

function resolveTeamLogoRecord(ref: TeamLogoRef) {
  const candidateIds = [ref.teamId, ref.teamName]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeTeamLogoKey(value));

  for (const candidateId of candidateIds) {
    const byId = teamLogoById.get(candidateId);
    if (byId) {
      return byId;
    }

    const byName = teamLogoByName.get(candidateId);
    if (byName) {
      return byName;
    }

    for (const alias of teamNameAliases.get(candidateId) ?? []) {
      const aliasMatch = teamLogoByName.get(alias);
      if (aliasMatch) {
        return aliasMatch;
      }
    }
  }

  return null;
}

function buildTeamLogoRecords() {
  const manifestResults = Array.isArray(logoManifest?.results) ? logoManifest.results : [];

  return manifestResults.flatMap((entry) => {
    const record = parseManifestEntry(entry);
    return record ? [record] : [];
  });
}

function parseManifestEntry(entry: unknown): TeamLogoRecord | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as LogoManifestEntry;
  if (
    candidate.status !== "downloaded" ||
    typeof candidate.id !== "string" ||
    typeof candidate.localPath !== "string"
  ) {
    return null;
  }

  const names = [candidate.id, candidate.name, candidate.sourceTeamName, candidate.alternateName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeTeamLogoKey);

  for (const name of [...names]) {
    for (const alias of teamNameAliases.get(name) ?? []) {
      names.push(alias);
    }
  }

  return {
    id: normalizeTeamLogoKey(candidate.id),
    path: normalizePublicPath(candidate.localPath),
    names: [...new Set(names)]
  };
}

function normalizePublicPath(localPath: string) {
  const normalized = localPath.startsWith("public/") ? localPath.slice("public".length) : localPath;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeTeamLogoKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/['’.]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
