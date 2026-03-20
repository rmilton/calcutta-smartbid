import { requireAuthenticatedMemberForSession } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";
import { jsonError, jsonOk } from "@/lib/http";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const auth = await requireAuthenticatedMemberForSession(sessionId);
    const dashboard =
      auth.role === "viewer"
        ? await getSessionRepository().getDashboard(sessionId, {
            audience: "viewer"
          })
        : await getSessionRepository().getDashboard(sessionId, {
            audience: "operator"
          });
    return jsonOk(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dashboard.";
    const status =
      message === "Auction session not found."
        ? 404
        : message === "You do not have permission to perform this action."
          ? 403
          : message === "Authentication required." ||
              message === "Session access requires a session login." ||
              message === "Authenticated session does not match this auction."
            ? 401
            : 400;
    return jsonError(message, status);
  }
}
