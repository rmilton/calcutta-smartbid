import { SessionAdminCenter } from "@/components/session-admin-center";
import { requirePlatformAdminPage } from "@/lib/auth";
import { getConfiguredMothershipSyndicateName } from "@/lib/config";
import { getSessionRepository } from "@/lib/repository";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionAdminPage({ params }: PageProps) {
  await requirePlatformAdminPage();
  const { sessionId } = await params;
  const config = await getSessionRepository().getSessionAdminConfig(sessionId);

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <SessionAdminCenter
          initialConfig={config}
          mothershipSyndicateName={getConfiguredMothershipSyndicateName()}
        />
      </section>
    </main>
  );
}
