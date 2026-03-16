import fs from "node:fs/promises";
import path from "node:path";

const leagueUrl =
  "https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=NCAA%20Division%20I%20Basketball%20Mens";
const rootDir = process.cwd();
const inputPath = path.join(rootDir, "scripts", "team-logo-prototype-input.json");
const outputDir = path.join(rootDir, "public", "team-logos", "prototype");
const manifestPath = path.join(outputDir, "manifest.json");
const aliasMap = new Map([
  ["saint mary's", ["saint marys", "saint marys ca", "st mary's", "st marys"]],
  ["texas a&m", ["texas am", "texas a and m"]],
  ["mississippi state", ["mississippi st"]],
  ["michigan state", ["michigan st"]],
  ["iowa state", ["iowa st"]],
  ["utah state", ["utah st"]],
  ["san diego state", ["san diego st"]],
  ["uconn", ["connecticut"]],
  ["connecticut", ["uconn"]]
]);
const ncaaFallbackSlugById = new Map([
  ["miami-ohio", "miami-oh"],
  ["smu", "smu"],
  ["mcneese", "mcneese"],
  ["penn", "penn"],
  ["georgia", "georgia"],
  ["saint-louis", "saint-louis"],
  ["kennesaw-state", "kennesaw-st"],
  ["idaho", "idaho"],
  ["santa-clara", "santa-clara"],
  ["long-island-university", "long-island"],
  ["virginia", "virginia"],
  ["wright-state", "wright-st"],
  ["tennessee-state", "tennessee-st"],
  ["hofstra", "hofstra"],
  ["villanova", "villanova"],
  ["iowa", "iowa"],
  ["st-johns", "st-johns-ny"],
  ["uni", "uni"],
  ["ucf", "ucf"],
  ["queens", "queens-nc"],
  ["cal-baptist", "california-baptist"],
  ["furman", "furman"],
  ["miami-fla", "miami-fl"],
  ["missouri", "missouri"],
  ["saint-marys", "st-marys-ca"]
]);

async function main() {
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Prototype input is empty.");
  }

  await fs.mkdir(outputDir, { recursive: true });
  const existingResultsById = await loadExistingResultsById();

  const leagueResponse = await fetch(leagueUrl);
  if (!leagueResponse.ok) {
    throw new Error(`League lookup failed with ${leagueResponse.status}.`);
  }

  const payload = await leagueResponse.json();
  const leagueTeams = Array.isArray(payload?.teams) ? payload.teams : [];
  if (leagueTeams.length === 0) {
    throw new Error("League lookup returned no basketball teams.");
  }

  const results = [];
  for (const requestedTeam of input) {
    const match = await findMatch(requestedTeam, leagueTeams);
    if (!match?.strBadge) {
      const fallbackLogo = await tryFetchNcaaFallback(requestedTeam);
      if (fallbackLogo) {
        results.push(fallbackLogo);
        continue;
      }

      const preservedEntry = await tryReuseExistingResult(requestedTeam.id, existingResultsById);
      if (preservedEntry) {
        results.push(preservedEntry);
        continue;
      }

      results.push({
        id: requestedTeam.id,
        name: requestedTeam.name,
        status: "missing",
        reason: match ? "Matched team had no badge URL." : "No team match found in league feed."
      });
      continue;
    }

    const badgeUrl = match.strBadge;
    const extension = getImageExtension(badgeUrl);
    const fileName = `${requestedTeam.id}.${extension}`;
    const absoluteFilePath = path.join(outputDir, fileName);
    const response = await fetch(badgeUrl);
    if (!response.ok) {
      const fallbackLogo = await tryFetchNcaaFallback(requestedTeam);
      if (fallbackLogo) {
        results.push(fallbackLogo);
        continue;
      }

      const preservedEntry = await tryReuseExistingResult(requestedTeam.id, existingResultsById);
      if (preservedEntry) {
        results.push(preservedEntry);
        continue;
      }

      results.push({
        id: requestedTeam.id,
        name: requestedTeam.name,
        status: "download_failed",
        reason: `Badge download returned ${response.status}.`,
        sourceTeamName: match.strTeam,
        badgeUrl
      });
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(absoluteFilePath, bytes);

    results.push({
      id: requestedTeam.id,
      name: requestedTeam.name,
      status: "downloaded",
      sourceTeamName: match.strTeam,
      alternateName: stringOrNull(match.strTeamAlternate),
      badgeUrl,
      localPath: path.relative(rootDir, absoluteFilePath),
      sizeBytes: bytes.byteLength
    });
  }

  const summary = {
    source: "TheSportsDB NCAA Division I Basketball Mens",
    fetchedAt: new Date().toISOString(),
    requestedCount: input.length,
    downloadedCount: results.filter((result) => result.status === "downloaded").length,
    missingCount: results.filter((result) => result.status === "missing").length,
    failedCount: results.filter((result) => result.status === "download_failed").length
  };

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify({ summary, results }, null, 2)}\n`
  );

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function findMatch(requestedTeam, leagueTeams) {
  const candidates = new Set(buildNameCandidates(requestedTeam.name));
  const leagueMatch =
    leagueTeams.find((team) => {
      const teamNames = buildTeamCandidates(team);
      return teamNames.some((teamName) => candidates.has(teamName));
    }) ?? null;

  if (leagueMatch) {
    return leagueMatch;
  }

  for (const candidate of buildNameCandidates(requestedTeam.name)) {
    const searchMatch = await searchForTeam(candidate, candidates);
    if (searchMatch) {
      return searchMatch;
    }
  }

  return null;
}

function buildNameCandidates(name) {
  const normalized = normalizeName(name);
  const aliasCandidates = aliasMap.get(normalized) ?? [];
  return [normalized, ...aliasCandidates.map((candidate) => normalizeName(candidate))];
}

function buildTeamCandidates(team) {
  return [team?.strTeam, team?.strTeamAlternate]
    .flatMap((value) => (typeof value === "string" && value.trim() ? [normalizeName(value)] : []));
}

async function searchForTeam(candidate, requestedCandidates) {
  const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(candidate)}`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  return (
    teams.find((team) => {
      if (team?.strSport !== "Basketball") {
        return false;
      }
      if (team?.strLeague !== "NCAA Division I Basketball Mens") {
        return false;
      }
      return buildTeamCandidates(team).some((teamName) => requestedCandidates.has(teamName));
    }) ?? null
  );
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getImageExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split(".").pop()?.toLowerCase();
    return extension && /^[a-z0-9]+$/.test(extension) ? extension : "png";
  } catch {
    return "png";
  }
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function loadExistingResultsById() {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const results = Array.isArray(manifest?.results) ? manifest.results : [];
    return new Map(
      results
        .filter((result) => result && typeof result.id === "string")
        .map((result) => [result.id, result])
    );
  } catch {
    return new Map();
  }
}

async function tryReuseExistingResult(teamId, existingResultsById) {
  const existingResult = existingResultsById.get(teamId) ?? null;
  if (
    !existingResult ||
    existingResult.status !== "downloaded" ||
    typeof existingResult.localPath !== "string"
  ) {
    return null;
  }

  const absoluteFilePath = path.join(rootDir, existingResult.localPath);
  try {
    const stats = await fs.stat(absoluteFilePath);
    return {
      ...existingResult,
      sizeBytes: stats.size
    };
  } catch {
    return null;
  }
}

async function tryFetchNcaaFallback(requestedTeam) {
  const slug = ncaaFallbackSlugById.get(requestedTeam.id) ?? null;
  if (!slug) {
    return null;
  }

  const badgeUrl = `https://www.ncaa.com/sites/default/files/images/logos/schools/bgl/${slug}.svg`;
  const response = await fetch(badgeUrl);
  if (!response.ok) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const absoluteFilePath = path.join(outputDir, `${requestedTeam.id}.svg`);
  await fs.writeFile(absoluteFilePath, bytes);

  return {
    id: requestedTeam.id,
    name: requestedTeam.name,
    status: "downloaded",
    sourceTeamName: requestedTeam.name,
    alternateName: null,
    badgeUrl,
    localPath: path.relative(rootDir, absoluteFilePath),
    sizeBytes: bytes.byteLength
  };
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown logo prototype failure.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
