import { getConfiguredCsvProjectionFilePath } from "@/lib/config";
import { jsonError, jsonOk } from "@/lib/http";
import {
  buildCsvBudgetPlan,
  loadCsvTeamAnalysis
} from "@/lib/providers/csv-projections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const filePath = getConfiguredCsvProjectionFilePath();
    if (!filePath) {
      return jsonError("SPORTS_PROJECTIONS_CSV_FILE is not configured.");
    }

    const url = new URL(request.url);
    const bankroll = Number(url.searchParams.get("bankroll") ?? "10000");
    const reservePct = parsePercentInput(url.searchParams.get("reservePct"), 0);
    const teamId = url.searchParams.get("teamId");
    const teamName = url.searchParams.get("team");
    const providerName = process.env.SPORTS_PROJECTIONS_CSV_PROVIDER ?? "csv-local";

    const analysis = await loadCsvTeamAnalysis(filePath, providerName, teamId);
    const inferredTeamId =
      teamId ??
      (teamName
        ? analysis.teams.find(
            (team) => team.name.toLowerCase() === teamName.toLowerCase()
          )?.id ?? null
        : null);

    const plan = buildCsvBudgetPlan(
      analysis,
      {
        bankroll,
        reservePct
      },
      inferredTeamId
    );

    return jsonOk({
      ...plan,
      requestedTeam: teamName ?? null
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to generate CSV bid guidance."
    );
  }
}

function parsePercentInput(rawValue: string | null, fallback: number) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}
