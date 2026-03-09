"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSessionDashboard } from "@/lib/hooks/use-session-dashboard";
import { LogoutButton } from "@/components/logout-button";
import { AuctionDashboard, AuthenticatedMember } from "@/lib/types";
import { formatCurrency, formatPercent, titleCaseStage } from "@/lib/utils";

interface DashboardShellProps {
  sessionId: string;
  initialDashboard: AuctionDashboard;
  viewerMode: boolean;
  currentMember: AuthenticatedMember;
}

function formatTeamOption(team: AuctionDashboard["session"]["projections"][number] | null) {
  if (!team) {
    return "";
  }

  return `${team.seed}. ${team.name} (${team.region})`;
}

export function DashboardShell({
  sessionId,
  initialDashboard,
  viewerMode,
  currentMember
}: DashboardShellProps) {
  const [isLiveStateDirty, setIsLiveStateDirty] = useState(false);
  const { dashboard, isRefreshing, refresh, replaceDashboard } = useSessionDashboard(
    sessionId,
    initialDashboard
  );
  const [selectedTeamId, setSelectedTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? ""
  );
  const [teamQuery, setTeamQuery] = useState("");
  const deferredTeamQuery = useDeferredValue(teamQuery);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [currentBid, setCurrentBid] = useState(dashboard.session.liveState.currentBid);
  const [buyerId, setBuyerId] = useState(dashboard.focusSyndicate.id);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLiveStateDirty && !viewerMode) {
      return;
    }
    const nextSelectedTeamId = dashboard.session.liveState.nominatedTeamId ?? "";
    const nextSelectedTeam =
      dashboard.session.projections.find((team) => team.id === nextSelectedTeamId) ?? null;

    setSelectedTeamId(nextSelectedTeamId);
    setTeamQuery(formatTeamOption(nextSelectedTeam));
    setCurrentBid(dashboard.session.liveState.currentBid);
  }, [dashboard.session.liveState, dashboard.session.projections, isLiveStateDirty, viewerMode]);

  const nominatedTeam = dashboard.nominatedTeam;
  const recommendation = dashboard.recommendation;
  const selectedTeam =
    dashboard.session.projections.find((team) => team.id === selectedTeamId) ?? null;
  const soldLookup = useMemo(
    () => new Set(dashboard.soldTeams.map((item) => item.team.id)),
    [dashboard.soldTeams]
  );
  const searchableTeams = useMemo(
    () => dashboard.session.projections.filter((team) => !soldLookup.has(team.id)),
    [dashboard.session.projections, soldLookup]
  );
  const selectedTeamLabel = useMemo(
    () => formatTeamOption(selectedTeam),
    [selectedTeam]
  );
  const filteredTeams = useMemo(() => {
    const query = deferredTeamQuery.trim().toLowerCase();
    if (!query || query === selectedTeamLabel.toLowerCase()) {
      return searchableTeams;
    }

    return searchableTeams
      .filter((team) => {
        const haystack = [
          team.name,
          team.shortName,
          team.region,
          team.seed.toString()
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
  }, [deferredTeamQuery, searchableTeams, selectedTeamLabel]);

  useEffect(() => {
    if (teamQuery !== "") {
      return;
    }

    setTeamQuery(formatTeamOption(selectedTeam));
  }, [selectedTeam, teamQuery]);

  async function selectTeam(teamId: string) {
    const team =
      dashboard.session.projections.find((candidate) => candidate.id === teamId) ?? null;
    setIsLiveStateDirty(true);
    setSelectedTeamId(teamId);
    setTeamQuery(formatTeamOption(team));
    setIsTeamPickerOpen(false);
    await saveLiveState({
      patch: {
        nominatedTeamId: teamId,
        currentBid
      },
      silent: true
    });
  }

  function handleTeamQueryChange(value: string) {
    setIsLiveStateDirty(true);
    setTeamQuery(value);

    const normalized = value.trim().toLowerCase();
    const exactMatch =
      searchableTeams.find(
        (team) => formatTeamOption(team).toLowerCase() === normalized
      ) ?? null;
    setSelectedTeamId(exactMatch?.id ?? "");
    setIsTeamPickerOpen(true);
  }

  function commitTeamQuery() {
    const normalized = teamQuery.trim().toLowerCase();
    if (!normalized) {
      setSelectedTeamId("");
      setTeamQuery("");
      setIsTeamPickerOpen(false);
      return;
    }

    const exactMatch =
      searchableTeams.find(
        (team) =>
          formatTeamOption(team).toLowerCase() === normalized ||
          team.name.toLowerCase() === normalized ||
          team.shortName.toLowerCase() === normalized
      ) ?? null;

    if (exactMatch) {
      void selectTeam(exactMatch.id);
      return;
    }

    if (filteredTeams.length === 1) {
      void selectTeam(filteredTeams[0].id);
      return;
    }

    const currentSelection =
      dashboard.session.projections.find((team) => team.id === selectedTeamId) ?? null;
    setTeamQuery(formatTeamOption(currentSelection));
    setIsTeamPickerOpen(false);
  }

  async function saveLiveState(options?: {
    patch?: { nominatedTeamId?: string | null; currentBid?: number };
    silent?: boolean;
  }) {
    setError(null);
    if (!options?.silent) {
      setNotice(null);
    }

    const payload = {
      nominatedTeamId: selectedTeamId || null,
      currentBid,
      ...options?.patch
    };

    const response = await fetch(`/api/sessions/${sessionId}/live-state`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to update live state.");
      return;
    }

    const nextDashboard = (await response.json()) as AuctionDashboard;
    replaceDashboard(nextDashboard);

    if (!options?.silent) {
      setNotice("Live board updated.");
    }
    setIsLiveStateDirty(false);
  }

  async function persistCurrentBid() {
    await saveLiveState({
      patch: {
        nominatedTeamId: selectedTeamId || null,
        currentBid
      },
      silent: true
    });
  }

  async function recordPurchase() {
    setError(null);
    setNotice(null);
    if (currentBid <= 0) {
      setError("Enter a bid greater than $0 before recording a purchase.");
      return;
    }

    if (!selectedTeamId) {
      setError("Choose an active team before recording a purchase.");
      return;
    }

    const response = await fetch(`/api/sessions/${sessionId}/purchases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        teamId: selectedTeamId || undefined,
        buyerSyndicateId: buyerId,
        price: currentBid
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to record purchase.");
      return;
    }

    setNotice("Purchase recorded.");
    setIsLiveStateDirty(false);
    startTransition(() => {
      void refresh();
    });
  }

  async function rebuildSimulation() {
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/sessions/${sessionId}/simulations/rebuild`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to rebuild simulation.");
      return;
    }

    setNotice("Simulation refreshed.");
    setIsLiveStateDirty(false);
    startTransition(() => {
      void refresh();
    });
  }

  async function importField(provider: "mock" | "remote") {
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/sessions/${sessionId}/projections/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ provider })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? `Unable to import ${provider} projections.`);
      return;
    }

    setNotice(
      provider === "mock"
        ? "Sample field reloaded."
        : "Remote projection feed imported."
    );
    setIsLiveStateDirty(false);
    startTransition(() => {
      void refresh();
    });
  }

  const lastSaleTeamName =
    dashboard.lastPurchase &&
    dashboard.session.projections.find(
      (team) => team.id === dashboard.lastPurchase?.teamId
    )?.name;

  return (
    <div className="dashboard-shell">
      <header className="session-header">
        <div>
          <p className="eyebrow">Calcutta SmartBid</p>
          <h1>{dashboard.session.name}</h1>
          <p className="session-subtitle">
            Focus syndicate <strong>{dashboard.focusSyndicate.name}</strong> with{" "}
            {dashboard.availableTeams.length} teams still on the board.
          </p>
        </div>
        <div className="session-badges">
          <span>
            Signed in as {currentMember.name} ({currentMember.role})
          </span>
          <span>Backend {dashboard.storageBackend}</span>
          <span>{isRefreshing ? "Syncing..." : "Live sync ready"}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="control-bar panel">
        <div className="panel-head control-bar__head">
          <div>
            <p className="eyebrow">Operator console</p>
            <h3>Live bidding controls</h3>
          </div>
          {!viewerMode ? (
            <div className="panel-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => void rebuildSimulation()}
              >
                Refresh simulation
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void importField("mock")}
              >
                Reload sample field
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void importField("remote")}
              >
                Import remote feed
              </button>
            </div>
          ) : null}
        </div>

        <div className="control-bar__grid">
          <label className="control-bar__field control-bar__field--team">
            <span>Active Team for Bidding</span>
            <div className="team-picker">
              <input
                disabled={viewerMode}
                placeholder="Start typing a team, seed, or region"
                value={teamQuery}
                onFocus={(event) => {
                  setIsTeamPickerOpen(true);
                  event.currentTarget.select();
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    commitTeamQuery();
                  }, 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTeamQuery();
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    setIsTeamPickerOpen(true);
                  }
                }}
                onChange={(event) => handleTeamQueryChange(event.target.value)}
              />
              {!viewerMode ? (
                <span className="team-picker__hint">
                  Type to filter, then choose a result or press Enter.
                </span>
              ) : null}
              {isTeamPickerOpen && !viewerMode ? (
                <div className="team-picker__results">
                  {filteredTeams.length ? (
                    filteredTeams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        className={
                          team.id === selectedTeamId
                            ? "team-picker__option team-picker__option--active"
                            : "team-picker__option"
                        }
                        onMouseDown={(event) => {
                          event.preventDefault();
                          void selectTeam(team.id);
                        }}
                      >
                        <strong>{team.name}</strong>
                        <span>
                          {team.seed}-seed · {team.region} · {team.shortName}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="team-picker__empty">
                      No available team matches that search.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </label>

          <label className="control-bar__field">
            <span>Current bid</span>
            <input
              disabled={viewerMode}
              type="number"
              min={0}
              step={100}
              value={currentBid}
              onBlur={() => {
                if (!viewerMode && isLiveStateDirty) {
                  void persistCurrentBid();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!viewerMode && isLiveStateDirty) {
                    void persistCurrentBid();
                  }
                }
              }}
              onChange={(event) => {
                setIsLiveStateDirty(true);
                setCurrentBid(Number(event.target.value));
              }}
            />
          </label>

          <label className="control-bar__field">
            <span>Record winner</span>
            <select
              disabled={viewerMode}
              value={buyerId}
              onChange={(event) => setBuyerId(event.target.value)}
            >
              {dashboard.ledger.map((syndicate) => (
                <option key={syndicate.id} value={syndicate.id}>
                  {syndicate.name}
                </option>
              ))}
            </select>
          </label>

          {!viewerMode ? (
            <div className="control-bar__actions">
              <button
                type="button"
                className="danger"
                disabled={currentBid <= 0 || !selectedTeamId}
                onClick={() => void recordPurchase()}
              >
                Record purchase
              </button>
            </div>
          ) : (
            <p className="viewer-note control-bar__viewer-note">
              Viewer mode is read-only.
            </p>
          )}
        </div>

        {notice ? <p className="form-notice">{notice}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="top-grid">
        <article className="hero-card">
          <div className="hero-card__head">
            <div>
              <p className="eyebrow">Active Team for Bidding</p>
              <h2>{nominatedTeam ? nominatedTeam.name : "No active team selected"}</h2>
            </div>
            <span
              className={`stoplight stoplight--${recommendation?.stoplight ?? "pass"}`}
            >
              {recommendation?.stoplight ?? "idle"}
            </span>
          </div>
          <div className="hero-stats">
            <div>
              <span>Current bid</span>
              <strong>{formatCurrency(currentBid)}</strong>
            </div>
            <div>
              <span>Recommended max</span>
              <strong>
                {recommendation
                  ? formatCurrency(recommendation.recommendedMaxBid)
                  : "--"}
              </strong>
            </div>
            <div>
              <span>Expected gross</span>
              <strong>
                {recommendation
                  ? formatCurrency(recommendation.expectedGrossPayout)
                  : "--"}
              </strong>
            </div>
            <div>
              <span>Expected net</span>
              <strong>
                {recommendation
                  ? formatCurrency(recommendation.expectedNetValue)
                  : "--"}
              </strong>
            </div>
          </div>
          {recommendation ? (
            <>
              <div className="hero-insights">
                <div>
                  <span>Confidence band</span>
                  <strong>
                    {formatCurrency(recommendation.confidenceBand[0])} to{" "}
                    {formatCurrency(recommendation.confidenceBand[1])}
                  </strong>
                </div>
                <div>
                  <span>Ownership penalty</span>
                  <strong>{formatCurrency(recommendation.ownershipPenalty)}</strong>
                </div>
                <div>
                  <span>Value gap</span>
                  <strong>{formatCurrency(recommendation.valueGap)}</strong>
                </div>
                <div>
                  <span>Portfolio concentration</span>
                  <strong>{Math.round(recommendation.concentrationScore * 100)}%</strong>
                </div>
              </div>
              <div className="driver-grid">
                {recommendation.drivers.map((driver) => (
                  <div
                    key={driver.label}
                    className={`driver-chip driver-chip--${driver.tone}`}
                  >
                    <span>{driver.label}</span>
                    <strong>{driver.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </article>

        <article className="metrics-card">
          <p className="eyebrow">Auction pulse</p>
          <div className="metric-row">
            <span>Focus spend</span>
            <strong>{formatCurrency(dashboard.focusSyndicate.spend)}</strong>
          </div>
          <div className="metric-row">
            <span>Remaining bankroll</span>
            <strong>{formatCurrency(dashboard.focusSyndicate.remainingBankroll)}</strong>
          </div>
          <div className="metric-row">
            <span>Portfolio EV</span>
            <strong>{formatCurrency(dashboard.focusSyndicate.portfolioExpectedValue)}</strong>
          </div>
          <div className="metric-row">
            <span>Simulation iterations</span>
            <strong>{dashboard.session.simulationSnapshot?.iterations ?? 0}</strong>
          </div>
          <div className="metric-row">
            <span>Projection provider</span>
            <strong>{dashboard.session.projectionProvider}</strong>
          </div>
          <div className="metric-row">
            <span>Overrides active</span>
            <strong>{dashboard.projectionOverrideCount}</strong>
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Bid model</p>
              <h3>Decision support</h3>
            </div>
          </div>
          {recommendation && nominatedTeam ? (
            <>
              <div className="team-meta">
                <div>
                  <strong>{nominatedTeam.name}</strong>
                  <span>
                    {nominatedTeam.region} region, {nominatedTeam.seed}-seed
                  </span>
                </div>
                <div>
                  <span>Title odds</span>
                  <strong>
                    {formatPercent(
                      dashboard.session.simulationSnapshot?.teamResults[nominatedTeam.id]
                        ?.roundProbabilities.champion ?? 0
                    )}
                  </strong>
                </div>
              </div>

              <div className="rationale-list">
                {recommendation.rationale.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>

              <div className="conflict-list">
                <h4>Ownership conflicts</h4>
                {dashboard.session.simulationSnapshot?.teamResults[nominatedTeam.id]
                  ?.likelyConflicts.length ? (
                  dashboard.session.simulationSnapshot.teamResults[
                    nominatedTeam.id
                  ].likelyConflicts
                    .slice(0, 4)
                    .map((conflict) => (
                      <div key={conflict.opponentId} className="conflict-item">
                        <span>{conflict.opponentId}</span>
                        <span>
                          {formatPercent(conflict.probability)} in{" "}
                          {titleCaseStage(conflict.earliestRound)}
                        </span>
                      </div>
                    ))
                ) : (
                  <p>No immediate collision flags.</p>
                )}
              </div>
            </>
          ) : (
            <p className="viewer-note">
              Choose a team to unlock simulation-backed bid guidance.
            </p>
          )}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Viewer board</p>
              <h3>Shared auction snapshot</h3>
            </div>
          </div>
          <div className="viewer-board">
            <div>
              <span>Active Team for Bidding</span>
              <strong>{dashboard.nominatedTeam?.name ?? "Waiting for active team"}</strong>
            </div>
            <div>
              <span>Current bid</span>
              <strong>{formatCurrency(dashboard.session.liveState.currentBid)}</strong>
            </div>
            <div>
              <span>Last sale</span>
              <strong>
                {dashboard.lastPurchase
                  ? `${lastSaleTeamName ?? dashboard.lastPurchase.teamId} for ${formatCurrency(
                      dashboard.lastPurchase.price
                    )}`
                  : "No sales yet"}
              </strong>
            </div>
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Syndicate ledger</p>
              <h3>Spend, bankroll, and portfolio EV</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Syndicate</th>
                  <th>Spend</th>
                  <th>Remaining</th>
                  <th>Owned teams</th>
                  <th>Portfolio EV</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.ledger.map((syndicate) => (
                  <tr key={syndicate.id}>
                    <td>
                      <div className="syndicate-name">
                        <span
                          className="chip-dot"
                          style={{ backgroundColor: syndicate.color }}
                        />
                        {syndicate.name}
                      </div>
                    </td>
                    <td>{formatCurrency(syndicate.spend)}</td>
                    <td>{formatCurrency(syndicate.remainingBankroll)}</td>
                    <td>
                      {syndicate.ownedTeamIds.length
                        ? syndicate.ownedTeamIds.join(", ")
                        : "None"}
                    </td>
                    <td>{formatCurrency(syndicate.portfolioExpectedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Session status</p>
              <h3>Operational readiness</h3>
            </div>
          </div>
          <div className="viewer-board">
            <div>
              <span>Storage backend</span>
              <strong>{dashboard.storageBackend}</strong>
            </div>
            <div>
              <span>Projection overrides</span>
              <strong>{dashboard.projectionOverrideCount}</strong>
            </div>
            <div>
              <span>Realtime posture</span>
              <strong>
                {dashboard.storageBackend === "supabase"
                  ? "Supabase realtime enabled"
                  : "Polling fallback active"}
              </strong>
            </div>
            <div>
              <span>Simulation snapshot</span>
              <strong>
                {dashboard.session.simulationSnapshot?.generatedAt
                  ? new Date(
                      dashboard.session.simulationSnapshot.generatedAt
                    ).toLocaleString()
                  : "Not built"}
              </strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
