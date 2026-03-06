import { buildAuthErrorResponse } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";
import { jsonError, jsonOk } from "@/lib/http";
import { rebuildSimulationSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }
    const payload = rebuildSimulationSchema.parse(await request.json());
    const dashboard = await getSessionRepository().rebuildSimulation(sessionId, payload.iterations);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to rebuild simulation.");
  }
}
