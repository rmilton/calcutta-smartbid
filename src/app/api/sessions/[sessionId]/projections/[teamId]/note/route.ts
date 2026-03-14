import { buildAuthErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { saveTeamNoteSchema } from "@/lib/types";
import { ZodError } from "zod";

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

    const payload = saveTeamNoteSchema.parse(await request.json());
    const dashboard = await getSessionRepository().saveTeamNote(sessionId, teamId, payload);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(
      error instanceof ZodError
        ? (error.issues[0]?.message ?? "Unable to save team note.")
        : error instanceof Error
          ? error.message
          : "Unable to save team note."
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

    const dashboard = await getSessionRepository().clearTeamNote(sessionId, teamId);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to clear team note.");
  }
}
