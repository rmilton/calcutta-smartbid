import { AccessGuide } from "@/components/access-guide";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SessionWorkspaceNav } from "@/components/session-workspace-nav";
import Link from "next/link";
import { SessionAdminCenter } from "@/components/session-admin-center";
import { getAuthenticatedMember, requirePlatformAdmin } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionAdminPage({ params }: PageProps) {
  const auth = await getAuthenticatedMember();
  if (!auth) {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <AccessGuide
            eyebrow="Session workspace"
            title="Sign in to manage room readiness"
            message="Session setup, data imports, and launch controls are part of the platform admin workspace."
            primaryAction={{ href: "/", label: "Go to sign in" }}
          />
        </section>
      </main>
    );
  }

  if (auth.scope !== "platform" || auth.role !== "admin") {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <AccessGuide
            eyebrow="Session workspace"
            title="Only platform admins can manage room readiness"
            message="You are signed into a live room. Return to the live board or switch accounts to access session setup and data controls."
            primaryAction={{
              href: auth.sessionId ? `/session/${auth.sessionId}` : "/",
              label: auth.sessionId ? "Open your live room" : "Go to sign in"
            }}
            secondaryAction={{ href: "/", label: "Switch account" }}
          />
        </section>
      </main>
    );
  }

  await requirePlatformAdmin();
  const { sessionId } = await params;
  const config = await getSessionRepository().getSessionAdminConfig(sessionId);

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <Breadcrumbs
          items={[
            { label: "Platform", href: "/admin" },
            { label: "Sessions", href: "/admin" },
            { label: config.session.name }
          ]}
        />
        <SessionWorkspaceNav current="setup" sessionId={sessionId} showSetup />
        <div className="button-row">
          <Link href="/admin" className="button button-secondary">
            Back to Sessions
          </Link>
          <Link href={`/session/${sessionId}`} className="button button-ghost">
            Open operator board
          </Link>
          <Link href={`/session/${sessionId}?preview=viewer`} className="button button-ghost">
            Open viewer preview
          </Link>
          <Link href={`/csv-analysis?sessionId=${sessionId}`} className="button button-secondary">
            Open analysis
          </Link>
        </div>
        <SessionAdminCenter initialConfig={config} />
      </section>
    </main>
  );
}
