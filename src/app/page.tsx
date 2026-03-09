import Link from "next/link";
import { SetupForm } from "@/components/setup-form";

export default function HomePage() {
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
            <Link href="#setup">Create auction session</Link>
            <Link href="/csv-analysis">Open CSV analysis</Link>
            <span>Local MVP with Supabase-ready schema and realtime hooks</span>
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
        <div className="section-heading">
          <p className="eyebrow">Auction setup</p>
          <h2>Create a live session</h2>
        </div>
        <SetupForm />
      </section>
    </main>
  );
}
