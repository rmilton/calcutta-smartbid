"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { LogoutButton } from "@/components/logout-button";
import { AdminCenterData, DataSource, PlatformUser, SyndicateCatalogEntry } from "@/lib/types";

type AdminTab = "sessions" | "users" | "syndicates" | "data";
type StatusFilter = "all" | "active" | "inactive";

interface AdminCenterProps {
  initialData: AdminCenterData;
  storageBackend: string;
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
  kind: "csv" | "api";
  csvContent: string;
  fileName: string;
  url: string;
  bearerToken: string;
  active: boolean;
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

const emptySourceDraft = (): SourceDraft => ({
  name: "",
  kind: "csv",
  csvContent: "",
  fileName: "",
  url: "",
  bearerToken: "",
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
  if (source.kind === "csv") {
    const config = source.config as { csvContent: string; fileName: string | null };
    return {
      name: source.name,
      kind: "csv",
      csvContent: config.csvContent,
      fileName: config.fileName ?? "",
      url: "",
      bearerToken: "",
      active: source.active
    };
  }

  const config = source.config as { url: string; bearerToken?: string };
  return {
    name: source.name,
    kind: "api",
    csvContent: "",
    fileName: "",
    url: config.url,
    bearerToken: config.bearerToken ?? "",
    active: source.active
  };
}

export function AdminCenter({
  initialData,
  storageBackend,
  platformAdminEmail
}: AdminCenterProps) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<AdminTab>("sessions");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sessionSearch, setSessionSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<StatusFilter>("all");
  const [syndicateSearch, setSyndicateSearch] = useState("");
  const [syndicateFilter, setSyndicateFilter] = useState<StatusFilter>("all");
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<StatusFilter>("all");

  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddSyndicate, setShowAddSyndicate] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);

  const [newUser, setNewUser] = useState<UserDraft>(emptyUserDraft);
  const [newSyndicate, setNewSyndicate] = useState<SyndicateDraft>(emptySyndicateDraft);
  const [newSource, setNewSource] = useState<SourceDraft>(emptySourceDraft);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserDraft>(emptyUserDraft);
  const [editingSyndicateId, setEditingSyndicateId] = useState<string | null>(null);
  const [editingSyndicate, setEditingSyndicate] = useState<SyndicateDraft>(emptySyndicateDraft);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<SourceDraft>(emptySourceDraft);

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    if (!query) {
      return data.sessions;
    }

    return data.sessions.filter((session) =>
      [session.name, session.activeDataSourceName, session.projectionProvider]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [data.sessions, sessionSearch]);

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
      [source.name, source.kind].join(" ").toLowerCase().includes(query)
    );
  }, [data.dataSources, sourceFilter, sourceSearch]);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function refreshData() {
    const response = await fetch("/api/admin/center", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to refresh admin center.");
    }

    const payload = (await response.json()) as AdminCenterData;
    setData(payload);
  }

  async function submitJson(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string
  ) {
    resetMessages();
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
    setNotice(successMessage);
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
  }

  function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson("/api/admin/users", "POST", newUser, "User created.");
        setNewUser(emptyUserDraft());
        setShowAddUser(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to create user.");
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
        setError(submitError instanceof Error ? submitError.message : "Unable to update user.");
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
        setError(
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
        setError(
          submitError instanceof Error ? submitError.message : "Unable to update syndicate."
        );
      }
    });
  }

  function getSourcePayload(draft: SourceDraft) {
    return draft.kind === "csv"
      ? {
          name: draft.name,
          kind: "csv" as const,
          active: draft.active,
          csvContent: draft.csvContent,
          fileName: draft.fileName || null
        }
      : {
          name: draft.name,
          kind: "api" as const,
          active: draft.active,
          url: draft.url,
          bearerToken: draft.bearerToken
        };
  }

  function getSourceUpdatePayload(draft: SourceDraft) {
    return draft.kind === "csv"
      ? {
          name: draft.name,
          active: draft.active,
          csvContent: draft.csvContent,
          fileName: draft.fileName || null
        }
      : {
          name: draft.name,
          active: draft.active,
          url: draft.url,
          bearerToken: draft.bearerToken
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
        setNewSource(emptySourceDraft());
        setShowAddSource(false);
      } catch (submitError) {
        setError(
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
        setError(
          submitError instanceof Error ? submitError.message : "Unable to update data source."
        );
      }
    });
  }

  function onTestSource(sourceId: string) {
    startTransition(async () => {
      try {
        resetMessages();
        const response = await fetch(`/api/admin/data-sources/${sourceId}/test`, {
          method: "POST"
        });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to test data source.");
        }

        await refreshData();
        setNotice("Data source test succeeded.");
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to test data source."
        );
      }
    });
  }

  return (
    <main className="admin-page">
      <section className="admin-shell admin-shell--dense">
        <header className="surface-card admin-topbar">
          <div className="admin-topbar__title">
            <p className="eyebrow">Admin</p>
            <h1>Admin center</h1>
          </div>
          <div className="admin-topbar__meta">
            <span className="status-pill">{platformAdminEmail}</span>
            <span className="status-pill">Backend {storageBackend}</span>
            <span className="status-pill">
              {data.sessions.length} session{data.sessions.length === 1 ? "" : "s"}
            </span>
            <Link href="/admin/sessions/new" className="button button--small">
              New session
            </Link>
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
              </div>
            </div>

            <div className="table-wrap admin-table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Updated</th>
                    <th>Source</th>
                    <th>Purchases</th>
                    <th>Syndicates</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <strong>{session.name}</strong>
                        <div className="support-copy">Created {formatDate(session.createdAt)}</div>
                      </td>
                      <td>{formatDate(session.updatedAt)}</td>
                      <td>{session.activeDataSourceName}</td>
                      <td>{session.purchaseCount}</td>
                      <td>{session.syndicateCount}</td>
                      <td>{formatSessionAccess(session.adminCount, session.viewerCount)}</td>
                      <td>
                        <div className="admin-table-actions">
                          <Link
                            href={`/admin/sessions/${session.id}`}
                            className="button button-secondary button--small"
                          >
                            Manage
                          </Link>
                          <Link
                            href={`/session/${session.id}`}
                            className="button button-ghost button--small"
                          >
                            Board
                          </Link>
                          <Link
                            href={`/session/${session.id}?view=analysis`}
                            className="button button-ghost button--small"
                          >
                            Analysis
                          </Link>
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
                    <>
                      <tr key={user.id}>
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
                                    setError(
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
                    </>
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
                    <>
                      <tr key={entry.id}>
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
                                    setError(
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
                    </>
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
                <p>{filteredSources.length + 1} available</p>
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
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => {
                    setShowAddSource((current) => !current);
                    setEditingSourceId(null);
                    setNewSource(emptySourceDraft());
                  }}
                >
                  {showAddSource ? "Close" : "Add source"}
                </button>
              </div>
            </div>

            <div className="table-wrap admin-table-wrap">
              <table className="admin-table admin-table--dense">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Last tested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {showAddSource ? (
                    <tr className="admin-edit-row">
                      <td colSpan={5}>
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
                              <span>Kind</span>
                              <select
                                value={newSource.kind}
                                onChange={(event) =>
                                  setNewSource((current) => ({
                                    ...current,
                                    kind: event.target.value as "csv" | "api"
                                  }))
                                }
                              >
                                <option value="csv">CSV</option>
                                <option value="api">API</option>
                              </select>
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
                            {newSource.kind === "csv" ? (
                              <>
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
                              </>
                            ) : (
                              <>
                                <label className="field-shell">
                                  <span>Provider URL</span>
                                  <input
                                    type="url"
                                    value={newSource.url}
                                    onChange={(event) =>
                                      setNewSource((current) => ({
                                        ...current,
                                        url: event.target.value
                                      }))
                                    }
                                    required
                                  />
                                </label>
                                <label className="field-shell">
                                  <span>Bearer token</span>
                                  <input
                                    value={newSource.bearerToken}
                                    onChange={(event) =>
                                      setNewSource((current) => ({
                                        ...current,
                                        bearerToken: event.target.value
                                      }))
                                    }
                                  />
                                </label>
                              </>
                            )}
                          </div>
                          <div className="admin-inline-actions">
                            <button type="submit" className="button button--small" disabled={isPending}>
                              Save source
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button--small"
                              onClick={() => {
                                setShowAddSource(false);
                                setNewSource(emptySourceDraft());
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>
                      <strong>Built-in Mock Field</strong>
                    </td>
                    <td>BUILTIN</td>
                    <td>
                      <span className="status-pill status-pill--positive">Active</span>
                    </td>
                    <td>--</td>
                    <td>Always available</td>
                  </tr>
                  {filteredSources.map((source) => (
                    <>
                      <tr key={source.id}>
                        <td>
                          <strong>{source.name}</strong>
                        </td>
                        <td>{source.kind.toUpperCase()}</td>
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
                                      source.active
                                        ? "Data source disabled."
                                        : "Data source enabled."
                                    );
                                  } catch (submitError) {
                                    setError(
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
                          <td colSpan={5}>
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
                                  <span>Kind</span>
                                  <input value={editingSource.kind.toUpperCase()} readOnly />
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
                                {editingSource.kind === "csv" ? (
                                  <>
                                    <label className="field-shell">
                                      <span>CSV file</span>
                                      <input
                                        type="file"
                                        accept=".csv,text/csv"
                                        onChange={(event) =>
                                          onCsvFileSelect(
                                            event.target.files?.[0] ?? null,
                                            setEditingSource
                                          )
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
                                  </>
                                ) : (
                                  <>
                                    <label className="field-shell">
                                      <span>Provider URL</span>
                                      <input
                                        type="url"
                                        value={editingSource.url}
                                        onChange={(event) =>
                                          setEditingSource((current) => ({
                                            ...current,
                                            url: event.target.value
                                          }))
                                        }
                                        required
                                      />
                                    </label>
                                    <label className="field-shell">
                                      <span>Bearer token</span>
                                      <input
                                        value={editingSource.bearerToken}
                                        onChange={(event) =>
                                          setEditingSource((current) => ({
                                            ...current,
                                            bearerToken: event.target.value
                                          }))
                                        }
                                      />
                                    </label>
                                  </>
                                )}
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
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
