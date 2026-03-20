import {
  buildAuthErrorResponse,
  requireAuthenticatedMemberForSession
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { updateAuctionStatusSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }

    const actor = await requireAuthenticatedMemberForSession(sessionId, "admin");
    const payload = updateAuctionStatusSchema.parse(await request.json());
    const nextStatus = payload.action === "complete" ? "complete" : "active";

    await getSessionRepository().updateAuctionStatus(sessionId, nextStatus, actor);
    return jsonOk({
      ok: true,
      auctionStatus: nextStatus
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to update auction status."
    );
  }
}
