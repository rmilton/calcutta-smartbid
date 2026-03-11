import { AccessGuide } from "@/components/access-guide";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SessionWorkspaceNav } from "@/components/session-workspace-nav";
import Link from "next/link";
import { CsvAnalysisWorkbench } from "@/components/csv-analysis-workbench";
import {
  getAuthenticatedMember,
  requireAuthenticatedMemberForSession
} from "@/lib/auth";
import {
  buildCsvTeamAnalysis,
  loadCsvTeamAnalysis
} from "@/lib/providers/csv-projections";
import { getSessionRepository } from "@/lib/repository";
import type { CsvDataSourceConfig, DataSource } from "@/lib/types";

export const dynamic = "force-dynamic";
const LOCAL_SOURCE_KEY = "local";

interface CsvAnalysisPageProps {
  searchParams: Promise<{
    teamId?: string;
    sessionId?: string;
    bankroll?: string;
    targetTeams?: string;
    maxSingleTeamPct?: string;
    sourceKey?: string;
  }>;
}

export default async function CsvAnalysisPage({ searchParams }: CsvAnalysisPageProps) {
  const { teamId, sessionId, bankroll, targetTeams, maxSingleTeamPct, sourceKey } =
    await searchParams;
  const repository = getSessionRepository();
  const auth = await getAuthenticatedMember();
  if (!auth) {
    return (
      <main className="landing-page">
        <section className="setup-section">
          <AccessGuide
            eyebrow="Session analysis"
            title="Sign in to open analysis"
            message="Analysis is tied to a specific live room. Sign in first, then return here with your assigned session access."
            primaryAction={{ href: "/", label: "Go to sign in" }}
          />
        </section>
      </main>
    );
  }
  const adminData = await repository.getAdminCenterData();
  const uploadedCsvSources = adminData.dataSources.filter(
    (source): source is DataSource => source.kind === "csv"
  );

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

  const session = await repository.getSession(resolvedSessionId);
  if (!session) {
    return (
      <main className="landing-page">
        <section className="setup-section">
          <AccessGuide
            eyebrow="Session analysis"
            title="This session no longer exists"
            message="The selected room could not be found. Start from Sessions and choose a valid room."
            primaryAction={{
              href: auth.scope === "platform" ? "/admin" : auth.sessionId ? `/session/${auth.sessionId}` : "/",
              label: auth.scope === "platform" ? "Open Sessions" : auth.sessionId ? "Open your live room" : "Go to sign in"
            }}
          />
        </section>
      </main>
    );
  }

  let sessionAuth;
  try {
    sessionAuth = await requireAuthenticatedMemberForSession(resolvedSessionId, "viewer");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication required.";
    return (
      <main className="landing-page">
        <section className="setup-section">
          <AccessGuide
            eyebrow="Session analysis"
            title="This analysis view is not available to your current account"
            message={message}
            primaryAction={{
              href: auth.scope === "platform" ? "/admin" : auth.sessionId ? `/session/${auth.sessionId}` : "/",
              label: auth.scope === "platform" ? "Open Sessions" : auth.sessionId ? "Open your live room" : "Go to sign in"
            }}
            secondaryAction={{ href: "/", label: "Switch account" }}
          />
        </section>
      </main>
    );
  }
  const filePath = process.env.SPORTS_PROJECTIONS_CSV_FILE;
  const resolvedSource = resolveCsvAnalysisSource(sourceKey, filePath, uploadedCsvSources);
  const sourceOptions = buildSourceOptions(filePath, uploadedCsvSources);

  if (!resolvedSource) {
    return (
      <main className="landing-page">
        <section className="setup-section">
          <div className="section-heading">
            <p className="eyebrow">CSV Analysis</p>
            <h2>No CSV sources configured</h2>
          </div>
          <article className="panel">
            <p>
              Set <code>SPORTS_PROJECTIONS_CSV_FILE</code> in your <code>.env</code> or upload
              a CSV source from the admin center data page.
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
    const canManageOwnedTeams = Boolean(sessionAuth.memberId);
    const [analysis, portfolio] = await Promise.all([
      resolvedSource.type === "uploaded"
        ? Promise.resolve(
            buildCsvTeamAnalysis(
              getCsvConfig(resolvedSource.source).csvContent,
              resolvedSource.providerName,
              teamId
            )
          )
        : loadCsvTeamAnalysis(resolvedSource.filePath, resolvedSource.providerName, teamId),
      canManageOwnedTeams
        ? repository.getCsvAnalysisPortfolio(
            sessionAuth.sessionId as string,
            sessionAuth.memberId as string
          )
        : Promise.resolve({
            sessionId: sessionAuth.sessionId as string,
            memberId: "",
            entries: [],
            updatedAt: new Date(0).toISOString()
          })
    ]);
    return (
      <main className="landing-page">
        <section className="setup-section">
          <Breadcrumbs
            items={[
              { label: session.name, href: `/session/${resolvedSessionId}` },
              { label: "Analysis" }
            ]}
          />
          <div className="context-header">
            <div className="context-header__copy">
              <p className="eyebrow">Session analysis</p>
              <h1>{session.name}</h1>
              <p>
                Compare uploaded CSV sources, review team profiles, and keep analysis tied
                to the same session context as the live board.
              </p>
            </div>
            <div className="context-header__meta">
              <span className="status-pill">
                {sessionAuth.memberId ? "Operator analysis" : "Platform analysis"}
              </span>
              <span className="status-pill">Source {resolvedSource.label}</span>
            </div>
          </div>
          <SessionWorkspaceNav
            current="analysis"
            sessionId={resolvedSessionId}
            showSetup={auth.scope === "platform"}
          />
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Source selection</p>
                <h3>{resolvedSource.label}</h3>
              </div>
            </div>
            <SourcePickerForm
              sessionId={resolvedSessionId}
              teamId={teamId}
              bankroll={bankroll}
              targetTeams={targetTeams}
              maxSingleTeamPct={maxSingleTeamPct}
              selectedSourceKey={resolvedSource.key}
              sourceOptions={sourceOptions}
            />
          </article>
          <CsvAnalysisWorkbench
            analysis={analysis}
            sessionId={sessionAuth.sessionId as string}
            initialTeamId={teamId ?? null}
            initialBankroll={parseNumber(bankroll, 10000)}
            initialTargetTeams={parseNumber(targetTeams, 8)}
            initialMaxSingleTeamPct={parseNumber(maxSingleTeamPct, 22)}
            initialOwnedEntries={portfolio.entries}
            canManageOwnedTeams={canManageOwnedTeams}
          />
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="landing-page">
        <section className="setup-section">
          <Breadcrumbs
            items={[
              { label: session.name, href: `/session/${resolvedSessionId}` },
              { label: "Analysis" }
            ]}
          />
          <div className="context-header">
            <div className="context-header__copy">
              <p className="eyebrow">Session analysis</p>
              <h1>{session.name}</h1>
              <p>
                The selected source could not be parsed. Choose a different uploaded file or
                fall back to the local CSV source for this room.
              </p>
            </div>
          </div>
          <SessionWorkspaceNav
            current="analysis"
            sessionId={resolvedSessionId}
            showSetup={auth.scope === "platform"}
          />
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Source selection</p>
                <h3>{resolvedSource.label}</h3>
              </div>
            </div>
            <SourcePickerForm
              sessionId={resolvedSessionId}
              teamId={teamId}
              bankroll={bankroll}
              targetTeams={targetTeams}
              maxSingleTeamPct={maxSingleTeamPct}
              selectedSourceKey={resolvedSource.key}
              sourceOptions={sourceOptions}
            />
          </article>
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

function SourcePickerForm({
  sessionId,
  teamId,
  bankroll,
  targetTeams,
  maxSingleTeamPct,
  selectedSourceKey,
  sourceOptions
}: {
  sessionId: string;
  teamId?: string;
  bankroll?: string;
  targetTeams?: string;
  maxSingleTeamPct?: string;
  selectedSourceKey: string;
  sourceOptions: Array<{ key: string; label: string }>;
}) {
  return (
    <form method="get" className="form-stack">
      <label>
        <span>Analysis source</span>
        <select name="sourceKey" defaultValue={selectedSourceKey}>
          {sourceOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="sessionId" value={sessionId} />
      {teamId ? <input type="hidden" name="teamId" value={teamId} /> : null}
      {bankroll ? <input type="hidden" name="bankroll" value={bankroll} /> : null}
      {targetTeams ? <input type="hidden" name="targetTeams" value={targetTeams} /> : null}
      {maxSingleTeamPct ? (
        <input type="hidden" name="maxSingleTeamPct" value={maxSingleTeamPct} />
      ) : null}
      <div className="button-row">
        <button type="submit" className="button button-secondary">
          Load source
        </button>
      </div>
      <p className="viewer-note">
        Uploaded CSV options come from Admin Center &gt; Data. The local env CSV remains the
        default fallback.
      </p>
    </form>
  );
}

function buildSourceOptions(filePath: string | undefined, uploadedCsvSources: DataSource[]) {
  const options: Array<{ key: string; label: string }> = [];

  if (filePath) {
    options.push({
      key: LOCAL_SOURCE_KEY,
      label: "Local env CSV"
    });
  }

  for (const source of uploadedCsvSources) {
    const config = getCsvConfig(source);
    options.push({
      key: source.id,
      label: config.fileName ? `${source.name} (${config.fileName})` : source.name
    });
  }

  return options;
}

function resolveCsvAnalysisSource(
  requestedSourceKey: string | undefined,
  filePath: string | undefined,
  uploadedCsvSources: DataSource[]
) {
  const requestedSource =
    requestedSourceKey && requestedSourceKey !== LOCAL_SOURCE_KEY
      ? uploadedCsvSources.find((source) => source.id === requestedSourceKey) ?? null
      : null;

  if (requestedSource) {
    const config = getCsvConfig(requestedSource);
    return {
      key: requestedSource.id,
      label: config.fileName ? `${requestedSource.name} (${config.fileName})` : requestedSource.name,
      providerName: requestedSource.name,
      type: "uploaded" as const,
      source: requestedSource
    };
  }

  if (filePath) {
    return {
      key: LOCAL_SOURCE_KEY,
      label: "Local env CSV",
      providerName: process.env.SPORTS_PROJECTIONS_CSV_PROVIDER ?? "csv-local",
      type: "local" as const,
      filePath
    };
  }

  const fallbackSource = uploadedCsvSources[0] ?? null;
  if (!fallbackSource) {
    return null;
  }

  const config = getCsvConfig(fallbackSource);
  return {
    key: fallbackSource.id,
    label: config.fileName ? `${fallbackSource.name} (${config.fileName})` : fallbackSource.name,
    providerName: fallbackSource.name,
    type: "uploaded" as const,
    source: fallbackSource
  };
}

function getCsvConfig(source: DataSource): CsvDataSourceConfig {
  return source.config as CsvDataSourceConfig;
}
