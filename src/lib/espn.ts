export interface EspnBroadcastInfo {
  isoDate: string; // "2026-03-20T17:10:00Z"
  network: string | null; // "CBS"
}

// Key: sorted lowercase team names joined with |
export type EspnScheduleMap = Map<string, EspnBroadcastInfo>;

function toTeamPairKey(teamA: string, teamB: string): string {
  return [teamA, teamB].map((n) => n.toLowerCase().trim()).sort().join("|");
}

function toDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

interface EspnCompetitor {
  team: { displayName: string };
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

    const teamNames = competitors.map((c) => c.team.displayName);
    const key = toTeamPairKey(teamNames[0], teamNames[1]);

    // Only store if not already present (first occurrence wins — earlier date)
    if (!scheduleMap.has(key)) {
      const network = competition.broadcasts?.[0]?.names?.[0] ?? null;
      scheduleMap.set(key, {
        isoDate: event.date,
        network
      });
    }
  }

  return scheduleMap;
}
