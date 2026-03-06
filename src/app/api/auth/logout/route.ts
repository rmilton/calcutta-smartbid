import { clearAuthCookie } from "@/lib/auth";
import { jsonOk } from "@/lib/http";

export async function POST() {
  const response = jsonOk({ ok: true });
  return clearAuthCookie(response);
}
