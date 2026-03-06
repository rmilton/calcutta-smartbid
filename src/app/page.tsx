import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { getAuthenticatedMember } from "@/lib/auth";

export default async function HomePage() {
  const auth = await getAuthenticatedMember();
  if (auth) {
    if (auth.scope === "platform") {
      redirect("/admin/sessions/new");
    }

    redirect(`/session/${auth.sessionId}`);
  }

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Live NCAA Calcutta Intelligence</p>
          <h1>Run the room with simulation-backed bids, ownership risk alerts, and a live syndicate ledger.</h1>
          <p>
            Calcutta SmartBid gives one operator a fast live cockpit while the rest of the syndicate watches the same board in sync.
            Every nomination updates current bid guidance, expected return, and collision risk against teams you already own.
          </p>
          <div className="hero-links">
            <span>Authenticate with your email address and shared code to enter the auction room.</span>
          </div>
        </div>
        <aside className="landing-stats">
          <div>
            <span>Realtime decision loop</span>
            <strong>Sub-second recalculation from cached Monte Carlo outputs</strong>
          </div>
          <div>
            <span>Risk lens</span>
            <strong>Highlights early-round ownership collisions before you overbid</strong>
          </div>
          <div>
            <span>Audit trail</span>
            <strong>Every purchase updates bankroll, ledger, and viewer board immediately</strong>
          </div>
        </aside>
      </section>

      <section id="setup" className="setup-section">
        <AccessForm />
      </section>
    </main>
  );
}
