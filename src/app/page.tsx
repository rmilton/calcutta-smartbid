import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { getAuthenticatedMember } from "@/lib/auth";

export default async function HomePage() {
  const auth = await getAuthenticatedMember();
  if (auth) {
    if (auth.scope === "platform") {
      redirect("/admin");
    }

    redirect(`/session/${auth.sessionId}`);
  }

  return (
    <main className="marketing-page">
      <section className="marketing-hero">
        <div className="surface-card marketing-copy">
          <p className="eyebrow">Platform control plane + live room</p>
          <h1>Move from session setup to auction floor without losing the thread.</h1>
          <p>
            Calcutta SmartBid separates platform setup, operator controls, and viewer access,
            while keeping each role anchored to the same room context.
          </p>

          <div className="marketing-feature-list">
            <div className="feature-card">
              <strong>Sessions workspace</strong>
              <span>Create rooms, configure access, manage data sources, and launch the room from one control plane.</span>
            </div>
            <div className="feature-card">
              <strong>Operator board</strong>
              <span>Keep the active team, live bid, portfolio posture, and model guidance in one continuous workspace.</span>
            </div>
            <div className="feature-card">
              <strong>Viewer alignment</strong>
              <span>Give passive viewers a read-only board that still looks and feels like the same room.</span>
            </div>
          </div>
        </div>

        <AccessForm />
      </section>
    </main>
  );
}
