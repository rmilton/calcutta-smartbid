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

    let nextStatus: import("@/lib/types").AuctionStatus;
    if (payload.action === "complete") {
      nextStatus = "complete";
    } else if (payload.action === "enter_tournament") {
      nextStatus = "tournament_active";
    } else if (payload.action === "exit_tournament") {
      nextStatus = "complete";
    } else {
      nextStatus = "active";
    }

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
