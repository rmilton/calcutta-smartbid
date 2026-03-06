import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jsonError } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { createSharedCodeLookup } from "@/lib/session-security";
import { AuthenticatedMember, SessionRole } from "@/lib/types";

const AUTH_COOKIE_NAME = "calcutta_smartbid_session";

function getCookieSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "local-calcutta-smartbid-dev-secret"
  );
}

function getRoleRank(role: SessionRole) {
  return role === "admin" ? 2 : 1;
}

function parsePlatformAdminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getPlatformAdminSharedCode() {
  return process.env.PLATFORM_ADMIN_SHARED_CODE?.trim() ?? "";
}

function getPlatformAdminName(email: string) {
  const configured = (process.env.PLATFORM_ADMIN_NAMES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const emails = parsePlatformAdminEmails();
  const index = emails.findIndex((value) => value === email.trim().toLowerCase());
  return configured[index] ?? email;
}

function sign(value: string) {
  return createHmac("sha256", getCookieSecret()).update(value).digest("hex");
}

function encodePayload(payload: AuthenticatedMember) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AuthenticatedMember;
}

function buildCookieValue(payload: AuthenticatedMember) {
  const encoded = encodePayload(payload);
  return `${encoded}.${sign(encoded)}`;
}

function parseCookieValue(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    return decodePayload(encoded);
  } catch {
    return null;
  }
}

export function attachAuthCookie(
  response: Response,
  member: AuthenticatedMember
) {
  const secure = process.env.NODE_ENV === "production";
  response.headers.append(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${buildCookieValue(member)}; Path=/; HttpOnly; SameSite=Lax;${secure ? " Secure;" : ""} Max-Age=${60 * 60 * 12}`
  );
  return response;
}

export function clearAuthCookie(response: Response) {
  const secure = process.env.NODE_ENV === "production";
  response.headers.append(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax;${secure ? " Secure;" : ""} Max-Age=0`
  );
  return response;
}

export async function getAuthenticatedMember() {
  const cookieStore = await cookies();
  return parseCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export async function requireAuthenticatedMemberForSession(
  sessionId: string,
  requiredRole: SessionRole = "viewer"
) {
  const auth = await getAuthenticatedMember();
  if (!auth) {
    throw new Error("Authentication required.");
  }

  if (auth.scope !== "session") {
    throw new Error("Session access requires a session login.");
  }

  if (auth.sessionId !== sessionId) {
    throw new Error("Authenticated session does not match this auction.");
  }

  if (!auth.memberId) {
    throw new Error("Session access requires a session login.");
  }

  if (getRoleRank(auth.role) < getRoleRank(requiredRole)) {
    throw new Error("You do not have permission to perform this action.");
  }

  const repository = getSessionRepository();
  const member = await repository.getAccessMember(sessionId, auth.memberId);
  if (!member || !member.active) {
    throw new Error("Your access to this auction is no longer active.");
  }

  if (member.role !== auth.role) {
    throw new Error("Session role has changed. Please sign in again.");
  }

  return {
    scope: "session",
    sessionId,
    memberId: member.id,
    name: member.name,
    email: member.email,
    role: member.role
  } satisfies AuthenticatedMember;
}

export async function requirePlatformAdmin() {
  const auth = await getAuthenticatedMember();
  if (!auth) {
    throw new Error("Authentication required.");
  }

  if (auth.scope !== "platform" || auth.role !== "admin") {
    throw new Error("Platform admin access is required.");
  }

  return auth;
}

export async function requirePlatformAdminPage() {
  try {
    return await requirePlatformAdmin();
  } catch {
    redirect("/");
  }
}

export async function requireAuthenticatedPageSession(
  sessionId: string,
  requiredRole: SessionRole = "viewer"
) {
  try {
    return await requireAuthenticatedMemberForSession(sessionId, requiredRole);
  } catch {
    redirect("/");
  }
}

export async function buildAuthErrorResponse(
  sessionId: string,
  requiredRole: SessionRole = "viewer"
) {
  try {
    await requireAuthenticatedMemberForSession(sessionId, requiredRole);
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication required.";
    const status = message === "You do not have permission to perform this action." ? 403 : 401;
    return jsonError(message, status);
  }
}

export async function buildPlatformAdminErrorResponse() {
  try {
    await requirePlatformAdmin();
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication required.";
    const status = message === "Platform admin access is required." ? 403 : 401;
    return jsonError(message, status);
  }
}

export async function authenticateLandingAccess(email: string, sharedCode: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const platformEmails = parsePlatformAdminEmails();
  const platformSharedCode = getPlatformAdminSharedCode();

  if (
    platformEmails.includes(normalizedEmail) &&
    platformSharedCode.length > 0 &&
    timingSafeEqual(
      Buffer.from(createSharedCodeLookup(sharedCode)),
      Buffer.from(createSharedCodeLookup(platformSharedCode))
    )
  ) {
    return {
      redirectTo: "/admin/sessions/new",
      member: {
        scope: "platform",
        sessionId: null,
        memberId: null,
        name: getPlatformAdminName(normalizedEmail),
        email: normalizedEmail,
        role: "admin"
      } satisfies AuthenticatedMember
    };
  }

  const result = await getSessionRepository().authenticateMember(email, sharedCode);
  return {
    redirectTo: `/session/${result.sessionId}`,
    member: {
      scope: "session",
      sessionId: result.sessionId,
      memberId: result.member.id,
      name: result.member.name,
      email: result.member.email,
      role: result.member.role
    } satisfies AuthenticatedMember
  };
}

export function hasPlatformAdminConfigured() {
  return parsePlatformAdminEmails().length > 0 && getPlatformAdminSharedCode().length > 0;
}
