"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { PayoutRules, SessionAdminConfig } from "@/lib/types";
import { titleCaseStage } from "@/lib/utils";

const payoutStages: Array<
  keyof Pick<PayoutRules, "roundOf64" | "roundOf32" | "sweet16" | "elite8" | "finalFour" | "champion">
> = ["roundOf64", "roundOf32", "sweet16", "elite8", "finalFour", "champion"];

interface SessionAdminCenterProps {
  initialConfig: SessionAdminConfig;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function SessionAdminCenter({ initialConfig }: SessionAdminCenterProps) {
  const [config, setConfig] = useState(initialConfig);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCurrentCode, setShowCurrentCode] = useState(false);
  const [sharedAccessCode, setSharedAccessCode] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    initialConfig.accessMembers.map((member) => member.platformUserId ?? "").filter(Boolean)
  );
  const [userRoles, setUserRoles] = useState<Record<string, "admin" | "viewer">>(
    Object.fromEntries(
      initialConfig.accessMembers
        .filter((member) => member.platformUserId)
        .map((member) => [member.platformUserId as string, member.role])
    )
  );
  const [selectedSyndicateIds, setSelectedSyndicateIds] = useState<string[]>(
    initialConfig.session.syndicates
      .filter((syndicate) => syndicate.catalogEntryId)
      .map((syndicate) => syndicate.catalogEntryId as string)
  );
  const [focusSyndicateName, setFocusSyndicateName] = useState(
    initialConfig.session.syndicates.find(
      (syndicate) => syndicate.id === initialConfig.session.focusSyndicateId
    )?.name ?? ""
  );
  const [sourceKey, setSourceKey] = useState(initialConfig.session.activeDataSource.key);
  const [payoutRules, setPayoutRules] = useState(initialConfig.session.payoutRules);

  const activeUsers = useMemo(
    () => config.platformUsers.filter((user) => user.active),
    [config.platformUsers]
  );
  const activeSyndicates = useMemo(
    () => config.syndicateCatalog.filter((entry) => entry.active),
    [config.syndicateCatalog]
  );
  const pendingFocusOptions = useMemo(() => {
    return activeSyndicates
      .filter((entry) => selectedSyndicateIds.includes(entry.id))
      .map((entry) => ({
        id:
          config.session.syndicates.find((syndicate) => syndicate.catalogEntryId === entry.id)?.id ??
          entry.id,
        name: entry.name
      }));
  }, [activeSyndicates, config.session.syndicates, selectedSyndicateIds]);
  const totalPayoutPercent = useMemo(
    () => payoutStages.reduce((total, stage) => total + payoutRules[stage], 0),
    [payoutRules]
  );
  const accessCount = selectedUserIds.length;

  useEffect(() => {
    setSelectedUserIds(
      config.accessMembers.map((member) => member.platformUserId ?? "").filter(Boolean)
    );
    setUserRoles(
      Object.fromEntries(
        config.accessMembers
          .filter((member) => member.platformUserId)
          .map((member) => [member.platformUserId as string, member.role])
      )
    );
    setSelectedSyndicateIds(
      config.session.syndicates
        .filter((syndicate) => syndicate.catalogEntryId)
        .map((syndicate) => syndicate.catalogEntryId as string)
    );
    setFocusSyndicateName(
      config.session.syndicates.find(
        (syndicate) => syndicate.id === config.session.focusSyndicateId
      )?.name ?? ""
    );
    setSourceKey(config.session.activeDataSource.key);
    setPayoutRules(config.session.payoutRules);
  }, [config]);

  useEffect(() => {
    setShowCurrentCode(false);
  }, [config.currentSharedAccessCode]);

  useEffect(() => {
    if (pendingFocusOptions.length === 0) {
      return;
    }

    if (!pendingFocusOptions.some((syndicate) => syndicate.name === focusSyndicateName)) {
      setFocusSyndicateName(pendingFocusOptions[0].name);
    }
  }, [focusSyndicateName, pendingFocusOptions]);

  async function refreshConfig() {
    const response = await fetch(`/api/admin/sessions/${config.session.id}/config`, {
      cache: "no-store"
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to refresh session settings.");
    }
    const payload = (await response.json()) as SessionAdminConfig;
    setConfig(payload);
  }

  async function submitJson(
    url: string,
    method: "PUT" | "POST",
    body: Record<string, unknown>,
    successMessage: string
  ) {
    setError(null);
    setNotice(null);
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Request failed.");
    }

    const payload = (await response.json()) as SessionAdminConfig | null;
    if (payload) {
      setConfig(payload);
    } else {
      await refreshConfig();
    }
    setNotice(successMessage);
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
    setUserRoles((current) => ({
      ...current,
      [userId]: current[userId] ?? "viewer"
    }));
  }

  function toggleSyndicate(entryId: string) {
    setSelectedSyndicateIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId]
    );
  }

  function onSaveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/access`,
          "PUT",
          {
            assignments: selectedUserIds.map((platformUserId) => ({
              platformUserId,
              role: userRoles[platformUserId] ?? "viewer",
              active: true
            }))
          },
          "Session access updated."
        );
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to save access.");
      }
    });
  }

  function onRotateCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/login`,
          "PUT",
          {
            sharedAccessCode
          },
          "Shared access code rotated."
        );
        setSharedAccessCode("");
        setShowCurrentCode(false);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to rotate shared access code."
        );
      }
    });
  }

  async function onCopyCurrentCode() {
    if (!config.currentSharedAccessCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(config.currentSharedAccessCode);
      setError(null);
      setNotice("Shared access code copied.");
    } catch {
      setError("Unable to copy the shared access code.");
    }
  }

  function onSaveSyndicates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/syndicates`,
          "PUT",
          {
            focusSyndicateName,
            catalogSyndicateIds: selectedSyndicateIds
          },
          "Participating syndicates updated."
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to update syndicates."
        );
      }
    });
  }

  function onSaveDataSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/data`,
          "PUT",
          {
            sourceKey
          },
          "Active data source updated."
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to update data source."
        );
      }
    });
  }

  function onSavePayoutRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/payout`,
          "PUT",
          {
            payoutRules
          },
          "Payout structure updated."
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to update payout structure."
        );
      }
    });
  }

  function onRunImport() {
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/data/import`,
          "POST",
          {
            sourceKey
          },
          "Projection import completed."
        );
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to run import.");
      }
    });
  }

  return (
    <div className="stack-layout">
      <header className="surface-card session-hero">
        <div className="session-hero__copy">
          <p className="eyebrow">Session Admin</p>
          <h1>{config.session.name}</h1>
          <p>
            Manage who can log in, which syndicates are participating, and which
            projection source feeds this auction room.
          </p>
        </div>
        <div className="session-hero__meta">
          <span className="status-pill">{config.session.activeDataSource.name}</span>
          <span className="status-pill">
            {config.importRuns.length} import run{config.importRuns.length === 1 ? "" : "s"}
          </span>
          <Link
            href={`/csv-analysis?sessionId=${config.session.id}`}
            className="button button-secondary"
          >
            Open analysis
          </Link>
        </div>
      </header>

      <section className="admin-summary-grid">
        <article className="surface-card admin-summary-card">
          <span>Assigned users</span>
          <strong>{accessCount}</strong>
          <p>Session-specific admin and viewer assignments.</p>
        </article>
        <article className="surface-card admin-summary-card">
          <span>Participating syndicates</span>
          <strong>{selectedSyndicateIds.length}</strong>
          <p>Reusable syndicates currently active in the room.</p>
        </article>
        <article className="surface-card admin-summary-card">
          <span>Projected pot</span>
          <strong>${payoutRules.projectedPot.toLocaleString()}</strong>
          <p>Estimated pool used to calculate round-based payouts.</p>
        </article>
        <article className="surface-card admin-summary-card">
          <span>Payout allocation</span>
          <strong>{totalPayoutPercent.toFixed(1)}%</strong>
          <p>Total configured distribution across all scoring stages.</p>
        </article>
      </section>

      {notice ? <p className="notice-text">{notice}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="admin-card-grid admin-card-grid--three">
        <article className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Access</p>
              <h3>Assign session users</h3>
              <p>Select active platform users and set their room-specific role.</p>
            </div>
            <span className="status-pill">{activeUsers.length} available</span>
          </div>
          <form className="setup-shell" onSubmit={onSaveAccess}>
            <div className="selection-list">
              {activeUsers.map((user) => {
                const selected = selectedUserIds.includes(user.id);
                return (
                  <div key={user.id} className="selection-row">
                    <label className="selection-check">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleUser(user.id)}
                      />
                      <div className="selection-check__meta">
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                    </label>
                    <select
                      className="inline-select"
                      disabled={!selected}
                      value={userRoles[user.id] ?? "viewer"}
                      onChange={(event) =>
                        setUserRoles((current) => ({
                          ...current,
                          [user.id]: event.target.value as "admin" | "viewer"
                        }))
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="button-row">
              <button type="submit" className="button" disabled={isPending}>
                Save access
              </button>
            </div>
          </form>
        </article>

        <article className="surface-card form-section">
          <div className="form-section__header">
            <p className="eyebrow">Login</p>
            <h3>Rotate shared access code</h3>
            <p>Issue a new room code without changing the assigned member list.</p>
          </div>
          <div className="field-shell">
            <span>Current shared access code</span>
            {config.currentSharedAccessCode ? (
              <div className="secret-shell">
                <strong className="secret-shell__value">
                  {showCurrentCode ? config.currentSharedAccessCode : "••••••••••"}
                </strong>
                <div className="button-row">
                  <button
                    type="button"
                    className="button button-secondary button--small"
                    onClick={() => setShowCurrentCode((current) => !current)}
                  >
                    {showCurrentCode ? "Hide code" : "Reveal code"}
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button--small"
                    onClick={() => void onCopyCurrentCode()}
                  >
                    Copy code
                  </button>
                </div>
              </div>
            ) : (
              <p className="support-copy">
                Current code is not recoverable for this session yet. Rotate it once to store an
                encrypted revealable version.
              </p>
            )}
          </div>
          <form className="setup-shell" onSubmit={onRotateCode}>
            <label className="field-shell">
              <span>New shared access code</span>
              <input
                value={sharedAccessCode}
                onChange={(event) => setSharedAccessCode(event.target.value)}
                required
              />
            </label>
            <div className="button-row">
              <button type="submit" className="button" disabled={isPending}>
                Rotate code
              </button>
            </div>
          </form>
        </article>

        <article className="surface-card form-section">
          <div className="form-section__header">
            <p className="eyebrow">Payouts</p>
            <h3>Set payout structure</h3>
            <p>Configure the distributable percentages the model uses for valuation.</p>
          </div>
          <form className="setup-shell" onSubmit={onSavePayoutRules}>
            <div className="form-grid form-grid--three">
              {payoutStages.map((stage) => (
                <label key={stage} className="field-shell">
                  <span>{titleCaseStage(stage)} %</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={payoutRules[stage]}
                    onChange={(event) =>
                      setPayoutRules((current) => ({
                        ...current,
                        [stage]: Number(event.target.value)
                      }))
                    }
                    required
                  />
                </label>
              ))}
              <label className="field-shell">
                <span>Projected pot</span>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={payoutRules.projectedPot}
                  onChange={(event) =>
                    setPayoutRules((current) => ({
                      ...current,
                      projectedPot: Number(event.target.value)
                    }))
                  }
                  required
                />
              </label>
            </div>
            <p className="support-copy">
              Total round payout: {totalPayoutPercent.toFixed(1)}% of the estimated distributable pot.
            </p>
            <div className="button-row">
              <button type="submit" className="button" disabled={isPending}>
                Save payout structure
              </button>
            </div>
          </form>
        </article>
      </section>

      <section className="admin-grid">
        <article className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Syndicates</p>
              <h3>Participating syndicate list</h3>
              <p>Select the catalog entries available to bid in this session.</p>
            </div>
            <span className="status-pill">{selectedSyndicateIds.length} selected</span>
          </div>
          <form className="setup-shell" onSubmit={onSaveSyndicates}>
            <div className="selection-list">
              {activeSyndicates.map((entry) => (
                <label key={entry.id} className="selection-row selection-row--stacked">
                  <span className="selection-check">
                    <input
                      type="checkbox"
                      checked={selectedSyndicateIds.includes(entry.id)}
                      onChange={() => toggleSyndicate(entry.id)}
                    />
                    <span className="selection-check__meta">
                      <strong>{entry.name}</strong>
                      <span>{entry.color}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="field-shell">
              <span>Focus syndicate</span>
              <select
                value={focusSyndicateName}
                onChange={(event) => setFocusSyndicateName(event.target.value)}
              >
                {pendingFocusOptions.map((syndicate) => (
                  <option key={syndicate.id} value={syndicate.name}>
                    {syndicate.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button type="submit" className="button" disabled={isPending}>
                Save syndicates
              </button>
            </div>
          </form>
        </article>

        <article className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Data</p>
              <h3>Projection source and imports</h3>
              <p>Choose the active feed and monitor recent projection imports.</p>
            </div>
            <span className="status-pill">{config.importRuns.length} imports logged</span>
          </div>
          <form className="setup-shell" onSubmit={onSaveDataSource}>
            <label className="field-shell">
              <span>Active data source</span>
              <select value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>
                <option value="builtin:mock">Built-in Mock Field</option>
                {config.dataSources
                  .filter((source) => source.active)
                  .map((source) => (
                    <option key={source.id} value={`data-source:${source.id}`}>
                      {source.name} ({source.kind.toUpperCase()})
                    </option>
                  ))}
              </select>
            </label>
            <div className="button-row">
              <button type="submit" className="button" disabled={isPending}>
                Save source
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={isPending}
                onClick={onRunImport}
              >
                Run import
              </button>
            </div>
          </form>

          <div className="selection-list">
            {config.importRuns.length === 0 ? (
              <div className="list-line">
                <strong>No imports recorded yet.</strong>
              </div>
            ) : (
              config.importRuns.map((run) => (
                <article key={run.id} className="list-line import-run">
                  <div className="import-run__topline">
                    <strong>{run.sourceName}</strong>
                    <span
                      className={
                        run.status === "success"
                          ? "status-pill status-pill--positive"
                          : "status-pill status-pill--danger"
                      }
                    >
                      {run.status}
                    </span>
                  </div>
                  <p>{run.message}</p>
                  <div className="import-run__meta">
                    <span>{formatDateTime(run.createdAt)}</span>
                    <span>{run.sourceKey}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
