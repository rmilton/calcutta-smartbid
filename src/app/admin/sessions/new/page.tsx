import { SetupForm } from "@/components/setup-form";
import { requirePlatformAdminPage } from "@/lib/auth";
import { getConfiguredMothershipSyndicateName } from "@/lib/config";
import { getSessionRepository } from "@/lib/repository";

export default async function NewSessionPage() {
  await requirePlatformAdminPage();
  const adminData = await getSessionRepository().getAdminCenterData();

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <SetupForm
          platformUsers={adminData.platformUsers}
          syndicateCatalog={adminData.syndicateCatalog}
          dataSources={adminData.dataSources}
          mothershipSyndicateName={getConfiguredMothershipSyndicateName()}
        />
      </section>
    </main>
  );
}
