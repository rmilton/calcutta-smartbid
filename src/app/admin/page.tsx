import { AdminCenter } from "@/components/admin-center";
import { requirePlatformAdminPage } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

export default async function AdminPage() {
  const currentAdmin = await requirePlatformAdminPage();
  const repository = getSessionRepository();
  const adminData = await repository.getAdminCenterData();

  return (
    <AdminCenter
      initialData={adminData}
      platformAdminEmail={currentAdmin.email}
    />
  );
}
