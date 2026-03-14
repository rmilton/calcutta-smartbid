import { buildPlatformAdminErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { importSessionBracketSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const authError = await buildPlatformAdminErrorResponse();
    if (authError) {
      return authError;
    }

    const { sessionId } = await params;
    const payload = importSessionBracketSchema.parse(await request.json());
    const config = await getSessionRepository().importSessionBracket(sessionId, payload);
    return jsonOk(config);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to import bracket.");
  }
}
