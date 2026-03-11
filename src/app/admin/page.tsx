import { AccessGuide } from "@/components/access-guide";
import { AdminCenter } from "@/components/admin-center";
import { getAuthenticatedMember, requirePlatformAdmin } from "@/lib/auth";
import { getConfiguredStorageBackend } from "@/lib/config";
import { getSessionRepository } from "@/lib/repository";

export default async function AdminPage() {
  const auth = await getAuthenticatedMember();
  if (!auth) {
    return (
      <main className="admin-page">
        <section className="admin-shell">
          <AccessGuide
            eyebrow="Platform admin workspace"
            title="Sign in to manage sessions"
            message="This workspace controls sessions, directory users, syndicates, and data sources. Sign in with a platform admin email and control-plane code."
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
            eyebrow="Platform admin workspace"
            title="This page is reserved for platform admins"
            message="You are signed into a live room, not the platform control plane. Return to your assigned session or switch accounts."
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

  const currentAdmin = await requirePlatformAdmin();
  const repository = getSessionRepository();
  const adminData = await repository.getAdminCenterData();

  return (
    <AdminCenter
      initialData={adminData}
      storageBackend={getConfiguredStorageBackend()}
      platformAdminEmail={currentAdmin.email}
    />
  );
}
