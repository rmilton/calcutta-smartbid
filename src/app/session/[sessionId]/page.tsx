import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuthenticatedPageSession } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  const repository = getSessionRepository();
  const currentMember = await requireAuthenticatedPageSession(sessionId);

  try {
    const dashboard = await repository.getDashboard(sessionId);
    return (
      <DashboardShell
        sessionId={sessionId}
        initialDashboard={dashboard}
        viewerMode={currentMember.role === "viewer"}
        currentMember={currentMember}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Auction session not found.") {
      notFound();
    }

    if (
      error instanceof Error &&
      error.message.includes("must be included in participating syndicates before opening the live room")
    ) {
      return (
        <main className="dashboard-page">
          <section className="surface-card session-hero">
            <div className="session-hero__copy">
              <p className="eyebrow">Live room</p>
              <h1>Room setup incomplete</h1>
              <p>{error.message}</p>
            </div>
            <div className="session-hero__meta">
              <Link href="/" className="button button-secondary">
                Back to login
              </Link>
            </div>
          </section>
        </main>
      );
    }

    throw error;
  }
}
