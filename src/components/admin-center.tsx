"use client";

import Link from "next/link";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AdminCenterData,
  DataSource,
  DataSourcePurpose,
  PlatformUser,
  SyndicateCatalogEntry
} from "@/lib/types";
import { useFeedbackMessage } from "@/lib/hooks/use-feedback-message";

type AdminTab = "sessions" | "users" | "syndicates" | "data";
type StatusFilter = "all" | "active" | "inactive";

interface AdminCenterProps {
  initialData: AdminCenterData;
  platformAdminEmail: string;
}

interface UserDraft {
  name: string;
  email: string;
  active: boolean;
}

interface SyndicateDraft {
  name: string;
  active: boolean;
}

interface SourceDraft {
  name: string;
  purpose: DataSourcePurpose;
  csvContent: string;
  fileName: string;
  active: boolean;
}

interface SessionDeleteState {
  sessionId: string;
  sessionName: string;
}

const emptyUserDraft = (): UserDraft => ({
  name: "",
  email: "",
  active: true
});

const emptySyndicateDraft = (): SyndicateDraft => ({
  name: "",
  active: true
});

const emptySourceDraft = (purpose: DataSourcePurpose = "bracket"): SourceDraft => ({
  name: "",
  purpose,
  csvContent: "",
  fileName: "",
  active: true
});

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getStatusClass(active: boolean) {
  return active ? "status-pill status-pill--positive" : "status-pill status-pill--muted";
}

function formatSessionAccess(adminCount: number, viewerCount: number) {
  return `${adminCount} operator${adminCount === 1 ? "" : "s"} / ${viewerCount} viewer${viewerCount === 1 ? "" : "s"}`;
}

function formatActiveViewerCount(count: number) {
  return `${count} active`;
}

function applyStatusFilter<T extends { active: boolean }>(items: T[], filter: StatusFilter) {
  if (filter === "active") {
    return items.filter((item) => item.active);
  }

  if (filter === "inactive") {
    return items.filter((item) => !item.active);
  }

  return items;
}

function sourceToDraft(source: DataSource): SourceDraft {
  const config = source.config as { csvContent: string; fileName: string | null };
  return {
    name: source.name,
    purpose: source.purpose,
    csvContent: config.csvContent,
    fileName: config.fileName ?? "",
    active: source.active
  };
}

export function AdminCenter({
  initialData,
  platformAdminEmail
}: AdminCenterProps) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<AdminTab>("sessions");
  const [isPending, startTransition] = useTransition();
  const { error, notice, clearFeedback, showError, showNotice } = useFeedbackMessage();

  const [sessionSearch, setSessionSearch] = useState("");
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<StatusFilter>("all");
  const [syndicateSearch, setSyndicateSearch] = useState("");
  const [syndicateFilter, setSyndicateFilter] = useState<StatusFilter>("all");
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<StatusFilter>("all");

  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddSyndicate, setShowAddSyndicate] = useState(false);
  const [showAddSourcePurpose, setShowAddSourcePurpose] = useState<DataSourcePurpose | null>(null);

  const [newUser, setNewUser] = useState<UserDraft>(emptyUserDraft);
  const [newSyndicate, setNewSyndicate] = useState<SyndicateDraft>(emptySyndicateDraft);
  const [newSource, setNewSource] = useState<SourceDraft>(emptySourceDraft());

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserDraft>(emptyUserDraft);
  const [editingSyndicateId, setEditingSyndicateId] = useState<string | null>(null);
  const [editingSyndicate, setEditingSyndicate] = useState<SyndicateDraft>(emptySyndicateDraft);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<SourceDraft>(emptySourceDraft());
  const [deleteTarget, setDeleteTarget] = useState<SessionDeleteState | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");

  const filteredSessions = useMemo(() => {
    const scopedSessions = data.sessions.filter((session) =>
      showArchivedSessions ? session.isArchived : !session.isArchived
    );
    const query = sessionSearch.trim().toLowerCase();
    if (!query) {
      return scopedSessions;
    }

    return scopedSessions.filter((session) =>
      [
        session.name,
        session.bracketSourceName ?? "",
        session.analysisSourceName ?? "",
        session.importReadinessStatus,
        session.importReadinessSummary
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [data.sessions, sessionSearch, showArchivedSessions]);

  const filteredUsers = useMemo(() => {
    const scoped = applyStatusFilter(data.platformUsers, userFilter);
    const query = userSearch.trim().toLowerCase();
    if (!query) {
      return scoped;
    }

    return scoped.filter((user) =>
      [user.name, user.email].join(" ").toLowerCase().includes(query)
    );
  }, [data.platformUsers, userFilter, userSearch]);

  const filteredSyndicates = useMemo(() => {
    const scoped = applyStatusFilter(data.syndicateCatalog, syndicateFilter);
    const query = syndicateSearch.trim().toLowerCase();
    if (!query) {
      return scoped;
    }

    return scoped.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [data.syndicateCatalog, syndicateFilter, syndicateSearch]);

  const filteredSources = useMemo(() => {
    const scoped = applyStatusFilter(data.dataSources, sourceFilter);
    const query = sourceSearch.trim().toLowerCase();
    if (!query) {
      return scoped;
    }

    return scoped.filter((source) =>
      [source.name, source.kind, source.purpose].join(" ").toLowerCase().includes(query)
    );
  }, [data.dataSources, sourceFilter, sourceSearch]);

  const filteredBracketSources = useMemo(
    () => filteredSources.filter((source) => source.purpose === "bracket"),
    [filteredSources]
  );
  const filteredAnalysisSources = useMemo(
    () => filteredSources.filter((source) => source.purpose === "analysis"),
    [filteredSources]
  );
  const refreshData = useCallback(async () => {
    const response = await fetch("/api/admin/center", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to refresh admin center.");
    }

    const payload = (await response.json()) as AdminCenterData;
    setData(payload);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshData().catch(() => undefined);
      }
    }, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshData().catch(() => undefined);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshData]);

  async function submitJson(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string
  ) {
    clearFeedback();
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

    await refreshData();
    showNotice(successMessage);
  }

  async function archiveSession(sessionId: string) {
    clearFeedback();
    const response = await fetch(`/api/admin/sessions/${sessionId}/lifecycle`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "archive" })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to archive session.");
    }

    await refreshData();
    showNotice("Session archived.");
  }

  async function deleteSessionPermanently(sessionId: string, confirmationName: string) {
    clearFeedback();
    const response = await fetch(`/api/admin/sessions/${sessionId}/lifecycle`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ confirmationName })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to delete session.");
    }

    await refreshData();
    setDeleteTarget(null);
    setDeleteConfirmationName("");
    showNotice("Session deleted permanently.");
  }

  function onCsvFileSelect(
    file: File | null,
    setDraft: React.Dispatch<React.SetStateAction<SourceDraft>>
  ) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({
        ...current,
        csvContent: String(reader.result ?? ""),
        fileName: file.name
      }));
    };
    reader.readAsText(file);
  }

  function startEditUser(user: PlatformUser) {
    setEditingUserId(user.id);
    setEditingUser({
      name: user.name,
      email: user.email,
      active: user.active
    });
  }

  function startEditSyndicate(entry: SyndicateCatalogEntry) {
    setEditingSyndicateId(entry.id);
    setEditingSyndicate({
      name: entry.name,
      active: entry.active
    });
  }

  function startEditSource(source: DataSource) {
    setEditingSourceId(source.id);
    setEditingSource(sourceToDraft(source));
    setShowAddSourcePurpose(null);
  }

  function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson("/api/admin/users", "POST", newUser, "User created.");
        setNewUser(emptyUserDraft());
        setShowAddUser(false);
      } catch (submitError) {
        showError(submitError instanceof Error ? submitError.message : "Unable to create user.");
      }
    });
  }

  function onUpdateUser(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(`/api/admin/users/${userId}`, "PATCH", editingUser, "User updated.");
        setEditingUserId(null);
        setEditingUser(emptyUserDraft());
      } catch (submitError) {
        showError(submitError instanceof Error ? submitError.message : "Unable to update user.");
      }
    });
  }

  function onCreateSyndicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          "/api/admin/syndicates",
          "POST",
          newSyndicate,
          "Syndicate created."
        );
        setNewSyndicate(emptySyndicateDraft());
        setShowAddSyndicate(false);
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to create syndicate."
        );
      }
    });
  }

  function onUpdateSyndicate(event: FormEvent<HTMLFormElement>, entryId: string) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/syndicates/${entryId}`,
          "PATCH",
          editingSyndicate,
          "Syndicate updated."
        );
        setEditingSyndicateId(null);
        setEditingSyndicate(emptySyndicateDraft());
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to update syndicate."
        );
      }
    });
  }

  function getSourcePayload(draft: SourceDraft) {
    return {
      name: draft.name,
      kind: "csv" as const,
      purpose: draft.purpose,
      active: draft.active,
      csvContent: draft.csvContent,
      fileName: draft.fileName || null
    };
  }

  function getSourceUpdatePayload(draft: SourceDraft) {
    return {
      name: draft.name,
      active: draft.active,
      csvContent: draft.csvContent,
      fileName: draft.fileName || null
    };
  }

  function onCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          "/api/admin/data-sources",
          "POST",
          getSourcePayload(newSource),
          "Data source created."
        );
        setNewSource(emptySourceDraft(newSource.purpose));
        setShowAddSourcePurpose(null);
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to create data source."
        );
      }
    });
  }

  function onUpdateSource(event: FormEvent<HTMLFormElement>, sourceId: string) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/data-sources/${sourceId}`,
          "PATCH",
          getSourceUpdatePayload(editingSource),
          "Data source updated."
        );
        setEditingSourceId(null);
        setEditingSource(emptySourceDraft());
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to update data source."
        );
      }
    });
  }

  function onTestSource(sourceId: string) {
    startTransition(async () => {
      try {
        clearFeedback();
        const response = await fetch(`/api/admin/data-sources/${sourceId}/test`, {
          method: "POST"
        });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to test data source.");
        }

        await refreshData();
        showNotice("Data source test succeeded.");
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to test data source."
        );
      }
    });
  }

  function renderDataSourceSection(
    purpose: DataSourcePurpose,
    title: string,
    sources: DataSource[]
  ) {
    const showAdd = showAddSourcePurpose === purpose;

    return (
      <div className="admin-pane__section">
        <div className="admin-pane__header admin-pane__section-header">
          <div>
            <p className="eyebrow admin-pane__section-kicker">{title}</p>
            <h3>{sources.length} reusable source{sources.length === 1 ? "" : "s"}</h3>
          </div>
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              setEditingSourceId(null);
              if (showAdd) {
                setShowAddSourcePurpose(null);
                setNewSource(emptySourceDraft(purpose));
                return;
              }
              setShowAddSourcePurpose(purpose);
              setNewSource(emptySourceDraft(purpose));
            }}
          >
            {showAdd ? "Close" : `Add ${title.toLowerCase()} source`}
          </button>
        </div>

        <div className="table-wrap admin-table-wrap">
          <table className="admin-table admin-table--dense">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Last tested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {showAdd ? (
                <tr className="admin-edit-row">
                  <td colSpan={4}>
                    <form className="admin-inline-editor" onSubmit={onCreateSource}>
                      <div className="admin-inline-grid admin-inline-grid--source">
                        <label className="field-shell">
                          <span>Name</span>
                          <input
                            value={newSource.name}
                            onChange={(event) =>
                              setNewSource((current) => ({
                                ...current,
                                name: event.target.value
                              }))
                            }
                            required
                          />
                        </label>
                        <label className="field-shell admin-inline-flag">
                          <span>Status</span>
                          <select
                            value={newSource.active ? "active" : "inactive"}
                            onChange={(event) =>
                              setNewSource((current) => ({
                                ...current,
                                active: event.target.value === "active"
                              }))
                            }
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                        <label className="field-shell">
                          <span>CSV file</span>
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(event) =>
                              onCsvFileSelect(event.target.files?.[0] ?? null, setNewSource)
                            }
                          />
                        </label>
                        <label className="field-shell admin-inline-span">
                          <span>CSV content</span>
                          <textarea
                            rows={6}
                            value={newSource.csvContent}
                            onChange={(event) =>
                              setNewSource((current) => ({
                                ...current,
                                csvContent: event.target.value
                              }))
                            }
                            required
                          />
                        </label>
                      </div>
                      <div className="admin-inline-actions">
                        <button type="submit" className="button button--small" disabled={isPending}>
                          Save source
                        </button>
                        <button
                          type="button"
                          className="button button-ghost button--small"
                          onClick={() => {
                            setShowAddSourcePurpose(null);
                            setNewSource(emptySourceDraft(purpose));
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : null}
              {sources.map((source) => (
                <Fragment key={source.id}>
                  <tr>
                    <td>
                      <strong>{source.name}</strong>
                    </td>
                    <td>
                      <span className={getStatusClass(source.active)}>
                        {source.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDate(source.lastTestedAt)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="button button-secondary button--small"
                          disabled={isPending}
                          onClick={() => startEditSource(source)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button--small"
                          disabled={isPending}
                          onClick={() => onTestSource(source.id)}
                        >
                          Test
                        </button>
                        <button
                          type="button"
                          className="button button-ghost button--small"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await submitJson(
                                  `/api/admin/data-sources/${source.id}`,
                                  "PATCH",
                                  { active: !source.active },
                                  source.active ? "Data source disabled." : "Data source enabled."
                                );
                              } catch (submitError) {
                                showError(
                                  submitError instanceof Error
                                    ? submitError.message
                                    : "Unable to update data source."
                                );
                              }
                            })
                          }
                        >
                          {source.active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingSourceId === source.id ? (
                    <tr className="admin-edit-row">
                      <td colSpan={4}>
                        <form
                          className="admin-inline-editor"
                          onSubmit={(event) => onUpdateSource(event, source.id)}
                        >
                          <div className="admin-inline-grid admin-inline-grid--source">
                            <label className="field-shell">
                              <span>Name</span>
                              <input
                                value={editingSource.name}
                                onChange={(event) =>
                                  setEditingSource((current) => ({
                                    ...current,
                                    name: event.target.value
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="field-shell admin-inline-flag">
                              <span>Status</span>
                              <select
                                value={editingSource.active ? "active" : "inactive"}
                                onChange={(event) =>
                                  setEditingSource((current) => ({
                                    ...current,
                                    active: event.target.value === "active"
                                  }))
                                }
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </label>
                            <label className="field-shell">
                              <span>CSV file</span>
                              <input
                                type="file"
                                accept=".csv,text/csv"
                                onChange={(event) =>
                                  onCsvFileSelect(event.target.files?.[0] ?? null, setEditingSource)
                                }
                              />
                            </label>
                            <label className="field-shell admin-inline-span">
                              <span>CSV content</span>
                              <textarea
                                rows={6}
                                value={editingSource.csvContent}
                                onChange={(event) =>
                                  setEditingSource((current) => ({
                                    ...current,
                                    csvContent: event.target.value
                                  }))
                                }
                                required
                              />
                            </label>
                          </div>
                          <div className="admin-inline-actions">
                            <button type="submit" className="button button--small" disabled={isPending}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button--small"
                              onClick={() => {
                                setEditingSourceId(null);
                                setEditingSource(emptySourceDraft());
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-shell admin-shell--dense">
        <header className="surface-card admin-topbar">
          <div className="admin-topbar__title">
            <p className="eyebrow">mothership smartbid™</p>
            <h1>Admin center</h1>
          </div>
          <div className="admin-topbar__meta">
            <span className="status-pill">{platformAdminEmail}</span>
            <Link href="/admin/sessions/new" className="button button--small">
              New session
            </Link>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>

        {notice ? <p className="notice-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <nav className="admin-tabbar" aria-label="Admin datasets">
          {[
            ["sessions", "Sessions"],
            ["users", "Users"],
            ["syndicates", "Syndicates"],
            ["data", "Data Sources"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? "workspace-tab workspace-tab--active" : "workspace-tab"}
              onClick={() => setTab(key as AdminTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "sessions" ? (
          <section className="surface-card admin-pane">
            <div className="admin-pane__header">
              <div>
                <h2>Sessions</h2>
                <p>{filteredSessions.length} results</p>
              </div>
              <div className="admin-pane__toolbar">
                <input
                  className="admin-filter-input"
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  placeholder="Search sessions"
                />
                <button
                  type="button"
                  className={
                    showArchivedSessions
                      ? "button button-secondary button--small"
                      : "button button-ghost button--small"
                  }
                  onClick={() => setShowArchivedSessions((current) => !current)}
                >
                  {showArchivedSessions ? "Hide archived" : "Show archived"}
                </button>
              </div>
            </div>

            <div className="table-wrap admin-table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Updated</th>
                    <th>Imports</th>
                    <th>Purchases</th>
                    <th>Syndicates</th>
                    <th>Access</th>
                    <th>Live viewers</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr
                      key={session.id}
                      className={session.isArchived ? "table-row--muted" : undefined}
                    >
                      <td>
                        <strong>{session.name}</strong>
                        <div className="support-copy">Created {formatDate(session.createdAt)}</div>
                        {session.isArchived ? (
                          <div className="support-copy">Archived {formatDate(session.archivedAt)}</div>
                        ) : null}
                      </td>
                      <td>{formatDate(session.updatedAt)}</td>
                      <td>
                        <div className="support-copy">
                          Bracket: {session.bracketSourceName ?? "Not set"}
                        </div>
                        <div className="support-copy">
                          Analysis: {session.analysisSourceName ?? "Not set"}
                        </div>
                        <div className="support-copy">{session.importReadinessStatus}</div>
                      </td>
                      <td>{session.purchaseCount}</td>
                      <td>{session.syndicateCount}</td>
                      <td>{formatSessionAccess(session.adminCount, session.viewerCount)}</td>
                      <td>{formatActiveViewerCount(session.activeViewerCount)}</td>
                      <td>
                        <div className="admin-table-actions">
                          <Link
                            href={`/admin/sessions/${session.id}`}
                            className="button button-secondary button--small"
                          >
                            Manage
                          </Link>
                          {session.isArchived ? (
                            <button
                              type="button"
                              className="button button-danger button--small"
                              onClick={() => {
                                setDeleteTarget({
                                  sessionId: session.id,
                                  sessionName: session.name
                                });
                                setDeleteConfirmationName("");
                              }}
                            >
                              Delete permanently
                            </button>
                          ) : (
                            <>
                              <Link
                                href={`/session/${session.id}`}
                                className="button button-ghost button--small"
                              >
                                Board
                              </Link>
                              <button
                                type="button"
                                className="button button-ghost button--small"
                                disabled={isPending}
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await archiveSession(session.id);
                                    } catch (submitError) {
                                      showError(
                                        submitError instanceof Error
                                          ? submitError.message
                                          : "Unable to archive session."
                                      );
                                    }
                                  })
                                }
                              >
                                Archive
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "users" ? (
          <section className="surface-card admin-pane">
            <div className="admin-pane__header">
              <div>
                <h2>Users</h2>
                <p>{filteredUsers.length} results</p>
              </div>
              <div className="admin-pane__toolbar">
                <input
                  className="admin-filter-input"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search users"
                />
                <select
                  className="admin-filter-select"
                  value={userFilter}
                  onChange={(event) => setUserFilter(event.target.value as StatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Archived</option>
                </select>
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => {
                    setShowAddUser((current) => !current);
                    setEditingUserId(null);
                    setNewUser(emptyUserDraft());
                  }}
                >
                  {showAddUser ? "Close" : "Add user"}
                </button>
              </div>
            </div>

            <div className="table-wrap admin-table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {showAddUser ? (
                    <tr className="admin-edit-row">
                      <td colSpan={5}>
                        <form className="admin-inline-editor" onSubmit={onCreateUser}>
                          <div className="admin-inline-grid admin-inline-grid--user">
                            <label className="field-shell">
                              <span>Name</span>
                              <input
                                value={newUser.name}
                                onChange={(event) =>
                                  setNewUser((current) => ({
                                    ...current,
                                    name: event.target.value
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="field-shell">
                              <span>Email</span>
                              <input
                                type="email"
                                value={newUser.email}
                                onChange={(event) =>
                                  setNewUser((current) => ({
                                    ...current,
                                    email: event.target.value
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="field-shell admin-inline-flag">
                              <span>Status</span>
                              <select
                                value={newUser.active ? "active" : "inactive"}
                                onChange={(event) =>
                                  setNewUser((current) => ({
                                    ...current,
                                    active: event.target.value === "active"
                                  }))
                                }
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Archived</option>
                              </select>
                            </label>
                          </div>
                          <div className="admin-inline-actions">
                            <button type="submit" className="button button--small" disabled={isPending}>
                              Save user
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button--small"
                              onClick={() => {
                                setShowAddUser(false);
                                setNewUser(emptyUserDraft());
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                  {filteredUsers.map((user) => (
                    <Fragment key={user.id}>
                      <tr>
                        <td>
                          <strong>{user.name}</strong>
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <span className={getStatusClass(user.active)}>
                            {user.active ? "Active" : "Archived"}
                          </span>
                        </td>
                        <td>{formatDate(user.updatedAt)}</td>
                        <td>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="button button-secondary button--small"
                              disabled={isPending}
                              onClick={() => startEditUser(user)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button--small"
                              disabled={isPending}
                              onClick={() =>
                                startTransition(async () => {
                                  try {
                                    await submitJson(
                                      `/api/admin/users/${user.id}`,
                                      "PATCH",
                                      { active: !user.active },
                                      user.active ? "User archived." : "User reactivated."
                                    );
                                  } catch (submitError) {
                                    showError(
                                      submitError instanceof Error
                                        ? submitError.message
                                        : "Unable to update user."
                                    );
                                  }
                                })
                              }
                            >
                              {user.active ? "Archive" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingUserId === user.id ? (
                        <tr className="admin-edit-row">
                          <td colSpan={5}>
                            <form
                              className="admin-inline-editor"
                              onSubmit={(event) => onUpdateUser(event, user.id)}
                            >
                              <div className="admin-inline-grid admin-inline-grid--user">
                                <label className="field-shell">
                                  <span>Name</span>
                                  <input
                                    value={editingUser.name}
                                    onChange={(event) =>
                                      setEditingUser((current) => ({
                                        ...current,
                                        name: event.target.value
                                      }))
                                    }
                                    required
                                  />
                                </label>
                                <label className="field-shell">
                                  <span>Email</span>
                                  <input
                                    type="email"
                                    value={editingUser.email}
                                    onChange={(event) =>
                                      setEditingUser((current) => ({
                                        ...current,
                                        email: event.target.value
                                      }))
                                    }
                                    required
                                  />
                                </label>
                                <label className="field-shell admin-inline-flag">
                                  <span>Status</span>
                                  <select
                                    value={editingUser.active ? "active" : "inactive"}
                                    onChange={(event) =>
                                      setEditingUser((current) => ({
                                        ...current,
                                        active: event.target.value === "active"
                                      }))
                                    }
                                  >
                                    <option value="active">Active</option>
                                    <option value="inactive">Archived</option>
                                  </select>
                                </label>
                              </div>
                              <div className="admin-inline-actions">
                                <button
                                  type="submit"
                                  className="button button--small"
                                  disabled={isPending}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="button button-ghost button--small"
                                  onClick={() => {
                                    setEditingUserId(null);
                                    setEditingUser(emptyUserDraft());
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "syndicates" ? (
          <section className="surface-card admin-pane">
            <div className="admin-pane__header">
              <div>
                <h2>Syndicates</h2>
                <p>{filteredSyndicates.length} results</p>
              </div>
              <div className="admin-pane__toolbar">
                <input
                  className="admin-filter-input"
                  value={syndicateSearch}
                  onChange={(event) => setSyndicateSearch(event.target.value)}
                  placeholder="Search syndicates"
                />
                <select
                  className="admin-filter-select"
                  value={syndicateFilter}
                  onChange={(event) => setSyndicateFilter(event.target.value as StatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Archived</option>
                </select>
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => {
                    setShowAddSyndicate((current) => !current);
                    setEditingSyndicateId(null);
                    setNewSyndicate(emptySyndicateDraft());
                  }}
                >
                  {showAddSyndicate ? "Close" : "Add syndicate"}
                </button>
              </div>
            </div>

            <div className="table-wrap admin-table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {showAddSyndicate ? (
                    <tr className="admin-edit-row">
                      <td colSpan={4}>
                        <form className="admin-inline-editor" onSubmit={onCreateSyndicate}>
                          <div className="admin-inline-grid admin-inline-grid--syndicate">
                            <label className="field-shell">
                              <span>Name</span>
                              <input
                                value={newSyndicate.name}
                                onChange={(event) =>
                                  setNewSyndicate((current) => ({
                                    ...current,
                                    name: event.target.value
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="field-shell admin-inline-flag">
                              <span>Status</span>
                              <select
                                value={newSyndicate.active ? "active" : "inactive"}
                                onChange={(event) =>
                                  setNewSyndicate((current) => ({
                                    ...current,
                                    active: event.target.value === "active"
                                  }))
                                }
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Archived</option>
                              </select>
                            </label>
                          </div>
                          <div className="admin-inline-actions">
                            <button type="submit" className="button button--small" disabled={isPending}>
                              Save syndicate
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button--small"
                              onClick={() => {
                                setShowAddSyndicate(false);
                                setNewSyndicate(emptySyndicateDraft());
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                  {filteredSyndicates.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr>
                        <td>
                          <div className="syndicate-name">
                            <span className="chip-dot" style={{ backgroundColor: entry.color }} />
                            <strong>{entry.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span className={getStatusClass(entry.active)}>
                            {entry.active ? "Active" : "Archived"}
                          </span>
                        </td>
                        <td>{formatDate(entry.updatedAt)}</td>
                        <td>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="button button-secondary button--small"
                              disabled={isPending}
                              onClick={() => startEditSyndicate(entry)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button--small"
                              disabled={isPending}
                              onClick={() =>
                                startTransition(async () => {
                                  try {
                                    await submitJson(
                                      `/api/admin/syndicates/${entry.id}`,
                                      "PATCH",
                                      { active: !entry.active },
                                      entry.active
                                        ? "Syndicate archived."
                                        : "Syndicate reactivated."
                                    );
                                  } catch (submitError) {
                                    showError(
                                      submitError instanceof Error
                                        ? submitError.message
                                        : "Unable to update syndicate."
                                    );
                                  }
                                })
                              }
                            >
                              {entry.active ? "Archive" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingSyndicateId === entry.id ? (
                        <tr className="admin-edit-row">
                          <td colSpan={4}>
                            <form
                              className="admin-inline-editor"
                              onSubmit={(event) => onUpdateSyndicate(event, entry.id)}
                            >
                              <div className="admin-inline-grid admin-inline-grid--syndicate">
                                <label className="field-shell">
                                  <span>Name</span>
                                  <input
                                    value={editingSyndicate.name}
                                    onChange={(event) =>
                                      setEditingSyndicate((current) => ({
                                        ...current,
                                        name: event.target.value
                                      }))
                                    }
                                    required
                                  />
                                </label>
                                <label className="field-shell admin-inline-flag">
                                  <span>Status</span>
                                  <select
                                    value={editingSyndicate.active ? "active" : "inactive"}
                                    onChange={(event) =>
                                      setEditingSyndicate((current) => ({
                                        ...current,
                                        active: event.target.value === "active"
                                      }))
                                    }
                                  >
                                    <option value="active">Active</option>
                                    <option value="inactive">Archived</option>
                                  </select>
                                </label>
                              </div>
                              <div className="admin-inline-actions">
                                <button
                                  type="submit"
                                  className="button button--small"
                                  disabled={isPending}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="button button-ghost button--small"
                                  onClick={() => {
                                    setEditingSyndicateId(null);
                                    setEditingSyndicate(emptySyndicateDraft());
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "data" ? (
          <section className="surface-card admin-pane">
            <div className="admin-pane__header">
              <div>
                <h2>Data Sources</h2>
                <p>{filteredSources.length} reusable sources</p>
              </div>
              <div className="admin-pane__toolbar">
                <input
                  className="admin-filter-input"
                  value={sourceSearch}
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder="Search data sources"
                />
                <select
                  className="admin-filter-select"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as StatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            {renderDataSourceSection("bracket", "Bracket", filteredBracketSources)}
            {renderDataSourceSection("analysis", "Analysis", filteredAnalysisSources)}
          </section>
        ) : null}

        {deleteTarget ? (
          <div className="confirm-modal-backdrop" role="presentation">
            <div
              className="surface-card confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-delete-session-title"
            >
              <div className="confirm-modal__content">
                <p className="eyebrow">Permanent delete</p>
                <h2 id="admin-delete-session-title">
                  Delete {deleteTarget.sessionName} permanently
                </h2>
                <p className="support-copy">
                  This permanently removes the session and all related records. Archive is the
                  safety gate; delete is irreversible.
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
                      setDeleteTarget(null);
                      setDeleteConfirmationName("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-danger button--small"
                    disabled={deleteConfirmationName !== deleteTarget.sessionName || isPending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await deleteSessionPermanently(
                            deleteTarget.sessionId,
                            deleteConfirmationName
                          );
                        } catch (submitError) {
                          showError(
                            submitError instanceof Error
                              ? submitError.message
                              : "Unable to delete session."
                          );
                        }
                      })
                    }
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
