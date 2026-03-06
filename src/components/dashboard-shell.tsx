"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useSessionDashboard } from "@/lib/hooks/use-session-dashboard";
import { AuctionDashboard } from "@/lib/types";
import { formatCurrency, formatPercent, titleCaseStage } from "@/lib/utils";

interface DashboardShellProps {
  sessionId: string;
  initialDashboard: AuctionDashboard;
  viewerMode: boolean;
}

export function DashboardShell({
  sessionId,
  initialDashboard,
  viewerMode
}: DashboardShellProps) {
  const { dashboard, isRefreshing, refresh } = useSessionDashboard(
    sessionId,
    initialDashboard
  );
  const [selectedTeamId, setSelectedTeamId] = useState(
    dashboard.session.liveState.nominatedTeamId ?? ""
  );
  const [currentBid, setCurrentBid] = useState(dashboard.session.liveState.currentBid);
  const [buyerId, setBuyerId] = useState(dashboard.focusSyndicate.id);
  const [likelyBidderIds, setLikelyBidderIds] = useState<string[]>(
    dashboard.session.liveState.likelyBidderIds
  );
  const [overrideForm, setOverrideForm] = useState({
    rating: "",
    offense: "",
    defense: "",
    tempo: ""
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTeamId(dashboard.session.liveState.nominatedTeamId ?? "");
    setCurrentBid(dashboard.session.liveState.currentBid);
    setLikelyBidderIds(dashboard.session.liveState.likelyBidderIds);
  }, [dashboard.session.liveState]);

  const nominatedTeam = dashboard.nominatedTeam;
  const recommendation = dashboard.recommendation;
  const selectedTeam =
    dashboard.session.projections.find((team) => team.id === selectedTeamId) ?? null;
  const soldLookup = useMemo(
    () => new Set(dashboard.soldTeams.map((item) => item.team.id)),
    [dashboard.soldTeams]
  );
  const selectedOverride =
    (selectedTeamId && dashboard.session.projectionOverrides[selectedTeamId]) || null;

  useEffect(() => {
    if (!selectedTeam) {
      setOverrideForm({
        rating: "",
        offense: "",
        defense: "",
        tempo: ""
      });
      return;
    }

    setOverrideForm({
      rating: selectedOverride?.rating?.toString() ?? selectedTeam.rating.toString(),
      offense: selectedOverride?.offense?.toString() ?? selectedTeam.offense.toString(),
      defense: selectedOverride?.defense?.toString() ?? selectedTeam.defense.toString(),
      tempo: selectedOverride?.tempo?.toString() ?? selectedTeam.tempo.toString()
    });
  }, [selectedOverride, selectedTeam]);

  function toggleLikelyBidder(syndicateId: string) {
    setLikelyBidderIds((current) =>
      current.includes(syndicateId)
        ? current.filter((candidate) => candidate !== syndicateId)
        : [...current, syndicateId]
    );
  }

  async function saveLiveState() {
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/sessions/${sessionId}/live-state`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        nominatedTeamId: selectedTeamId || null,
        currentBid,
        likelyBidderIds
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to update live state.");
      return;
    }

    setNotice("Live board updated.");
    startTransition(() => {
      void refresh();
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
      setError("Choose a nominated team before recording a purchase.");
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
    startTransition(() => {
      void refresh();
    });
  }

  async function saveProjectionOverride() {
    if (!selectedTeamId) {
      setError("Choose a team before saving an override.");
      return;
    }

    setError(null);
    setNotice(null);
    const response = await fetch(
      `/api/sessions/${sessionId}/projections/${selectedTeamId}/override`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rating: Number(overrideForm.rating),
          offense: Number(overrideForm.offense),
          defense: Number(overrideForm.defense),
          tempo: Number(overrideForm.tempo)
        })
      }
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to save projection override.");
      return;
    }

    setNotice("Projection override saved and simulation rebuilt.");
    startTransition(() => {
      void refresh();
    });
  }

  async function clearProjectionOverride() {
    if (!selectedTeamId) {
      setError("Choose a team before clearing an override.");
      return;
    }

    setError(null);
    setNotice(null);
    const response = await fetch(
      `/api/sessions/${sessionId}/projections/${selectedTeamId}/override`,
      {
        method: "DELETE"
      }
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to clear projection override.");
      return;
    }

    setNotice("Projection override cleared.");
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
          <span>Operator code {dashboard.session.eventAccess.operatorPasscode}</span>
          <span>Viewer code {dashboard.session.eventAccess.viewerPasscode}</span>
          <span>Backend {dashboard.storageBackend}</span>
          <span>{isRefreshing ? "Syncing..." : "Live sync ready"}</span>
        </div>
      </header>

      <section className="top-grid">
        <article className="hero-card">
          <div className="hero-card__head">
            <div>
              <p className="eyebrow">Live nomination</p>
              <h2>{nominatedTeam ? nominatedTeam.name : "No team nominated"}</h2>
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
                  <span>Bidder pressure</span>
                  <strong>{Math.round(recommendation.bidderPressure * 100)}%</strong>
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

          <div className="form-stack">
            <label>
              <span>Nominated team</span>
              <select
                disabled={viewerMode}
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                <option value="">Select a team</option>
                {dashboard.session.projections.map((team) => (
                  <option
                    key={team.id}
                    value={team.id}
                    disabled={soldLookup.has(team.id)}
                  >
                    {team.seed}. {team.name} ({team.region})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Current bid</span>
              <input
                disabled={viewerMode}
                type="number"
                min={0}
                step={100}
                value={currentBid}
                onChange={(event) => setCurrentBid(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Likely bidders</span>
              <div className="chip-grid">
                {dashboard.ledger.map((syndicate) => (
                  <button
                    key={syndicate.id}
                    type="button"
                    disabled={viewerMode}
                    className={
                      likelyBidderIds.includes(syndicate.id)
                        ? "chip chip--active"
                        : "chip"
                    }
                    onClick={() => toggleLikelyBidder(syndicate.id)}
                  >
                    <span
                      className="chip-dot"
                      style={{ backgroundColor: syndicate.color }}
                    />
                    {syndicate.name}
                  </button>
                ))}
              </div>
            </label>
            <label>
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
          </div>

          {!viewerMode ? (
            <div className="control-actions">
              <button type="button" onClick={() => void saveLiveState()}>
                Update live board
              </button>
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
            <p className="viewer-note">
              Viewer mode is read-only. Operator controls are hidden from guests.
            </p>
          )}

          {notice ? <p className="form-notice">{notice}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </article>

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
              <p className="eyebrow">Projection controls</p>
              <h3>Manual overrides</h3>
            </div>
          </div>

          {selectedTeam ? (
            <div className="form-stack">
              <div className="override-meta">
                <strong>{selectedTeam.name}</strong>
                <span>
                  Source {selectedTeam.source}
                  {selectedOverride ? " with manual override" : ""}
                </span>
              </div>
              <label>
                <span>Rating</span>
                <input
                  disabled={viewerMode}
                  type="number"
                  step="0.1"
                  value={overrideForm.rating}
                  onChange={(event) =>
                    setOverrideForm((current) => ({
                      ...current,
                      rating: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                <span>Offense</span>
                <input
                  disabled={viewerMode}
                  type="number"
                  step="0.1"
                  value={overrideForm.offense}
                  onChange={(event) =>
                    setOverrideForm((current) => ({
                      ...current,
                      offense: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                <span>Defense</span>
                <input
                  disabled={viewerMode}
                  type="number"
                  step="0.1"
                  value={overrideForm.defense}
                  onChange={(event) =>
                    setOverrideForm((current) => ({
                      ...current,
                      defense: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                <span>Tempo</span>
                <input
                  disabled={viewerMode}
                  type="number"
                  step="0.1"
                  value={overrideForm.tempo}
                  onChange={(event) =>
                    setOverrideForm((current) => ({
                      ...current,
                      tempo: event.target.value
                    }))
                  }
                />
              </label>
              {!viewerMode ? (
                <div className="control-actions">
                  <button type="button" onClick={() => void saveProjectionOverride()}>
                    Save override
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void clearProjectionOverride()}
                  >
                    Clear override
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="viewer-note">
              Pick a team in the operator console to edit projection inputs.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Viewer board</p>
              <h3>Shared auction snapshot</h3>
            </div>
          </div>
          <div className="viewer-board">
            <div>
              <span>Current team</span>
              <strong>{dashboard.nominatedTeam?.name ?? "Waiting for nomination"}</strong>
            </div>
            <div>
              <span>Current bid</span>
              <strong>{formatCurrency(dashboard.session.liveState.currentBid)}</strong>
            </div>
            <div>
              <span>Likely bidders</span>
              <strong>
                {dashboard.session.liveState.likelyBidderIds.length
                  ? dashboard.session.liveState.likelyBidderIds
                      .map(
                        (id) =>
                          dashboard.ledger.find((syndicate) => syndicate.id === id)?.name ??
                          id
                      )
                      .join(", ")
                  : "Not tagged"}
              </strong>
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
