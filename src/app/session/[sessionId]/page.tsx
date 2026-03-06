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

    throw error;
  }
}
