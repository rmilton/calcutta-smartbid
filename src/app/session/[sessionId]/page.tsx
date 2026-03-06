import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionRepository } from "@/lib/repository";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function SessionPage({ params, searchParams }: SessionPageProps) {
  const { sessionId } = await params;
  const { mode } = await searchParams;
  const repository = getSessionRepository();

  try {
    const dashboard = await repository.getDashboard(sessionId);
    return <DashboardShell sessionId={sessionId} initialDashboard={dashboard} viewerMode={mode === "viewer"} />;
  } catch (error) {
    if (error instanceof Error && error.message === "Auction session not found.") {
      notFound();
    }

    throw error;
  }
}
