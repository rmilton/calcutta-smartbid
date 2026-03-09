import Link from "next/link";
import { buildCsvBudgetPlan, loadCsvTeamAnalysis } from "@/lib/providers/csv-projections";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface CsvAnalysisPageProps {
  searchParams: Promise<{
    teamId?: string;
    bankroll?: string;
    targetTeams?: string;
    reservePct?: string;
    maxSingleTeamPct?: string;
  }>;
}

export default async function CsvAnalysisPage({ searchParams }: CsvAnalysisPageProps) {
  const { teamId, bankroll, targetTeams, reservePct, maxSingleTeamPct } = await searchParams;
  const filePath = process.env.SPORTS_PROJECTIONS_CSV_FILE;

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
    const analysis = await loadCsvTeamAnalysis(filePath, providerName, teamId);
    const budgetPlan = buildCsvBudgetPlan(
      analysis,
      {
        bankroll: Number(bankroll ?? "10000"),
        targetTeamCount: Number(targetTeams ?? "8"),
        reservePct: parsePercentInput(reservePct, 0.28),
        maxSingleTeamPct: parsePercentInput(maxSingleTeamPct, 0.22)
      },
      teamId
    );
    const selectedId = analysis.intelligence.selected?.team.id ?? null;
    const metricLookup = new Map(analysis.teams.map((team) => [team.id, team]));
    const budgetLookup = new Map(budgetPlan.rows.map((row) => [row.teamId, row]));
    const topRows = analysis.intelligence.ranking.slice(0, 100);
    const selectedBudget = budgetPlan.selected;

    const buildTeamLink = (nextTeamId: string) => {
      const params = new URLSearchParams();
      params.set("teamId", nextTeamId);
      params.set("bankroll", String(budgetPlan.bankroll));
      params.set("targetTeams", String(budgetPlan.targetTeamCount));
      params.set("reservePct", String(budgetPlan.reservePct));
      params.set("maxSingleTeamPct", String(budgetPlan.maxSingleTeamPct));
      return `/csv-analysis?${params.toString()}`;
    };

    return (
      <main className="landing-page">
        <section className="setup-section">
          <div className="section-heading">
            <p className="eyebrow">CSV Analysis</p>
            <h2>Team intelligence from your CSV</h2>
          </div>
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Provider</p>
                <h3>{analysis.provider}</h3>
              </div>
              <div>
                <p className="eyebrow">Teams parsed</p>
                <h3>{analysis.teamCount}</h3>
              </div>
            </div>

            <form method="get" className="setup-grid" style={{ marginBottom: "1rem" }}>
              <input type="hidden" name="teamId" value={teamId ?? ""} />
              <label>
                <span>Bankroll</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  name="bankroll"
                  defaultValue={budgetPlan.bankroll}
                />
              </label>
              <label>
                <span>Target teams</span>
                <input
                  type="number"
                  min={2}
                  max={24}
                  step={1}
                  name="targetTeams"
                  defaultValue={budgetPlan.targetTeamCount}
                />
              </label>
              <label>
                <span>Reserve %</span>
                <input
                  type="number"
                  min={5}
                  max={70}
                  step={1}
                  name="reservePct"
                  defaultValue={Math.round(budgetPlan.reservePct * 100)}
                />
              </label>
              <label>
                <span>Max single-team %</span>
                <input
                  type="number"
                  min={8}
                  max={45}
                  step={1}
                  name="maxSingleTeamPct"
                  defaultValue={Math.round(budgetPlan.maxSingleTeamPct * 100)}
                />
              </label>
              <div style={{ alignSelf: "end" }}>
                <button type="submit">Recalculate budget</button>
              </div>
            </form>

            <div className="viewer-board" style={{ marginBottom: "1rem" }}>
              <div>
                <span>Investable cash</span>
                <strong>{formatCurrency(budgetPlan.investableCash)}</strong>
              </div>
              <div>
                <span>Reserved cash</span>
                <strong>{formatCurrency(budgetPlan.reservedCash)}</strong>
              </div>
              <div>
                <span>Candidate pool</span>
                <strong>{budgetPlan.candidateCount} teams</strong>
              </div>
            </div>

            {selectedBudget ? (
              <div className="intel-notes" style={{ marginBottom: "1rem" }}>
                <div>
                  <span>Selected team bid plan</span>
                  <p>
                    Open around <strong>{formatCurrency(selectedBudget.openingBid)}</strong>, target{" "}
                    <strong>{formatCurrency(selectedBudget.targetBid)}</strong>, walk-away at{" "}
                    <strong>{formatCurrency(selectedBudget.maxBid)}</strong>.
                  </p>
                </div>
                <div>
                  <span>Portfolio impact</span>
                  <p>
                    {Math.round(selectedBudget.investableShare * 100)}% of investable bankroll,
                    tier: <strong>{selectedBudget.tier}</strong>.
                  </p>
                </div>
              </div>
            ) : null}

            {analysis.intelligence.selected ? (
              <div className="intel-stack">
                <div className="team-meta">
                  <div>
                    <strong>{analysis.intelligence.selected.team.name}</strong>
                    <span>{analysis.intelligence.selected.team.shortName}</span>
                  </div>
                  <div>
                    <span>Field percentile</span>
                    <strong>{analysis.intelligence.selected.row.percentile}th</strong>
                  </div>
                </div>
                <div className="intel-notes">
                  <div>
                    <span>Strength flags</span>
                    <p>
                      {analysis.intelligence.selected.row.strengths.length
                        ? analysis.intelligence.selected.row.strengths.join(" | ")
                        : "No standout strengths from available CSV metrics."}
                    </p>
                  </div>
                  <div>
                    <span>Risk flags</span>
                    <p>
                      {analysis.intelligence.selected.row.risks.length
                        ? analysis.intelligence.selected.row.risks.join(" | ")
                        : "No material risks flagged from available CSV metrics."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>Composite</th>
                    <th>Rating</th>
                    <th>Off</th>
                    <th>Def</th>
                    <th>Tempo</th>
                    <th>Wins</th>
                    <th>WAB</th>
                    <th>Target Bid</th>
                    <th>Max Bid</th>
                  </tr>
                </thead>
                <tbody>
                  {topRows.map((row) => {
                    const team = metricLookup.get(row.teamId);
                    const budgetRow = budgetLookup.get(row.teamId);
                    return (
                      <tr
                        key={row.teamId}
                        className={selectedId === row.teamId ? "table-row--focus" : undefined}
                      >
                        <td>{team?.rank ?? "--"}</td>
                        <td>
                          <Link href={buildTeamLink(row.teamId)}>
                            {row.teamName}
                          </Link>
                        </td>
                        <td>{row.compositeScore.toFixed(3)}</td>
                        <td>{team ? team.rating.toFixed(3) : "--"}</td>
                        <td>{team ? team.offense.toFixed(1) : "--"}</td>
                        <td>{team ? team.defense.toFixed(1) : "--"}</td>
                        <td>{team ? team.tempo.toFixed(1) : "--"}</td>
                        <td>{team?.wins ?? "--"}</td>
                        <td>{team?.winsAboveBubble?.toFixed(2) ?? "--"}</td>
                        <td>{budgetRow ? formatCurrency(budgetRow.targetBid) : "--"}</td>
                        <td>{budgetRow ? formatCurrency(budgetRow.maxBid) : "--"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="viewer-note">
              Showing top 100 teams by composite score. Click a team name to focus strengths, risks, and bid guidance.
            </p>
          </article>
        </section>
      </main>
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

function parsePercentInput(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed > 1 ? parsed / 100 : parsed;
}
