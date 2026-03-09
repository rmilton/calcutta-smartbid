import Link from "next/link";
import { SessionAdminCenter } from "@/components/session-admin-center";
import { requirePlatformAdminPage } from "@/lib/auth";
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
        <div className="button-row">
          <Link href="/admin" className="button button-secondary">
            Back to admin center
          </Link>
          <Link href={`/session/${sessionId}`} className="button button-ghost">
            Open live board
          </Link>
        </div>
        <SessionAdminCenter initialConfig={config} />
      </section>
    </main>
  );
}
