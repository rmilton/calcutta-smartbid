"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CsvTeamAnalysis } from "@/lib/providers/csv-projections";
import type { CsvAnalysisPortfolioEntry } from "@/lib/types";
import { clamp, formatCurrency, roundCurrency } from "@/lib/utils";

interface CsvAnalysisWorkbenchProps {
  analysis: CsvTeamAnalysis;
  sessionId: string;
  initialTeamId?: string | null;
  initialBankroll?: number;
  initialTargetTeams?: number;
  initialMaxSingleTeamPct?: number;
  initialOwnedEntries?: CsvAnalysisPortfolioEntry[];
  persistOwnedEntries?: boolean;
}

interface BudgetRow {
  teamId: string;
  teamName: string;
  rank: number;
  percentile: number;
  convictionScore: number;
  investableShare: number;
  openingBid: number;
  targetBid: number;
  maxBid: number;
  tier: "core" | "flex" | "depth";
}

interface BudgetPlan {
  bankroll: number;
  investableCash: number;
  targetTeamCount: number;
  maxSingleTeamPct: number;
  rows: BudgetRow[];
  selected: BudgetRow | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type ComparisonSortDirection = "asc" | "desc";
type ComparisonSortKey =
  | "own"
  | "paid"
  | "rank"
  | "team"
  | "score"
  | "q1"
  | "threePointPct"
  | "offensiveReboundPct"
  | "kenpom"
  | "targetBid"
  | "maxBid";

interface ComparisonSortState {
  key: ComparisonSortKey;
  direction: ComparisonSortDirection;
}

interface ComparisonTableRow {
  row: CsvTeamAnalysis["intelligence"]["ranking"][number];
  team: CsvTeamAnalysis["teams"][number];
  budgetRow: BudgetRow | null;
  ownedEntry: CsvAnalysisPortfolioEntry | null;
  owned: boolean;
}

const INSIGHT_HELP = {
  rankPercentile:
    "Rank is the team position from your CSV source. Percentile shows how many teams in this field score below this team.",
  compositeScore:
    "Composite score is the combined team quality metric used to rank teams for bidding. Higher is stronger.",
  modelRating:
    "Model rating is the raw rating from your projection source before budget logic is applied.",
  offDefTempo:
    "Offense, defense, and tempo are efficiency-style indicators from the source data. They shape the composite score.",
  seasonWins:
    "Total wins in the source dataset. Useful context, but less predictive than quality wins and efficiency metrics.",
  offensiveThreePointPct:
    "Offensive 3PT% from your source data. Higher values indicate stronger perimeter shot-making efficiency.",
  offensiveRebounds:
    "Offensive rebounding percentage from your source data. Higher values indicate better second-chance possession creation.",
  q1VsField:
    "Quadrant 1 wins compared to the field average. Positive deltas suggest stronger top-end resume performance.",
  kenpomVsField:
    "KenPom rank compared to the field average. Lower rank numbers are better; positive delta means better than field.",
  budget:
    "Target bid is the recommended spend at fair value. Max bid is a capped stretch price to avoid overpaying.",
  strengthFlags:
    "Strength flags are positive signals detected from this team profile relative to the tournament field.",
  riskFlags:
    "Risk flags are caution signals (consistency, profile gaps, or volatility) that can reduce bid confidence.",
  owned:
    "Whether the team is currently marked as owned in your saved portfolio.",
  paid:
    "Actual price you paid for this team in the auction.",
  rank: "Team rank position from your CSV projection source.",
  score: "Composite score used for prioritization and bid allocation. Higher is better.",
  q1: "Quadrant 1 wins from the source dataset.",
  offThree: "Offensive 3PT% from the source dataset.",
  offRebounds: "Offensive rebounding percentage from the source dataset.",
  kenpom: "KenPom rank from the source dataset. Lower numbers are better.",
  targetBid:
    "Recommended bid based on bankroll, target team count, and this team's conviction share.",
  maxBid: "Maximum suggested bid cap before this team is likely overvalued for your overall plan."
} as const;

export function CsvAnalysisWorkbench({
  analysis,
  sessionId,
  initialTeamId,
  initialBankroll,
  initialTargetTeams,
  initialMaxSingleTeamPct,
  initialOwnedEntries,
  persistOwnedEntries = true
}: CsvAnalysisWorkbenchProps) {
  const initialSelectedTeamId =
    (initialTeamId && analysis.teams.some((team) => team.id === initialTeamId) ? initialTeamId : null) ??
    analysis.teams[0]?.id ??
    null;

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(initialSelectedTeamId);
  const [searchTerm, setSearchTerm] = useState("");
  const [bankrollInput, setBankrollInput] = useState(
    String(Math.max(1, Math.round(initialBankroll ?? 10000)))
  );
  const [targetTeamsInput, setTargetTeamsInput] = useState(
    String(clamp(Math.round(initialTargetTeams ?? 8), 2, 24))
  );
  const [maxSingleTeamPctInput, setMaxSingleTeamPctInput] = useState(
    String(clamp(Math.round(initialMaxSingleTeamPct ?? 22), 8, 45))
  );
  const [ownedEntries, setOwnedEntries] = useState<CsvAnalysisPortfolioEntry[]>(
    sanitizeOwnedEntries(initialOwnedEntries)
  );
  const [comparisonSort, setComparisonSort] = useState<ComparisonSortState>({
    key: "score",
    direction: "desc"
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasMounted = useRef(false);

  const teamLookup = useMemo(
    () => new Map(analysis.teams.map((team) => [team.id, team])),
    [analysis.teams]
  );
  const intelLookup = useMemo(
    () => new Map(analysis.intelligence.ranking.map((row) => [row.teamId, row])),
    [analysis.intelligence.ranking]
  );

  useEffect(() => {
    const normalized = sanitizeOwnedEntries(ownedEntries).filter((entry) => teamLookup.has(entry.teamId));
    if (normalized.length !== ownedEntries.length) {
      setOwnedEntries(normalized);
    }
  }, [ownedEntries, teamLookup]);

  useEffect(() => {
    if (!persistOwnedEntries) {
      return;
    }

    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/csv-analysis/portfolio`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ entries: ownedEntries })
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to save owned team portfolio.");
        }

        setSaveState("saved");
        window.setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current));
        }, 1000);
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Unable to save owned team portfolio.");
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [ownedEntries, persistOwnedEntries, sessionId]);

  const searchNormalized = searchTerm.trim().toLowerCase();
  const filteredTeams = useMemo(() => {
    if (!searchNormalized) {
      return analysis.teams.slice(0, 120);
    }

    return analysis.teams
      .filter((team) => {
        const haystack = `${team.name} ${team.shortName}`.toLowerCase();
        return haystack.includes(searchNormalized);
      })
      .slice(0, 120);
  }, [analysis.teams, searchNormalized]);

  useEffect(() => {
    if (!searchNormalized || filteredTeams.length === 0) {
      return;
    }

    const currentSelectionVisible = filteredTeams.some((team) => team.id === selectedTeamId);
    if (!currentSelectionVisible) {
      setSelectedTeamId(filteredTeams[0].id);
    }
    // Intentionally scoped to search/filter changes so manual row clicks
    // in the comparison table are not immediately overridden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTeams, searchNormalized]);

  const bankroll = clamp(toNumber(bankrollInput, 10000), 1, 10_000_000);
  const targetTeamCount = clamp(Math.round(toNumber(targetTeamsInput, 8)), 2, 24);
  const maxSingleTeamPct = clamp(toNumber(maxSingleTeamPctInput, 22) / 100, 0.08, 0.45);
  const budgetPlan = useMemo(
    () =>
      computeBudgetPlan(
        analysis,
        {
          bankroll,
          targetTeamCount,
          maxSingleTeamPct
        },
        selectedTeamId
      ),
    [analysis, bankroll, targetTeamCount, maxSingleTeamPct, selectedTeamId]
  );
  const budgetLookup = useMemo(
    () => new Map(budgetPlan.rows.map((row) => [row.teamId, row])),
    [budgetPlan.rows]
  );

  const ownedEntryByTeamId = useMemo(
    () => new Map(ownedEntries.map((entry) => [entry.teamId, entry])),
    [ownedEntries]
  );
  const ownedTeamIds = useMemo(() => new Set(ownedEntries.map((entry) => entry.teamId)), [ownedEntries]);

  const selectedTeam = (selectedTeamId && teamLookup.get(selectedTeamId)) ?? null;
  const selectedIntel = (selectedTeamId && intelLookup.get(selectedTeamId)) ?? null;
  const selectedBudget = budgetPlan.selected;

  const ownedRows = ownedEntries
    .map((entry) => {
      const team = teamLookup.get(entry.teamId);
      if (!team) {
        return null;
      }
      return {
        entry,
        team,
        intel: intelLookup.get(entry.teamId) ?? null,
        budget: budgetLookup.get(entry.teamId) ?? null
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const ownedPaidSpend = roundCurrency(
    ownedRows.reduce((total, row) => total + Math.max(0, row.entry.paidPrice), 0)
  );
  const ownedTargetSpend = roundCurrency(
    ownedRows.reduce((total, row) => total + (row.budget?.targetBid ?? 0), 0)
  );
  const remainingAfterPaid = roundCurrency(Math.max(0, budgetPlan.investableCash - ownedPaidSpend));

  const comparisonRows = useMemo(() => {
    const rows = analysis.intelligence.ranking
      .slice(0, 120)
      .map((row) => {
        const team = teamLookup.get(row.teamId);
        if (!team) {
          return null;
        }
        const budgetRow = budgetLookup.get(row.teamId) ?? null;
        const ownedEntry = ownedEntryByTeamId.get(row.teamId) ?? null;

        return {
          row,
          team,
          budgetRow,
          ownedEntry,
          owned: Boolean(ownedEntry)
        } satisfies ComparisonTableRow;
      })
      .filter((row): row is ComparisonTableRow => row !== null);

    rows.sort((left, right) =>
      compareComparisonRows(left, right, comparisonSort.key, comparisonSort.direction)
    );
    return rows;
  }, [
    analysis.intelligence.ranking,
    budgetLookup,
    comparisonSort.direction,
    comparisonSort.key,
    ownedEntryByTeamId,
    teamLookup
  ]);

  const handleComparisonSort = (sortKey: ComparisonSortKey) => {
    setComparisonSort((current) => {
      if (current.key === sortKey) {
        return {
          key: sortKey,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }
      return {
        key: sortKey,
        direction: getDefaultComparisonSortDirection(sortKey)
      };
    });
  };

  return (
    <main className="landing-page">
      <section className="setup-section">
        <div className="section-heading">
          <p className="eyebrow">CSV Analysis</p>
          <h2>Team profile and bid workbench</h2>
        </div>

        <section className="csv-analysis-layout">
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Source</p>
                <h3>{analysis.provider}</h3>
              </div>
              <div>
                <p className="eyebrow">Teams parsed</p>
                <h3>{analysis.teamCount}</h3>
              </div>
            </div>

            <div className="form-stack">
              <div className="team-picker-grid">
                <label>
                  <span>Search teams</span>
                  <input
                    type="search"
                    placeholder="Type team or abbreviation"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </label>
                <label>
                  <span>Quick-select dropdown</span>
                  <select
                    className="team-picker-select"
                    size={10}
                    value={selectedTeamId ?? ""}
                    onChange={(event) => setSelectedTeamId(event.target.value || null)}
                  >
                    {filteredTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        #{team.rank} {team.name} ({team.shortName})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="csv-budget-grid">
                <label>
                  <span>Total bankroll</span>
                  <input
                    type="number"
                    min={1}
                    step={100}
                    value={bankrollInput}
                    onChange={(event) => setBankrollInput(event.target.value)}
                  />
                </label>
                <label>
                  <span>Target teams to buy</span>
                  <input
                    type="number"
                    min={2}
                    max={24}
                    step={1}
                    value={targetTeamsInput}
                    onChange={(event) => setTargetTeamsInput(event.target.value)}
                  />
                </label>
                <label>
                  <span>Max per-team % of bankroll</span>
                  <input
                    type="number"
                    min={8}
                    max={45}
                    step={1}
                    value={maxSingleTeamPctInput}
                    onChange={(event) => setMaxSingleTeamPctInput(event.target.value)}
                  />
                </label>
              </div>

              <div className="viewer-board csv-budget-summary">
                <div>
                  <span>Investable cash</span>
                  <strong>{formatCurrency(budgetPlan.investableCash)}</strong>
                </div>
                <div>
                  <span>Actual paid (owned)</span>
                  <strong>{formatCurrency(ownedPaidSpend)}</strong>
                </div>
                <div>
                  <span>Cash remaining</span>
                  <strong>{formatCurrency(remainingAfterPaid)}</strong>
                </div>
              </div>

              {saveState === "saving" ? <p className="viewer-note">Saving owned teams…</p> : null}
              {saveState === "saved" ? <p className="viewer-note">Owned teams saved.</p> : null}
              {saveState === "error" ? (
                <p className="form-error">{saveError ?? "Unable to save owned teams."}</p>
              ) : null}
            </div>

            {selectedTeam && selectedIntel ? (
              <div className="csv-profile-stack">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Selected team</p>
                    <h3>{selectedTeam.name}</h3>
                  </div>
                  <button
                    type="button"
                    className={ownedTeamIds.has(selectedTeam.id) ? "secondary" : "button"}
                    onClick={() => {
                      setOwnedEntries((current) => {
                        if (current.some((entry) => entry.teamId === selectedTeam.id)) {
                          return current.filter((entry) => entry.teamId !== selectedTeam.id);
                        }
                        return [
                          ...current,
                          {
                            teamId: selectedTeam.id,
                            paidPrice: selectedBudget?.targetBid ?? 0
                          }
                        ];
                      });
                    }}
                  >
                    {ownedTeamIds.has(selectedTeam.id) ? "Remove from owned" : "Mark as owned"}
                  </button>
                </div>

                <div className="csv-profile-metrics">
                  <div>
                    <InsightLabel label="Rank / percentile" tooltip={INSIGHT_HELP.rankPercentile} />
                    <strong>
                      #{selectedTeam.rank} / {selectedIntel.percentile}th
                    </strong>
                  </div>
                  <div>
                    <InsightLabel label="Composite score" tooltip={INSIGHT_HELP.compositeScore} />
                    <strong>{selectedIntel.compositeScore.toFixed(3)}</strong>
                  </div>
                  <div>
                    <InsightLabel label="Model rating" tooltip={INSIGHT_HELP.modelRating} />
                    <strong>{selectedTeam.rating.toFixed(3)}</strong>
                  </div>
                  <div>
                    <InsightLabel label="Off / Def / Tempo" tooltip={INSIGHT_HELP.offDefTempo} />
                    <strong>
                      {selectedTeam.offense.toFixed(1)} / {selectedTeam.defense.toFixed(1)} / {" "}
                      {selectedTeam.tempo.toFixed(1)}
                    </strong>
                  </div>
                  <div>
                    <InsightLabel label="Season wins" tooltip={INSIGHT_HELP.seasonWins} />
                    <strong>{displayMetric(selectedTeam.wins)}</strong>
                  </div>
                  <div>
                    <InsightLabel
                      label="Offensive 3PT%"
                      tooltip={INSIGHT_HELP.offensiveThreePointPct}
                    />
                    <strong>{displayPercent(selectedTeam.threePointPct)}</strong>
                  </div>
                  <div>
                    <InsightLabel
                      label="Offensive rebounds"
                      tooltip={INSIGHT_HELP.offensiveRebounds}
                    />
                    <strong>{displayPercent(selectedTeam.offensiveReboundPct)}</strong>
                  </div>
                  <div>
                    <InsightLabel label="Q1 wins vs field avg" tooltip={INSIGHT_HELP.q1VsField} />
                    <strong>
                      {displayMetric(selectedIntel.q1Wins)} ({formatSigned(delta(selectedIntel.q1Wins, analysis.intelligence.fieldAverages.q1Wins))})
                    </strong>
                  </div>
                  <div>
                    <InsightLabel
                      label="KenPom rank vs field avg"
                      tooltip={INSIGHT_HELP.kenpomVsField}
                    />
                    <strong>
                      {displayMetric(selectedIntel.kenpomRank)} ({formatSigned(delta(analysis.intelligence.fieldAverages.kenpomRank, selectedIntel.kenpomRank), " spots")})
                    </strong>
                  </div>
                  <div>
                    <InsightLabel label="Budget recommendation" tooltip={INSIGHT_HELP.budget} />
                    <strong>
                      {selectedBudget
                        ? `${formatCurrency(selectedBudget.targetBid)} target, ${formatCurrency(selectedBudget.maxBid)} max`
                        : "Outside candidate pool"}
                    </strong>
                  </div>
                </div>

                <div className="intel-notes">
                  <div>
                    <InsightLabel label="Strength flags" tooltip={INSIGHT_HELP.strengthFlags} />
                    <p>
                      {selectedIntel.strengths.length
                        ? selectedIntel.strengths.join(" | ")
                        : "No standout strengths from available scouting data."}
                    </p>
                  </div>
                  <div>
                    <InsightLabel label="Risk flags" tooltip={INSIGHT_HELP.riskFlags} />
                    <p>
                      {selectedIntel.risks.length
                        ? selectedIntel.risks.join(" | ")
                        : "No material risks flagged from available scouting data."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="viewer-note">Select a team from the dropdown to view its profile.</p>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        label="Own"
                        tooltip={INSIGHT_HELP.owned}
                        sortKey="own"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Paid"
                        tooltip={INSIGHT_HELP.paid}
                        sortKey="paid"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Rank"
                        tooltip={INSIGHT_HELP.rank}
                        sortKey="rank"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Team"
                        tooltip="Team name from your projection source."
                        sortKey="team"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Score"
                        tooltip={INSIGHT_HELP.score}
                        sortKey="score"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Q1"
                        tooltip={INSIGHT_HELP.q1}
                        sortKey="q1"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Off 3PT%"
                        tooltip={INSIGHT_HELP.offThree}
                        sortKey="threePointPct"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Off Reb%"
                        tooltip={INSIGHT_HELP.offRebounds}
                        sortKey="offensiveReboundPct"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="KenPom"
                        tooltip={INSIGHT_HELP.kenpom}
                        sortKey="kenpom"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Target Bid"
                        tooltip={INSIGHT_HELP.targetBid}
                        sortKey="targetBid"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Max Bid"
                        tooltip={INSIGHT_HELP.maxBid}
                        sortKey="maxBid"
                        sortState={comparisonSort}
                        onToggle={handleComparisonSort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((comparisonRow) => {
                    return (
                      <tr
                        key={comparisonRow.row.teamId}
                        className={
                          comparisonRow.row.teamId === selectedTeamId ? "table-row--focus" : undefined
                        }
                        onClick={() => setSelectedTeamId(comparisonRow.row.teamId)}
                      >
                        <td>{comparisonRow.owned ? "Yes" : "No"}</td>
                        <td>
                          {comparisonRow.ownedEntry
                            ? formatCurrency(comparisonRow.ownedEntry.paidPrice)
                            : "--"}
                        </td>
                        <td>#{comparisonRow.team.rank}</td>
                        <td>{comparisonRow.row.teamName}</td>
                        <td>{comparisonRow.row.compositeScore.toFixed(3)}</td>
                        <td>{displayMetric(comparisonRow.row.q1Wins)}</td>
                        <td>{displayPercent(comparisonRow.team.threePointPct)}</td>
                        <td>{displayPercent(comparisonRow.team.offensiveReboundPct)}</td>
                        <td>{displayMetric(comparisonRow.row.kenpomRank)}</td>
                        <td>
                          {comparisonRow.budgetRow
                            ? formatCurrency(comparisonRow.budgetRow.targetBid)
                            : "--"}
                        </td>
                        <td>
                          {comparisonRow.budgetRow
                            ? formatCurrency(comparisonRow.budgetRow.maxBid)
                            : "--"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="panel csv-owned-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Owned teams</p>
                <h3>{ownedRows.length}</h3>
              </div>
            </div>

            <div className="viewer-board">
              <div>
                <span>Actual paid</span>
                <strong>{formatCurrency(ownedPaidSpend)}</strong>
              </div>
              <div>
                <span>Recommended target (owned)</span>
                <strong>{formatCurrency(ownedTargetSpend)}</strong>
              </div>
              <div>
                <span>Cash after actual paid</span>
                <strong>{formatCurrency(remainingAfterPaid)}</strong>
              </div>
            </div>

            {ownedRows.length ? (
              <div className="csv-owned-list">
                {ownedRows.map((row) => (
                  <div key={row.team.id} className="selection-row selection-row--stacked">
                    <div className="csv-owned-item-head">
                      <strong>{row.team.name}</strong>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setOwnedEntries((current) =>
                            current.filter((entry) => entry.teamId !== row.team.id)
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>

                    <label>
                      <span>Actual paid price</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={String(row.entry.paidPrice)}
                        onChange={(event) => {
                          const nextPaidPrice = toNumber(event.target.value, 0);
                          setOwnedEntries((current) =>
                            current.map((entry) =>
                              entry.teamId === row.team.id
                                ? {
                                    ...entry,
                                    paidPrice: Math.max(0, nextPaidPrice)
                                  }
                                : entry
                            )
                          );
                        }}
                      />
                    </label>

                    <p className="viewer-note">
                      {row.budget
                        ? `Target ${formatCurrency(row.budget.targetBid)} / Max ${formatCurrency(row.budget.maxBid)}`
                        : "No active budget target"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="viewer-note">
                Mark teams you own to keep them pinned while you review others.
              </p>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

function computeBudgetPlan(
  analysis: CsvTeamAnalysis,
  options: {
    bankroll: number;
    targetTeamCount: number;
    maxSingleTeamPct: number;
  },
  selectedTeamId: string | null
): BudgetPlan {
  const bankroll = roundCurrency(options.bankroll);
  const targetTeamCount = clamp(Math.round(options.targetTeamCount), 2, 24);
  const maxSingleTeamPct = clamp(options.maxSingleTeamPct, 0.08, 0.45);
  const candidateCount = clamp(
    Math.round(targetTeamCount * 4),
    targetTeamCount,
    analysis.intelligence.ranking.length
  );
  const investableCash = bankroll;
  const hardTeamCap = roundCurrency(bankroll * maxSingleTeamPct);

  const rankedPool = analysis.intelligence.ranking.slice(0, candidateCount);
  const selectedRow =
    (selectedTeamId
      ? analysis.intelligence.ranking.find((row) => row.teamId === selectedTeamId) ?? null
      : null);
  const poolRows =
    selectedRow && !rankedPool.some((row) => row.teamId === selectedRow.teamId)
      ? [...rankedPool, selectedRow]
      : rankedPool;

  const convictionRows = poolRows.map((row) => ({
    row,
    conviction: computeConviction(row)
  }));
  const convictionSum = convictionRows.reduce((total, item) => total + item.conviction, 0);
  const fallbackShare = 1 / Math.max(convictionRows.length, 1);
  const rankLookup = new Map(analysis.teams.map((team) => [team.id, team.rank]));

  const rows = convictionRows
    .map(({ row, conviction }) => {
      const share = convictionSum > 0 ? conviction / convictionSum : fallbackShare;
      const rawBid = investableCash * share;
      const targetBid = roundCurrency(Math.min(rawBid, hardTeamCap));
      const maxBid = roundCurrency(Math.min(targetBid * 1.18, hardTeamCap));
      const openingBid = roundCurrency(Math.max(targetBid * 0.62, 1));

      return {
        teamId: row.teamId,
        teamName: row.teamName,
        rank: rankLookup.get(row.teamId) ?? 0,
        percentile: row.percentile,
        convictionScore: roundMetric(conviction, 4),
        investableShare: roundMetric(share, 4),
        openingBid,
        targetBid,
        maxBid,
        tier: classifyTier(row.percentile)
      } satisfies BudgetRow;
    })
    .sort((left, right) => right.targetBid - left.targetBid);

  return {
    bankroll,
    investableCash,
    targetTeamCount,
    maxSingleTeamPct: roundMetric(maxSingleTeamPct, 4),
    rows,
    selected: selectedTeamId ? rows.find((row) => row.teamId === selectedTeamId) ?? null : null
  };
}

function computeConviction(
  row: CsvTeamAnalysis["intelligence"]["ranking"][number]
) {
  const base = Math.max(row.compositeScore, 0.01);
  const coverageAdjustment = 0.82 + row.scoutingCoverage * 0.36;
  const strengthAdjustment = 1 + Math.min(row.strengths.length * 0.035, 0.14);
  const riskAdjustment = 1 - Math.min(row.risks.length * 0.055, 0.22);
  const percentileAdjustment = 0.9 + (row.percentile / 100) * 0.25;
  return base * coverageAdjustment * strengthAdjustment * riskAdjustment * percentileAdjustment;
}

function classifyTier(percentile: number): BudgetRow["tier"] {
  if (percentile >= 88) {
    return "core";
  }
  if (percentile >= 68) {
    return "flex";
  }
  return "depth";
}

function sanitizeOwnedEntries(
  entries: CsvAnalysisPortfolioEntry[] | undefined
): CsvAnalysisPortfolioEntry[] {
  const deduped = new Map<string, number>();
  for (const entry of entries ?? []) {
    const teamId = String(entry.teamId ?? "").trim();
    if (!teamId) {
      continue;
    }
    const paidPrice = Number(entry.paidPrice ?? 0);
    deduped.set(teamId, Number.isFinite(paidPrice) ? Math.max(0, paidPrice) : 0);
  }

  return [...deduped.entries()].map(([teamId, paidPrice]) => ({
    teamId,
    paidPrice
  }));
}

function getDefaultComparisonSortDirection(sortKey: ComparisonSortKey): ComparisonSortDirection {
  switch (sortKey) {
    case "rank":
    case "team":
    case "kenpom":
      return "asc";
    default:
      return "desc";
  }
}

function compareComparisonRows(
  left: ComparisonTableRow,
  right: ComparisonTableRow,
  sortKey: ComparisonSortKey,
  direction: ComparisonSortDirection
) {
  let result = 0;

  switch (sortKey) {
    case "own":
      result = compareNumberAscending(Number(left.owned), Number(right.owned));
      break;
    case "paid":
      result = compareNumberAscending(left.ownedEntry?.paidPrice ?? -1, right.ownedEntry?.paidPrice ?? -1);
      break;
    case "rank":
      result = compareNumberAscending(left.team.rank, right.team.rank);
      break;
    case "team":
      result = compareStringAscending(left.row.teamName, right.row.teamName);
      break;
    case "score":
      result = compareNumberAscending(left.row.compositeScore, right.row.compositeScore);
      break;
    case "q1":
      result = compareNumberAscending(
        left.row.q1Wins ?? Number.NEGATIVE_INFINITY,
        right.row.q1Wins ?? Number.NEGATIVE_INFINITY
      );
      break;
    case "threePointPct":
      result = compareNumberAscending(
        left.team.threePointPct ?? Number.NEGATIVE_INFINITY,
        right.team.threePointPct ?? Number.NEGATIVE_INFINITY
      );
      break;
    case "offensiveReboundPct":
      result = compareNumberAscending(
        left.team.offensiveReboundPct ?? Number.NEGATIVE_INFINITY,
        right.team.offensiveReboundPct ?? Number.NEGATIVE_INFINITY
      );
      break;
    case "kenpom":
      result = compareNumberAscending(
        left.row.kenpomRank ?? Number.POSITIVE_INFINITY,
        right.row.kenpomRank ?? Number.POSITIVE_INFINITY
      );
      break;
    case "targetBid":
      result = compareNumberAscending(left.budgetRow?.targetBid ?? -1, right.budgetRow?.targetBid ?? -1);
      break;
    case "maxBid":
      result = compareNumberAscending(left.budgetRow?.maxBid ?? -1, right.budgetRow?.maxBid ?? -1);
      break;
    default:
      result = 0;
      break;
  }

  if (result !== 0) {
    return direction === "asc" ? result : -result;
  }

  return compareStringAscending(left.row.teamName, right.row.teamName);
}

function compareNumberAscending(left: number, right: number) {
  return left - right;
}

function compareStringAscending(left: string, right: string) {
  return left.localeCompare(right);
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function delta(value: number | null, baseline: number | null) {
  if (value === null || baseline === null) {
    return null;
  }
  return roundMetric(value - baseline, 2);
}

function displayMetric(value: number | null) {
  return value === null ? "--" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function displayPercent(value: number | null) {
  return value === null ? "--" : `${value.toFixed(1)}%`;
}

function formatSigned(value: number | null, suffix = "") {
  if (value === null) {
    return "--";
  }

  const numberLabel = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (value > 0) {
    return `+${numberLabel}${suffix}`;
  }
  return `${numberLabel}${suffix}`;
}

function roundMetric(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function SortHeader({
  label,
  tooltip,
  sortKey,
  sortState,
  onToggle
}: {
  label: string;
  tooltip: string;
  sortKey: ComparisonSortKey;
  sortState: ComparisonSortState;
  onToggle: (sortKey: ComparisonSortKey) => void;
}) {
  const isActive = sortState.key === sortKey;
  const arrow = isActive ? (sortState.direction === "asc" ? "▲" : "▼") : "↕";

  return (
    <button
      type="button"
      className={`table-sort${isActive ? " table-sort--active" : ""}`}
      title={tooltip}
      onClick={() => onToggle(sortKey)}
    >
      <span>{label}</span>
      <span className="table-sort__arrow" aria-hidden="true">
        {arrow}
      </span>
    </button>
  );
}

function InsightLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="insight-label">
      {label}
      <span className="tooltip-hint" tabIndex={0} aria-label={tooltip}>
        i
        <span className="tooltip-content">{tooltip}</span>
      </span>
    </span>
  );
}
