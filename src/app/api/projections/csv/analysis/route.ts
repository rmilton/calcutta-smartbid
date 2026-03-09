import { jsonError, jsonOk } from "@/lib/http";
import { loadCsvTeamAnalysis } from "@/lib/providers/csv-projections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const filePath = process.env.SPORTS_PROJECTIONS_CSV_FILE;
    if (!filePath) {
      return jsonError("SPORTS_PROJECTIONS_CSV_FILE is not configured.");
    }

    const providerName = process.env.SPORTS_PROJECTIONS_CSV_PROVIDER ?? "csv-local";
    const teamId = new URL(request.url).searchParams.get("teamId");
    const analysis = await loadCsvTeamAnalysis(filePath, providerName, teamId);
    return jsonOk(analysis);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to build CSV analysis."
    );
  }
}
