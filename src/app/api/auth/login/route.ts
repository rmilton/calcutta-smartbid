import { attachAuthCookie, authenticateLandingAccess } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { loginSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const result = await authenticateLandingAccess(payload.email, payload.sharedCode);

    const response = jsonOk({
      redirectTo: result.redirectTo
    });

    return attachAuthCookie(response, result.member);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to sign in.", 401);
  }
}
