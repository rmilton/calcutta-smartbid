import { SetupForm } from "@/components/setup-form";
import { requirePlatformAdminPage } from "@/lib/auth";

export default async function NewSessionPage() {
  await requirePlatformAdminPage();

  return (
    <main className="landing-page">
      <section className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">Auction setup</p>
          <h2>Create a live session</h2>
        </div>
        <SetupForm />
      </section>
    </main>
  );
}
