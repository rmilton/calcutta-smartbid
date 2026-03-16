import { buildPlatformAdminErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const authError = await buildPlatformAdminErrorResponse();
    if (authError) {
      return authError;
    }

    const { sessionId } = await params;
    return jsonOk({
      activeViewers: await getSessionRepository().getActiveSessionViewers(sessionId)
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to load active viewers."
    );
  }
}
