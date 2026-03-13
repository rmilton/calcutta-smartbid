"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { accessImportSampleCsv } from "@/lib/access-import";
import { PayoutRules, SessionAdminConfig } from "@/lib/types";
import { formatCurrency, titleCaseStage } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const payoutStages: Array<
  keyof Pick<PayoutRules, "roundOf64" | "roundOf32" | "sweet16" | "elite8" | "finalFour" | "champion">
> = ["roundOf64", "roundOf32", "sweet16", "elite8", "finalFour", "champion"];

type SessionTab = "settings" | "access" | "syndicates" | "data" | "lifecycle";

interface SessionAdminCenterProps {
  initialConfig: SessionAdminConfig;
  mothershipSyndicateName: string;
}

function formatDollarInput(value: number) {
  return formatCurrency(Math.max(0, value));
}

function parseDollarInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return 0;
  }

  return Number(digits);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function SessionAdminCenter({
  initialConfig,
  mothershipSyndicateName
}: SessionAdminCenterProps) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SessionTab>("settings");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [sharedAccessCode, setSharedAccessCode] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "viewer">("all");
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
  const [sourceKey, setSourceKey] = useState(initialConfig.session.activeDataSource.key);
  const [payoutRules, setPayoutRules] = useState(initialConfig.session.payoutRules);
  const [projectedPotInput, setProjectedPotInput] = useState(
    formatDollarInput(initialConfig.session.payoutRules.projectedPot)
  );
  const [analysisSettings, setAnalysisSettings] = useState(
    initialConfig.session.analysisSettings
  );
  const accessCsvInputRef = useRef<HTMLInputElement | null>(null);

  const activeUsers = useMemo(
    () => config.platformUsers.filter((user) => user.active),
    [config.platformUsers]
  );
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return activeUsers.filter((user) => {
      const matchesSearch =
        !query || [user.name, user.email].join(" ").toLowerCase().includes(query);
      const role = userRoles[user.id] ?? "viewer";
      const matchesRole = userRoleFilter === "all" || role === userRoleFilter;
      return matchesSearch && matchesRole;
    });
  }, [activeUsers, userRoleFilter, userRoles, userSearch]);
  const activeSyndicates = useMemo(
    () => config.syndicateCatalog.filter((entry) => entry.active),
    [config.syndicateCatalog]
  );
  const mothershipCatalogEntry = useMemo(
    () =>
      activeSyndicates
        .find(
          (entry) =>
            entry.name.trim().toLowerCase() === mothershipSyndicateName.trim().toLowerCase()
        ) ?? null,
    [activeSyndicates, mothershipSyndicateName]
  );
  const mothershipSelected =
    mothershipCatalogEntry !== null && selectedSyndicateIds.includes(mothershipCatalogEntry.id);
  const allTrackedSyndicatesSelected =
    activeSyndicates.length > 0 &&
    activeSyndicates.every((entry) => selectedSyndicateIds.includes(entry.id));
  const totalPayoutPercent = useMemo(
    () => payoutStages.reduce((total, stage) => total + payoutRules[stage], 0),
    [payoutRules]
  );
  const projectedMothershipBudget = useMemo(
    () =>
      selectedSyndicateIds.length > 0
        ? Math.round(payoutRules.projectedPot / selectedSyndicateIds.length)
        : 0,
    [payoutRules.projectedPot, selectedSyndicateIds.length]
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
    setSourceKey(config.session.activeDataSource.key);
    setPayoutRules(config.session.payoutRules);
    setProjectedPotInput(formatDollarInput(config.session.payoutRules.projectedPot));
    setAnalysisSettings(config.session.analysisSettings);
  }, [config]);

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

  function toggleAllSyndicates(checked: boolean) {
    if (checked) {
      setSelectedSyndicateIds(activeSyndicates.map((entry) => entry.id));
      return;
    }

    setSelectedSyndicateIds(mothershipCatalogEntry ? [mothershipCatalogEntry.id] : []);
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
          { sharedAccessCode },
          "Shared access code rotated."
        );
        setSharedAccessCode("");
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

  async function onCopyJoinLink() {
    if (!config.currentSharedAccessCode) {
      return;
    }

    try {
      const url = new URL("/", window.location.origin);
      url.searchParams.set("code", config.currentSharedAccessCode);
      await navigator.clipboard.writeText(url.toString());
      setError(null);
      setNotice("Join link copied.");
    } catch {
      setError("Unable to copy the join link.");
    }
  }

  function onDownloadSampleCsv() {
    const blob = new Blob([accessImportSampleCsv], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "session-access-sample.csv";
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  function onImportUsersCsv(file: File | null) {
    if (!file) {
      return;
    }

    startTransition(async () => {
      try {
        const csvContent = await file.text();
        await submitJson(
          `/api/admin/sessions/${config.session.id}/access/import`,
          "POST",
          { csvContent },
          "Users imported into session access."
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to import session access users."
        );
      } finally {
        if (accessCsvInputRef.current) {
          accessCsvInputRef.current.value = "";
        }
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
            catalogSyndicateIds: selectedSyndicateIds
          },
          "Tracked syndicates updated."
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
          { sourceKey },
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
          { payoutRules },
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

  function onSaveAnalysisSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/analysis`,
          "PUT",
          { analysisSettings },
          "Analysis settings updated."
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to update analysis settings."
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
          { sourceKey },
          "Projection import completed."
        );
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to run import.");
      }
    });
  }

  function onArchiveSession() {
    startTransition(async () => {
      try {
        setError(null);
        setNotice(null);
        const response = await fetch(
          `/api/admin/sessions/${config.session.id}/lifecycle`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "archive" })
          }
        );

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to archive session.");
        }

        await refreshConfig();
        setNotice("Session archived.");
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to archive session."
        );
      }
    });
  }

  function onDeleteSession() {
    startTransition(async () => {
      try {
        setError(null);
        setNotice(null);
        const response = await fetch(
          `/api/admin/sessions/${config.session.id}/lifecycle`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ confirmationName: deleteConfirmationName })
          }
        );

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to delete session.");
        }

        router.push("/admin");
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to delete session."
        );
      }
    });
  }

  return (
    <div className="admin-shell">
      <header className="surface-card admin-form-header">
        <div className="admin-form-header__copy">
          <p className="eyebrow">mothership smartbid™</p>
          <h1>{config.session.name}</h1>
        </div>
        <div className="admin-form-header__actions">
          <Link href="/admin" className="button button-secondary button--small">
            Back
          </Link>
          <ThemeToggle />
          <span className="status-pill">{config.session.activeDataSource.name}</span>
          <span className="status-pill">
            {config.importRuns.length} import{config.importRuns.length === 1 ? "" : "s"}
          </span>
          <Link
            href={`/session/${config.session.id}`}
            className="button button-secondary button--small"
          >
            Open board
          </Link>
        </div>
      </header>

      {notice ? <p className="notice-text">{notice}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <nav className="admin-tabbar" aria-label="Session admin">
        {(
          [
            ["settings", "Settings"],
            ["access", "Access"],
            ["syndicates", "Syndicates"],
            ["data", "Data"],
            ["lifecycle", "Lifecycle"]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              activeTab === key ? "workspace-tab workspace-tab--active" : "workspace-tab"
            }
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "access" ? (
        <section className="admin-access-layout">
          <article className="surface-card admin-pane admin-access-users">
            <form onSubmit={onSaveAccess}>
              <div className="admin-pane__header admin-pane__section-header">
                <h2>Users</h2>
                <div className="button-row">
                  <span className="status-pill">{selectedUserIds.length} selected</span>
                  <button type="submit" className="button button--small" disabled={isPending}>
                    Save access
                  </button>
                </div>
              </div>
              <div className="admin-pane__toolbar admin-access-toolbar">
                <div className="admin-access-toolbar__filters">
                  <input
                    className="admin-filter-input"
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Name or email…"
                  />
                  <select
                    className="admin-filter-select"
                    value={userRoleFilter}
                    onChange={(event) =>
                      setUserRoleFilter(event.target.value as "all" | "admin" | "viewer")
                    }
                  >
                    <option value="all">All roles</option>
                    <option value="admin">Operators</option>
                    <option value="viewer">Viewers</option>
                  </select>
                </div>
                <div className="admin-access-toolbar__actions">
                  <button
                    type="button"
                    className="button button-ghost button--small"
                    onClick={onDownloadSampleCsv}
                  >
                    Download sample CSV
                  </button>
                  <input
                    ref={accessCsvInputRef}
                    className="admin-access-file-input"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => onImportUsersCsv(event.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className="button button-secondary button--small"
                    disabled={isPending}
                    onClick={() => accessCsvInputRef.current?.click()}
                  >
                    Import CSV
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="admin-table admin-table--dense">
                  <thead>
                    <tr>
                      <th>Use</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const selected = selectedUserIds.includes(user.id);
                      return (
                        <tr key={user.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleUser(user.id)}
                            />
                          </td>
                          <td>
                            <strong>{user.name}</strong>
                          </td>
                          <td>{user.email}</td>
                          <td>
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
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </form>
          </article>

          <aside className="surface-card admin-pane admin-access-rail">
            <div className="admin-pane__header admin-pane__section-header">
              <h2>Access</h2>
            </div>
            <div className="admin-utility-block">
              <p className="eyebrow">Shared access code</p>
              {config.currentSharedAccessCode ? (
                <strong className="secret-shell__value">{config.currentSharedAccessCode}</strong>
              ) : (
                <p className="support-copy">Set a shared access code to generate a join link.</p>
              )}
              <div className="button-row">
                <button
                  type="button"
                  className="button button-secondary button--small"
                  disabled={!config.currentSharedAccessCode}
                  onClick={() => void onCopyCurrentCode()}
                >
                  Copy code
                </button>
                <button
                  type="button"
                  className="button button-ghost button--small"
                  disabled={!config.currentSharedAccessCode}
                  onClick={() => void onCopyJoinLink()}
                >
                  Copy join link
                </button>
              </div>
            </div>

            <form onSubmit={onRotateCode} className="admin-access-rail__form">
              <label className="field-shell">
                <span>New code</span>
                <input
                  value={sharedAccessCode}
                  onChange={(event) => setSharedAccessCode(event.target.value)}
                  required
                />
              </label>
              <button type="submit" className="button button--small" disabled={isPending}>
                Rotate code
              </button>
            </form>
          </aside>
        </section>
      ) : null}

      {activeTab === "syndicates" ? (
        <section className="surface-card admin-pane">
          <form onSubmit={onSaveSyndicates}>
            <div className="admin-pane__header">
              <h2>Tracked syndicates</h2>
              <div className="button-row">
                <span className="status-pill">{selectedSyndicateIds.length} selected</span>
                <button type="submit" className="button button--small" disabled={isPending}>
                  Save syndicates
                </button>
              </div>
            </div>
            {mothershipCatalogEntry ? (
              <p className={mothershipSelected ? "support-copy" : "error-text"}>
                {mothershipSelected
                  ? `${mothershipSyndicateName} is always the strategy view for this room.`
                  : `${mothershipSyndicateName} must stay selected for this room.`}
              </p>
            ) : (
              <p className="error-text">
                {mothershipSyndicateName} is missing from the syndicate catalog.
              </p>
            )}
            <div className="table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label={
                          allTrackedSyndicatesSelected
                            ? "Keep only Mothership selected"
                            : "Select all tracked syndicates"
                        }
                        checked={allTrackedSyndicatesSelected}
                        onChange={(event) => toggleAllSyndicates(event.target.checked)}
                      />
                    </th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSyndicates.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSyndicateIds.includes(entry.id)}
                          onChange={() => toggleSyndicate(entry.id)}
                        />
                      </td>
                      <td>
                        <div className="syndicate-name">
                          <span className="chip-dot" style={{ backgroundColor: entry.color }} />
                          <strong>{entry.name}</strong>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </form>
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section className="surface-card admin-pane">
          <div className="admin-pane__section-header">
            <h2>Budget</h2>
          </div>
          <div className="compact-field-grid compact-field-grid--two">
            <label className="field-shell">
              <span>Projected pot</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={projectedPotInput}
                onChange={(event) => {
                  const nextValue = parseDollarInput(event.target.value);
                  setProjectedPotInput(formatDollarInput(nextValue));
                  setPayoutRules((current) => ({
                    ...current,
                    projectedPot: nextValue
                  }));
                }}
                required
              />
            </label>
            <label className="field-shell">
              <span>Projected Mothership Budget</span>
              <input value={formatCurrency(projectedMothershipBudget)} readOnly />
            </label>
          </div>

          <form onSubmit={onSavePayoutRules}>
            <div className="admin-pane__header admin-pane__section-header">
              <h2>Payouts</h2>
              <div className="button-row">
                <span className="status-pill">{totalPayoutPercent.toFixed(1)}%</span>
                <button type="submit" className="button button--small" disabled={isPending}>
                  Save payouts
                </button>
              </div>
            </div>
            <div className="compact-payout-grid session-payout-grid">
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
            </div>
          </form>

          <div className="admin-pane__section">
            <form onSubmit={onSaveAnalysisSettings}>
              <div className="admin-pane__header admin-pane__section-header">
                <h2>Analysis strategy</h2>
                <button type="submit" className="button button--small" disabled={isPending}>
                  Save strategy
                </button>
              </div>
              <div className="compact-field-grid compact-field-grid--three">
                <label className="field-shell">
                  <span>Target teams</span>
                  <input
                    type="number"
                    min={2}
                    max={24}
                    step={1}
                    value={analysisSettings.targetTeamCount}
                    onChange={(event) =>
                      setAnalysisSettings((current) => ({
                        ...current,
                        targetTeamCount: Number(event.target.value)
                      }))
                    }
                    required
                  />
                </label>
                <label className="field-shell">
                  <span>Max per-team %</span>
                  <input
                    type="number"
                    min={8}
                    max={45}
                    step={1}
                    value={analysisSettings.maxSingleTeamPct}
                    onChange={(event) =>
                      setAnalysisSettings((current) => ({
                        ...current,
                        maxSingleTeamPct: Number(event.target.value)
                      }))
                    }
                    required
                  />
                </label>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {activeTab === "data" ? (
        <section className="surface-card admin-pane">
          <form onSubmit={onSaveDataSource}>
            <div className="admin-pane__header">
              <h2>Data</h2>
              <div className="button-row">
                <button type="submit" className="button button--small" disabled={isPending}>
                  Save source
                </button>
                <button
                  type="button"
                  className="button button-secondary button--small"
                  disabled={isPending}
                  onClick={onRunImport}
                >
                  Run import
                </button>
              </div>
            </div>
            <label className="field-shell" style={{ maxWidth: "24rem" }}>
              <span>Active source</span>
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
          </form>

          <div className="admin-pane__section">
            <p className="eyebrow admin-pane__section-kicker">Import history</p>
            <div className="table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {config.importRuns.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <strong>No imports recorded.</strong>
                      </td>
                    </tr>
                  ) : (
                    config.importRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <strong>{run.sourceName}</strong>
                        </td>
                        <td>
                          <span
                            className={
                              run.status === "success"
                                ? "status-pill status-pill--positive"
                                : "status-pill status-pill--danger"
                            }
                          >
                            {run.status}
                          </span>
                        </td>
                        <td>{formatDateTime(run.createdAt)}</td>
                        <td>{run.message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "lifecycle" ? (
        <section className="surface-card admin-pane">
          <div className="admin-pane__header">
            <h2>Lifecycle</h2>
            {config.session.archivedAt ? (
              <span className="status-pill status-pill--muted">Archived</span>
            ) : null}
          </div>
          {config.session.archivedAt ? (
            <>
              <p className="support-copy">
                Archived {formatDateTime(config.session.archivedAt)}
                {config.session.archivedByName
                  ? ` by ${config.session.archivedByName}`
                  : ""}
                .
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button-danger button--small"
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setDeleteConfirmationName("");
                  }}
                >
                  Delete permanently
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="support-copy">
                Archive hides this session from the default admin list without changing board
                access or stored auction history.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button-ghost button--small"
                  disabled={isPending}
                  onClick={onArchiveSession}
                >
                  Archive session
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {showDeleteConfirm ? (
        <div className="confirm-modal-backdrop" role="presentation">
          <div
            className="surface-card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-delete-title"
          >
            <div className="confirm-modal__content">
              <p className="eyebrow">Permanent delete</p>
              <h2 id="session-delete-title">
                Delete {config.session.name} permanently
              </h2>
              <p className="support-copy">
                This permanently removes the session and all related records, including purchases,
                members, projections, overrides, imports, and snapshots.
              </p>
              <label className="field-shell">
                <span>Type the exact session name to confirm</span>
                <input
                  value={deleteConfirmationName}
                  onChange={(event) => setDeleteConfirmationName(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="button-row button-row--spread">
                <button
                  type="button"
                  className="button button-ghost button--small"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmationName("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-danger button--small"
                  disabled={deleteConfirmationName !== config.session.name || isPending}
                  onClick={onDeleteSession}
                >
                  Delete permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
