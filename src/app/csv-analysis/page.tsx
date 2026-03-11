import Link from "next/link";
import { redirect } from "next/navigation";
import { CsvAnalysisWorkbench } from "@/components/csv-analysis-workbench";
import {
  getAuthenticatedMember,
  requireAuthenticatedMemberForSession
} from "@/lib/auth";
import { getConfiguredCsvProjectionFilePath } from "@/lib/config";
import { loadCsvTeamAnalysis } from "@/lib/providers/csv-projections";
import { getSessionRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface CsvAnalysisPageProps {
  searchParams: Promise<{
    teamId?: string;
    sessionId?: string;
    bankroll?: string;
    targetTeams?: string;
    maxSingleTeamPct?: string;
  }>;
}

export default async function CsvAnalysisPage({ searchParams }: CsvAnalysisPageProps) {
  const { teamId, sessionId, bankroll, targetTeams, maxSingleTeamPct } = await searchParams;
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
    return (
      <main className="landing-page">
        <section className="setup-section">
          <div className="section-heading">
            <p className="eyebrow">CSV Analysis</p>
            <h2>No sessions found yet</h2>
          </div>
          <article className="panel">
            <p>Create a session first, then open CSV analysis.</p>
            <p>
              <Link href="/admin/sessions/new">Create session</Link>
            </p>
          </article>
        </section>
      </main>
    );
  }

  const sessionAuth = await requireAuthenticatedMemberForSession(
    resolvedSessionId,
    "viewer"
  );
  const filePath = getConfiguredCsvProjectionFilePath();

  if (!filePath) {
    return (
      <main className="landing-page">
        <section className="setup-section">
          <div className="section-heading">
            <p className="eyebrow">CSV Analysis</p>
            <h2>CSV path is not configured</h2>
          </div>
          <article className="panel">
            <p>
              Set <code>SPORTS_PROJECTIONS_CSV_FILE</code> in your <code>.env</code>.
            </p>
            <p>
              <Link href="/">Back to home</Link>
            </p>
          </article>
        </section>
      </main>
    );
  }

  try {
    const providerName = process.env.SPORTS_PROJECTIONS_CSV_PROVIDER ?? "csv-local";
    const canPersistPortfolio = Boolean(sessionAuth.memberId);
    const analysis = await loadCsvTeamAnalysis(filePath, providerName, teamId);
    const portfolio = canPersistPortfolio
      ? await repository.getCsvAnalysisPortfolio(
          sessionAuth.sessionId as string,
          sessionAuth.memberId as string
        )
      : {
          sessionId: sessionAuth.sessionId as string,
          memberId: "",
          entries: [],
          updatedAt: new Date(0).toISOString()
        };
    return (
      <CsvAnalysisWorkbench
        analysis={analysis}
        sessionId={sessionAuth.sessionId as string}
        initialTeamId={teamId ?? null}
        initialBankroll={parseNumber(bankroll, 10000)}
        initialTargetTeams={parseNumber(targetTeams, 8)}
        initialMaxSingleTeamPct={parseNumber(maxSingleTeamPct, 22)}
        initialOwnedEntries={portfolio.entries}
        persistOwnedEntries={canPersistPortfolio}
      />
    );
  } catch (error) {
    return (
      <main className="landing-page">
        <section className="setup-section">
          <div className="section-heading">
            <p className="eyebrow">CSV Analysis</p>
            <h2>Unable to parse CSV</h2>
          </div>
          <article className="panel">
            <p>{error instanceof Error ? error.message : "Unknown parsing error."}</p>
            <p>
              <Link href="/">Back to home</Link>
            </p>
          </article>
        </section>
      </main>
    );
  }
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
