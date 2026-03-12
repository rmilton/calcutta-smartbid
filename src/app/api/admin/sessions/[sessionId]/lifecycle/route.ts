import {
  buildPlatformAdminErrorResponse,
  requirePlatformAdmin
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { archiveSessionSchema, deleteSessionSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const authError = await buildPlatformAdminErrorResponse();
    if (authError) {
      return authError;
    }

    const actor = await requirePlatformAdmin();
    const payload = archiveSessionSchema.parse(await request.json());
    const { sessionId } = await params;

    if (payload.action !== "archive") {
      return jsonError("Unsupported lifecycle action.");
    }

    await getSessionRepository().archiveSession(sessionId, actor);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to archive session."
    );
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const authError = await buildPlatformAdminErrorResponse();
    if (authError) {
      return authError;
    }

    const actor = await requirePlatformAdmin();
    const payload = deleteSessionSchema.parse(await request.json());
    const { sessionId } = await params;

    await getSessionRepository().deleteSession(sessionId, actor, payload.confirmationName);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to delete session."
    );
  }
}
