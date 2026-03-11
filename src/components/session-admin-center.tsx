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
  const successfulImportCount = useMemo(
    () => config.importRuns.filter((run) => run.status === "success").length,
    [config.importRuns]
  );
  const readinessSteps = useMemo(
    () => [
      {
        label: "Access",
        status: accessCount > 0 ? `${accessCount} assigned` : "Needs operator and viewer assignments"
      },
      {
        label: "Room code",
        status: config.session.eventAccess.sharedCodeConfigured ? "Configured" : "Missing room code"
      },
      {
        label: "Syndicates",
        status:
          selectedSyndicateIds.length > 0
            ? `${selectedSyndicateIds.length} participating`
            : "Choose room lineup"
      },
      {
        label: "Economics",
        status:
          payoutRules.projectedPot > 0 && totalPayoutPercent > 0
            ? `$${payoutRules.projectedPot.toLocaleString()} projected pot`
            : "Needs payout inputs"
      },
      {
        label: "Data import",
        status:
          successfulImportCount > 0
            ? `${successfulImportCount} successful import${successfulImportCount === 1 ? "" : "s"}`
            : "Run first projection import"
      },
      {
        label: "Launch tools",
        status: "Open operator board, viewer preview, or analysis"
      }
    ],
    [
      accessCount,
      config.session.eventAccess.sharedCodeConfigured,
      payoutRules.projectedPot,
      selectedSyndicateIds.length,
      successfulImportCount,
      totalPayoutPercent
    ]
  );

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
          "Shared room code rotated."
        );
        setSharedAccessCode("");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to rotate shared room code."
        );
      }
    });
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
          <p className="eyebrow">Session workspace</p>
          <h1>{config.session.name}</h1>
          <p>
            Complete room readiness in order, then launch operator, viewer, and analysis
            tools from the same session workspace.
          </p>
        </div>
        <div className="session-hero__meta">
          <span className="status-pill">{config.session.activeDataSource.name}</span>
          <span className="status-pill">
            {config.importRuns.length} import run{config.importRuns.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <article className="surface-card">
        <div className="section-headline">
          <div>
            <p className="eyebrow">Room readiness</p>
            <h3>Follow the launch flow in order</h3>
            <p>Access, room code, syndicates, economics, data import, then launch tools.</p>
          </div>
        </div>
        <div className="readiness-grid">
          {readinessSteps.map((step, index) => (
            <div key={step.label} className="readiness-item">
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
              <p>{step.status}</p>
            </div>
          ))}
        </div>
        <div className="button-row">
          <Link href="#session-access" className="button button-secondary">
            Invite members
          </Link>
          <Link href="#session-data" className="button button-secondary">
            Import projections
          </Link>
          <Link href={`/session/${config.session.id}`} className="button button-ghost">
            Open operator board
          </Link>
          <Link href={`/session/${config.session.id}?preview=viewer`} className="button button-ghost">
            Open viewer preview
          </Link>
          <Link href={`/csv-analysis?sessionId=${config.session.id}`} className="button button-secondary">
            Open analysis
          </Link>
        </div>
      </article>

      <section className="admin-summary-grid">
        <article className="surface-card admin-summary-card">
          <span>Assigned people</span>
          <strong>{accessCount}</strong>
          <p>Session-specific operator and viewer assignments.</p>
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
        <article id="session-access" className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3>Assign operators and viewers</h3>
              <p>Select active platform users and set their room-specific role before launch.</p>
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
                      <option value="admin">Operator</option>
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

        <article id="session-room-code" className="surface-card form-section">
          <div className="form-section__header">
            <p className="eyebrow">Step 2</p>
            <h3>Rotate shared room code</h3>
            <p>Issue a new room code without changing assigned operators and viewers.</p>
          </div>
          <form className="setup-shell" onSubmit={onRotateCode}>
            <label className="field-shell">
              <span>New shared room code</span>
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

        <article id="session-economics" className="surface-card form-section">
          <div className="form-section__header">
            <p className="eyebrow">Step 4</p>
            <h3>Set room economics</h3>
            <p>Configure the payout percentages and projected pot the model uses for valuation.</p>
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
        <article id="session-syndicates" className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Step 3</p>
              <h3>Choose the room lineup</h3>
              <p>Select the syndicates that can bid in this room and confirm your syndicate.</p>
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
              <span>Your syndicate</span>
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

        <article id="session-data" className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Step 5</p>
              <h3>Confirm data source and imports</h3>
              <p>Choose the active feed, import projections, and verify the room is ready for launch.</p>
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
                Import projections
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

      <section className="admin-grid">
        <article className="surface-card form-section">
          <div className="section-headline">
            <div>
              <p className="eyebrow">Step 6</p>
              <h3>Launch tools</h3>
              <p>Use these links when the room is ready for operator, viewer, and analysis workflows.</p>
            </div>
            <span className="status-pill">Launch</span>
          </div>
          <div className="button-row">
            <Link href={`/session/${config.session.id}`} className="button">
              Open operator board
            </Link>
            <Link href={`/session/${config.session.id}?preview=viewer`} className="button button-ghost">
              Open viewer preview
            </Link>
            <Link href={`/csv-analysis?sessionId=${config.session.id}`} className="button button-secondary">
              Open analysis
            </Link>
          </div>
          <p className="support-copy">
            Use operator board for live auction execution, viewer preview for room-facing read-only checks, and analysis for CSV-based team review.
          </p>
        </article>
      </section>
    </div>
  );
}
