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
    <main className="marketing-page">
      <section className="marketing-hero">
        <div className="surface-card marketing-copy">
          <p className="eyebrow">Live NCAA Calcutta Intelligence</p>
          <h1>Run the room with a premium live-market auction cockpit.</h1>
          <p>
            Calcutta SmartBid gives one operator a focused decision board while the rest
            of the syndicate watches the same bid pulse, sale feed, and portfolio posture
            in sync.
          </p>

          <div className="marketing-feature-list">
            <div className="feature-card">
              <strong>Decision strip</strong>
              <span>Current bid, model ceiling, bankroll impact, and key drivers stay visible.</span>
            </div>
            <div className="feature-card">
              <strong>Shared board</strong>
              <span>Viewer mode turns the current bid into the dominant room-facing signal.</span>
            </div>
            <div className="feature-card">
              <strong>Portfolio discipline</strong>
              <span>Track owned teams, expected value, and conflicts without breaking live flow.</span>
            </div>
          </div>
        </div>

        <AccessForm />
      </section>
    </main>
  );
}
