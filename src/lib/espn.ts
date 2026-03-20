export interface EspnBroadcastInfo {
  isoDate: string; // "2026-03-20T17:10:00Z"
  network: string | null; // "CBS"
}

// Key: sorted normalized team names joined with |
export type EspnScheduleMap = Map<string, EspnBroadcastInfo>;

/**
 * Normalizes a team name for fuzzy matching across data sources.
 * Handles common NCAA naming differences:
 *   "Prairie View A&M" → "prairie view"
 *   "St. John's" / "St John's" → "st johns"
 *   "Wright State" / "Wright St" → "wright st"
 *   "Tennessee State" / "Tennessee St" → "tennessee st"
 *   "Queens (N.C.)" → "queens"
 *   "Miami (Ohio)" / "Miami OH" → "miami oh"
 *   "Cal Baptist" / "CA Baptist" → "cal baptist"
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bmiami\s*\((?:oh|ohio)\)/g, "miami oh")
    .replace(/\bmiami\s+(?:oh|ohio)\b/g, "miami oh")
    .replace(/\b(?:ca|cal)\s+baptist\b/g, "cal baptist")
    .replace(/\(.*?\)/g, "")         // Remove parenthetical "(Ohio)", "(N.C.)" etc.
    .replace(/\ba\s*&\s*m\b/g, "")   // Remove A&M entirely
    .replace(/&/g, "")               // Remove remaining &
    .replace(/\bstate\b/g, "st")     // "State" → "st" to match ESPN abbreviation
    .replace(/\./g, "")              // Remove periods
    .replace(/'/g, "")               // Remove apostrophes
    .replace(/[^a-z0-9 ]/g, "")     // Strip any remaining non-alphanumeric
    .replace(/\s+/g, " ")
    .trim();
}

function toTeamPairKey(teamA: string, teamB: string): string {
  return [normalizeTeamName(teamA), normalizeTeamName(teamB)].sort().join("|");
}

function toDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

interface EspnCompetitor {
  team: { displayName: string; shortDisplayName: string };
  homeAway: string;
}

interface EspnBroadcast {
  names: string[];
}

interface EspnCompetition {
  broadcasts: EspnBroadcast[];
  competitors: EspnCompetitor[];
  status: { type: { completed: boolean } };
}

interface EspnEvent {
  date: string;
  competitions: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events: EspnEvent[];
}

async function fetchDateSchedule(dateStr: string): Promise<EspnEvent[]> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as EspnScoreboardResponse;
    return data.events ?? [];
  } catch {
    return [];
  }
}

export async function fetchEspnTournamentSchedule(): Promise<EspnScheduleMap> {
  const scheduleMap: EspnScheduleMap = new Map();

  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    dates.push(toDateString(d));
  }

  const allEventArrays = await Promise.all(dates.map((d) => fetchDateSchedule(d)));
  const allEvents = allEventArrays.flat();

  for (const event of allEvents) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const competitors = competition.competitors ?? [];
    if (competitors.length < 2) continue;

    const network = competition.broadcasts?.[0]?.names?.[0] ?? null;
    const info: EspnBroadcastInfo = { isoDate: event.date, network };

    // Store keys for both shortDisplayName ("Kentucky") and displayName ("Kentucky Wildcats")
    // so lookups work regardless of which name format the bracket uses
    for (const getName of [
      (c: EspnCompetitor) => c.team.shortDisplayName,
      (c: EspnCompetitor) => c.team.displayName
    ]) {
      const names = competitors.map(getName);
      const key = toTeamPairKey(names[0], names[1]);
      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, info);
      }
    }
  }

  return scheduleMap;
}
