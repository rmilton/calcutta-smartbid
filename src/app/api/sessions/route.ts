import { attachAuthCookie, buildPlatformAdminErrorResponse } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";
import { jsonError, jsonOk } from "@/lib/http";
import { createSessionSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const authError = await buildPlatformAdminErrorResponse();
    if (authError) {
      return authError;
    }

    const payload = createSessionSchema.parse(await request.json());
    const repository = getSessionRepository();
    const session = await repository.createSession(payload);
    const bootstrapMember = session.accessMembers.find((member) => member.role === "admin");
    if (!bootstrapMember) {
      throw new Error("A new auction session must include at least one admin.");
    }

    const response = jsonOk(
      {
        sessionId: session.id
      },
      201
    );
    return attachAuthCookie(response, {
      scope: "session",
      sessionId: session.id,
      memberId: bootstrapMember.id,
      name: bootstrapMember.name,
      email: bootstrapMember.email,
      role: bootstrapMember.role
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create session.");
  }
}
