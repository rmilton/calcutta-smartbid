import { buildAuthErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { updateBracketGameSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string; gameId: string }>;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { sessionId, gameId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }

    const payload = updateBracketGameSchema.parse(await request.json());
    const dashboard = await getSessionRepository().updateBracketGame(
      sessionId,
      gameId,
      payload.winnerTeamId
    );
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update bracket game.");
  }
}
