import { buildAuthErrorResponse } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";
import { jsonError, jsonOk } from "@/lib/http";
import { updateLiveStateSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }
    const payload = updateLiveStateSchema.parse(await request.json());
    const dashboard = await getSessionRepository().updateLiveState(sessionId, payload);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update live state.");
  }
}
