import { AdminCenter } from "@/components/admin-center";
import { requirePlatformAdminPage } from "@/lib/auth";
import { getConfiguredStorageBackend } from "@/lib/config";
import { getSessionRepository } from "@/lib/repository";

export default async function AdminPage() {
  const currentAdmin = await requirePlatformAdminPage();
  const repository = getSessionRepository();
  const sessions = await repository.listSessions();

  return (
    <AdminCenter
      sessions={sessions}
      storageBackend={getConfiguredStorageBackend()}
      platformAdminEmail={currentAdmin.email}
    />
  );
}
