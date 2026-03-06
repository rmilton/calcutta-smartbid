import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { saveProjectionOverrideSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string; teamId: string }>;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { sessionId, teamId } = await params;
    const payload = saveProjectionOverrideSchema.parse(await request.json());
    const dashboard = await getSessionRepository().saveProjectionOverride(
      sessionId,
      teamId,
      payload
    );
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to save projection override."
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { sessionId, teamId } = await params;
    const dashboard = await getSessionRepository().clearProjectionOverride(sessionId, teamId);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to clear projection override."
    );
  }
}
