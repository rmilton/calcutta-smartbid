import { AccessGuide } from "@/components/access-guide";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { SetupForm } from "@/components/setup-form";
import { getAuthenticatedMember, requirePlatformAdmin } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

export default async function NewSessionPage() {
  const auth = await getAuthenticatedMember();
  if (!auth) {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <AccessGuide
            eyebrow="Platform admin workspace"
            title="Sign in to create a session"
            message="Session creation lives in the platform control plane. Sign in with your platform admin credentials first."
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
            eyebrow="Session creation"
            title="Only platform admins can create rooms"
            message="You are currently signed into a live room. Open your assigned room or switch accounts to reach the platform control plane."
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
  const adminData = await getSessionRepository().getAdminCenterData();

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <Breadcrumbs
          items={[
            { label: "Platform", href: "/admin" },
            { label: "Sessions", href: "/admin" },
            { label: "New session" }
          ]}
        />
        <div className="admin-shell__intro">
          <p className="eyebrow">Platform admin workspace</p>
          <h1>Create a session and continue into readiness</h1>
          <p>
            Start the room with operator/viewer assignments, syndicate lineup, room code,
            economics, and an initial data source. You will land in the readiness
            checklist after creation.
          </p>
        </div>

        <div className="button-row">
          <Link href="/admin" className="button button-secondary">
            Back to Sessions
          </Link>
        </div>

        <SetupForm
          platformUsers={adminData.platformUsers}
          syndicateCatalog={adminData.syndicateCatalog}
          dataSources={adminData.dataSources}
        />
      </section>
    </main>
  );
}
