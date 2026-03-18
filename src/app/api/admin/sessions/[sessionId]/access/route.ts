import { buildPlatformAdminErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { updateSessionAccessSchema } from "@/lib/types";
import { ZodError } from "zod";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const authError = await buildPlatformAdminErrorResponse();
    if (authError) {
      return authError;
    }

    const { sessionId } = await params;
    const payload = updateSessionAccessSchema.parse(await request.json());
    const config = await getSessionRepository().updateSessionAccess(
      sessionId,
      payload.assignments
    );
    return jsonOk(config);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Unable to update session access.");
    }

    return jsonError(error instanceof Error ? error.message : "Unable to update session access.");
  }
}
