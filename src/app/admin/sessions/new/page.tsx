import Link from "next/link";
import { SetupForm } from "@/components/setup-form";
import { requirePlatformAdminPage } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

export default async function NewSessionPage() {
  await requirePlatformAdminPage();
  const adminData = await getSessionRepository().getAdminCenterData();

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <div className="admin-shell__intro">
          <p className="eyebrow">Auction Setup</p>
          <h1>Create a live session</h1>
          <p>
            Configure the room, bankroll rules, participating syndicates, and data
            source before the live board opens.
          </p>
        </div>

        <div className="button-row">
          <Link href="/admin" className="button button-secondary">
            Back to admin center
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
