import { parseAccessImportCsv } from "@/lib/access-import";
import { buildPlatformAdminErrorResponse } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSessionRepository } from "@/lib/repository";
import { importSessionAccessCsvSchema } from "@/lib/types";

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
    const payload = importSessionAccessCsvSchema.parse(await request.json());
    const importedRows = parseAccessImportCsv(payload.csvContent);
    const repository = getSessionRepository();
    const config = await repository.getSessionAdminConfig(sessionId);
    const usersByEmail = new Map(
      config.platformUsers.map((user) => [user.email.trim().toLowerCase(), user] as const)
    );
    const assignmentsByUserId = new Map(
      config.accessMembers
        .filter((member) => member.platformUserId)
        .map((member) => [
          member.platformUserId as string,
          {
            platformUserId: member.platformUserId as string,
            role: member.role,
            active: member.active
          }
        ])
    );

    for (const row of importedRows) {
      let user = usersByEmail.get(row.email) ?? null;

      if (!user) {
        user = await repository.createPlatformUser({
          name: row.name,
          email: row.email,
          active: true
        });
        usersByEmail.set(user.email.trim().toLowerCase(), user);
      } else if (!user.active) {
        user = await repository.updatePlatformUser(user.id, { active: true });
        usersByEmail.set(user.email.trim().toLowerCase(), user);
      }

      assignmentsByUserId.set(user.id, {
        platformUserId: user.id,
        role: row.role,
        active: true
      });
    }

    const nextConfig = await repository.updateSessionAccess(
      sessionId,
      Array.from(assignmentsByUserId.values())
    );

    return jsonOk(nextConfig);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to import session access users."
    );
  }
}
