import { buildAuthErrorResponse } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";
import { jsonError, jsonOk } from "@/lib/http";
import { createPurchaseSchema } from "@/lib/types";

interface RouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }
    const parsed = createPurchaseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError("Enter a bid greater than $0 before recording a purchase.");
    }
    const payload = parsed.data;
    const dashboard = await getSessionRepository().recordPurchase(sessionId, payload);
    return jsonOk(dashboard, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to record purchase.");
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const { sessionId } = await params;
    const authError = await buildAuthErrorResponse(sessionId, "admin");
    if (authError) {
      return authError;
    }

    const purchaseId = new URL(request.url).searchParams.get("purchaseId") ?? undefined;
    const dashboard = await getSessionRepository().undoPurchase(sessionId, purchaseId);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to undo purchase.");
  }
}
