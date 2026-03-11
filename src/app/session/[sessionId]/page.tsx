import { notFound } from "next/navigation";
import { AccessGuide } from "@/components/access-guide";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  getAuthenticatedMember,
  requireAuthenticatedMemberForSession
} from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export default async function SessionPage({ params, searchParams }: SessionPageProps) {
  const { sessionId } = await params;
  const { preview } = await searchParams;
  const repository = getSessionRepository();
  const auth = await getAuthenticatedMember();
  if (!auth) {
    return (
      <main className="dashboard-page">
        <section className="admin-shell">
          <AccessGuide
            eyebrow="Session workspace"
            title="Sign in to open this live room"
            message="Use your assigned email and shared room code to enter the live board as an operator or viewer."
            primaryAction={{ href: "/", label: "Go to sign in" }}
          />
        </section>
      </main>
    );
  }

  let currentMember: Awaited<ReturnType<typeof requireAuthenticatedMemberForSession>>;
  try {
    currentMember = await requireAuthenticatedMemberForSession(sessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication required.";
    return (
      <main className="dashboard-page">
        <section className="admin-shell">
          <AccessGuide
            eyebrow="Session workspace"
            title="This room is not available to your current account"
            message={message}
            primaryAction={{
              href: auth.sessionId ? `/session/${auth.sessionId}` : "/",
              label: auth.sessionId ? "Open your assigned room" : "Go to sign in"
            }}
            secondaryAction={{ href: "/", label: "Switch account" }}
          />
        </section>
      </main>
    );
  }

  try {
    const dashboard = await repository.getDashboard(sessionId);
    const viewerPreview = preview === "viewer" && auth.scope === "platform";
    return (
      <DashboardShell
        sessionId={sessionId}
        initialDashboard={dashboard}
        viewerMode={viewerPreview || currentMember.role === "viewer"}
        currentMember={currentMember}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Auction session not found.") {
      notFound();
    }

    throw error;
  }
}
