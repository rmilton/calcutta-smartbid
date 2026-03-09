import { SetupForm } from "@/components/setup-form";
import { requirePlatformAdminPage } from "@/lib/auth";

export default async function NewSessionPage() {
  await requirePlatformAdminPage();

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <div className="admin-shell__intro">
          <p className="eyebrow">Auction Setup</p>
          <h1>Create a live session</h1>
          <p>
            Configure the room, bankroll rules, and member access before the live board
            opens.
          </p>
        </div>

        <SetupForm />
      </section>
    </main>
  );
}
