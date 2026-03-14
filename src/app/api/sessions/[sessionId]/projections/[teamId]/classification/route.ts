import { buildAuthErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { saveTeamClassificationSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string; teamId: string }>;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { sessionId, teamId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }

    const payload = saveTeamClassificationSchema.parse(await request.json());
    const dashboard = await getSessionRepository().saveTeamClassification(
      sessionId,
      teamId,
      payload
    );
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to save team classification."
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { sessionId, teamId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }

    const dashboard = await getSessionRepository().clearTeamClassification(sessionId, teamId);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to clear team classification."
    );
  }
}
