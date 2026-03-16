import { buildSessionMemberAuthErrorResponse, requireAuthenticatedSessionMemberForSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { sessionPresenceHeartbeatSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const authError = await buildSessionMemberAuthErrorResponse(sessionId, "viewer");
    if (authError) {
      return authError;
    }

    const auth = await requireAuthenticatedSessionMemberForSession(sessionId, "viewer");
    const payload = sessionPresenceHeartbeatSchema.parse(await request.json());
    const memberId = auth.memberId;

    if (!memberId) {
      throw new Error("Session member login is required.");
    }

    await getSessionRepository().recordViewerPresence(
      sessionId,
      memberId,
      payload.currentView
    );

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to record viewer presence."
    );
  }
}
