import { redirect } from "next/navigation";
import { getAuthenticatedMember } from "@/lib/auth";
import { getSessionRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface CsvAnalysisPageProps {
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

export default async function CsvAnalysisPage({ searchParams }: CsvAnalysisPageProps) {
  const { sessionId } = await searchParams;
  const repository = getSessionRepository();
  const auth = await getAuthenticatedMember();

  if (!auth) {
    redirect("/");
  }

  let resolvedSessionId: string | null = null;

  if (auth.scope === "session" && auth.sessionId) {
    resolvedSessionId = auth.sessionId;
  } else if (sessionId && sessionId.trim().length > 0) {
    resolvedSessionId = sessionId.trim();
  } else {
    const sessions = await repository.listSessions();
    resolvedSessionId = sessions[0]?.id ?? null;
  }

  if (!resolvedSessionId) {
    redirect("/admin");
  }

  redirect(`/session/${resolvedSessionId}?view=analysis`);
}
