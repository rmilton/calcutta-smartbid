import { buildPlatformAdminErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { updateSessionFundingSchema } from "@/lib/types";

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
    const payload = updateSessionFundingSchema.parse(await request.json());
    const config = await getSessionRepository().updateSessionFunding(
      sessionId,
      payload.mothershipFunding
    );
    return jsonOk(config);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to update funding settings."
    );
  }
}
