import { getConfiguredCsvProjectionFilePath } from "@/lib/config";
import { jsonError, jsonOk } from "@/lib/http";
import { loadCsvProjectionFeed } from "@/lib/providers/csv-projections";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = getConfiguredCsvProjectionFilePath();
    if (!filePath) {
      return jsonError("SPORTS_PROJECTIONS_CSV_FILE is not configured.");
    }

    const providerName = process.env.SPORTS_PROJECTIONS_CSV_PROVIDER ?? "csv-local";
    const feed = await loadCsvProjectionFeed(filePath, providerName);
    return jsonOk(feed);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to build CSV projection feed."
    );
  }
}
