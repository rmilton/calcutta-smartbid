"use client";

import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { LogoutButton } from "@/components/logout-button";
import { AdminCenterData, DataSource, PlatformUser, SyndicateCatalogEntry } from "@/lib/types";

interface AdminCenterProps {
  initialData: AdminCenterData;
  storageBackend: string;
  platformAdminEmail: string;
}

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

export function AdminCenter({
  initialData,
  storageBackend,
  platformAdminEmail
}: AdminCenterProps) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<"overview" | "users" | "syndicates" | "data">("overview");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    active: true
  });
  const [newSyndicate, setNewSyndicate] = useState({
    name: "",
    color: "#0a7ea4",
    active: true
  });
  const [newSource, setNewSource] = useState<{
    name: string;
    kind: "csv" | "api";
    csvContent: string;
    fileName: string;
    url: string;
    bearerToken: string;
    active: boolean;
  }>({
    name: "",
    kind: "csv",
    csvContent: "",
    fileName: "",
    url: "",
    bearerToken: "",
    active: true
  });

  const activeUserCount = useMemo(
    () => data.platformUsers.filter((user) => user.active).length,
    [data.platformUsers]
  );
  const activeSyndicateCount = useMemo(
    () => data.syndicateCatalog.filter((entry) => entry.active).length,
    [data.syndicateCatalog]
  );
  const activeDataSourceCount = useMemo(
    () => data.dataSources.filter((source) => source.active).length + 1,
    [data.dataSources]
  );
  const firstSessionId = data.sessions[0]?.id ?? null;

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
    body: Record<string, unknown>,
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

  function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson("/api/admin/users", "POST", newUser, "User created.");
        setNewUser({
          name: "",
          email: "",
          active: true
        });
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to create user.");
      }
    });
  }

  function onCreateSyndicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson("/api/admin/syndicates", "POST", newSyndicate, "Syndicate created.");
        setNewSyndicate({
          name: "",
          color: "#0a7ea4",
          active: true
        });
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to create syndicate."
        );
      }
    });
  }

  function onCreateDataSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          "/api/admin/data-sources",
          "POST",
          {
            name: newSource.name,
            kind: newSource.kind,
            active: newSource.active,
            ...(newSource.kind === "csv"
              ? {
                  csvContent: newSource.csvContent,
                  fileName: newSource.fileName || null
                }
              : {
                  url: newSource.url,
                  bearerToken: newSource.bearerToken
                })
          },
          "Data source created."
        );
        setNewSource({
          name: "",
          kind: "csv",
          csvContent: "",
          fileName: "",
          url: "",
          bearerToken: "",
          active: true
        });
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Unable to create data source."
        );
      }
    });
  }

  function onCsvFileSelect(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setNewSource((current) => ({
        ...current,
        csvContent: String(reader.result ?? ""),
        fileName: file.name
      }));
    };
    reader.readAsText(file);
  }

  function renderUserRow(user: PlatformUser) {
    return (
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
          <button
            type="button"
            className="button button-secondary button--small"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await submitJson(
                    `/api/admin/users/${user.id}`,
                    "PATCH",
                    {
                      active: !user.active
                    },
                    user.active ? "User archived." : "User reactivated."
                  );
                } catch (submitError) {
                  setError(
                    submitError instanceof Error ? submitError.message : "Unable to update user."
                  );
                }
              })
            }
          >
            {user.active ? "Archive" : "Reactivate"}
          </button>
        </td>
      </tr>
    );
  }

  function renderSyndicateRow(entry: SyndicateCatalogEntry) {
    return (
      <tr key={entry.id}>
        <td>
          <div className="syndicate-name">
            <span className="chip-dot" style={{ backgroundColor: entry.color }} />
            <strong>{entry.name}</strong>
          </div>
        </td>
        <td>{entry.color}</td>
        <td>
          <span className={getStatusClass(entry.active)}>
            {entry.active ? "Active" : "Archived"}
          </span>
        </td>
        <td>{formatDate(entry.updatedAt)}</td>
        <td>
          <button
            type="button"
            className="button button-secondary button--small"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await submitJson(
                    `/api/admin/syndicates/${entry.id}`,
                    "PATCH",
                    {
                      active: !entry.active
                    },
                    entry.active ? "Syndicate archived." : "Syndicate reactivated."
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
        </td>
      </tr>
    );
  }

  function renderDataSourceRow(source: DataSource) {
    return (
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
          <div className="button-row">
            <button
              type="button"
              className="button button-secondary button--small"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    resetMessages();
                    const response = await fetch(`/api/admin/data-sources/${source.id}/test`, {
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
                      submitError instanceof Error
                        ? submitError.message
                        : "Unable to test data source."
                    );
                  }
                })
              }
            >
              Test
            </button>
            <button
              type="button"
              className="button button-secondary button--small"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await submitJson(
                      `/api/admin/data-sources/${source.id}`,
                      "PATCH",
                      {
                        active: !source.active
                      },
                      source.active ? "Data source disabled." : "Data source enabled."
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
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <Breadcrumbs items={[{ label: "Platform", href: "/admin" }, { label: "Sessions" }]} />
        <header className="surface-card session-hero">
          <div className="session-hero__copy">
            <p className="eyebrow">Platform admin workspace</p>
            <h1>Sessions is the control plane. Everything else supports room readiness.</h1>
            <p>
              Signed in as <strong>{platformAdminEmail}</strong>. Create rooms, complete readiness,
              and then launch operators, viewer previews, and analysis from one place.
            </p>
          </div>
          <div className="session-hero__meta">
            <span className="status-pill">Backend {storageBackend}</span>
            <span className="status-pill">
              {data.sessions.length} session{data.sessions.length === 1 ? "" : "s"}
            </span>
            <Link href="/admin/sessions/new" className="button">
              Create session
            </Link>
            {firstSessionId ? (
              <Link
                href={`/csv-analysis?sessionId=${firstSessionId}`}
                className="button button-secondary"
              >
                CSV analysis
              </Link>
            ) : null}
            <LogoutButton />
          </div>
        </header>

        <section className="admin-summary-grid">
          <article className="surface-card admin-summary-card">
            <span>Live rooms</span>
            <strong>{data.sessions.length}</strong>
            <p>Active auction sessions configured on the platform.</p>
          </article>
          <article className="surface-card admin-summary-card">
            <span>Directory users</span>
            <strong>{activeUserCount}</strong>
            <p>Active platform accounts available for session assignment.</p>
          </article>
          <article className="surface-card admin-summary-card">
            <span>Reusable syndicates</span>
            <strong>{activeSyndicateCount}</strong>
            <p>Shared syndicate catalog entries ready for new rooms.</p>
          </article>
          <article className="surface-card admin-summary-card">
            <span>Projection feeds</span>
            <strong>{activeDataSourceCount}</strong>
            <p>Built-in and external data sources available to operators.</p>
          </article>
        </section>

        {notice ? <p className="notice-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="workspace-frame">
          <aside className="surface-card workspace-sidebar">
            <p className="eyebrow">Navigate workspace</p>
            <div className="workspace-nav">
              {[
                ["overview", "Sessions", `${data.sessions.length}`],
                ["users", "Directory", `${activeUserCount}`],
                ["syndicates", "Syndicates", `${activeSyndicateCount}`],
                ["data", "Data sources", `${activeDataSourceCount}`]
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={
                    tab === key
                      ? "workspace-nav__item workspace-nav__item--active"
                      : "workspace-nav__item"
                  }
                  onClick={() => setTab(key as typeof tab)}
                >
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
            <div className="workspace-sidebar__note">
              <strong>Recommended flow</strong>
              <p>Create the room, finish readiness, then launch operator, viewer, and analysis tools.</p>
            </div>
          </aside>

          <div className="stack-layout">
            {tab === "overview" ? (
              <section className="stack-layout">
                <article className="surface-card">
                  <div className="section-headline">
                    <div>
                      <p className="eyebrow">Primary workflow</p>
                      <h3>Move through room readiness in order</h3>
                      <p>Sessions stay primary. Directory, syndicates, and data sources exist to support launch readiness.</p>
                    </div>
                  </div>
                  <div className="workflow-grid">
                    <div className="workflow-card">
                      <span>1</span>
                      <strong>Create the room</strong>
                      <p>Start in Sessions, then continue directly into readiness.</p>
                    </div>
                    <div className="workflow-card">
                      <span>2</span>
                      <strong>Finish readiness</strong>
                      <p>Assign operators and viewers, confirm room code, syndicates, economics, and imports.</p>
                    </div>
                    <div className="workflow-card">
                      <span>3</span>
                      <strong>Launch tools</strong>
                      <p>Open operator board, viewer preview, and session analysis from the room workspace.</p>
                    </div>
                  </div>
                </article>

                <article className="surface-card">
              <div className="section-headline">
                <div>
                  <p className="eyebrow">Sessions</p>
                  <h3>Room directory and launch points</h3>
                  <p>Track session health, readiness context, and the handoff into operator, viewer, and analysis surfaces.</p>
                </div>
                <span className="status-pill">{data.sessions.length} configured</span>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Updated</th>
                      <th>Source</th>
                      <th>Purchases</th>
                      <th>Syndicates</th>
                      <th>Access</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <strong>{session.name}</strong>
                          <div className="support-copy">
                            Created {formatDate(session.createdAt)}
                          </div>
                        </td>
                        <td>{formatDate(session.updatedAt)}</td>
                        <td>{session.activeDataSourceName}</td>
                        <td>{session.purchaseCount}</td>
                        <td>{session.syndicateCount}</td>
                        <td>
                          {session.adminCount} operator / {session.viewerCount} viewer
                        </td>
                        <td>
                          <div className="button-row">
                            <Link
                              href={`/admin/sessions/${session.id}`}
                              className="button button-secondary button--small"
                            >
                              Setup &amp; data
                            </Link>
                            <Link
                              href={`/session/${session.id}`}
                              className="button button-ghost button--small"
                            >
                              Operator board
                            </Link>
                            <Link
                              href={`/session/${session.id}?preview=viewer`}
                              className="button button-ghost button--small"
                            >
                              Viewer preview
                            </Link>
                            <Link
                              href={`/csv-analysis?sessionId=${session.id}`}
                              className="button button-secondary button--small"
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
                </article>
              </section>
            ) : null}

            {tab === "users" ? (
              <section className="admin-grid">
                <article className="surface-card">
              <div className="section-headline">
                <div>
                  <p className="eyebrow">Directory</p>
                  <h3>Operators and viewers</h3>
                  <p>Maintain the people who can be assigned into rooms before launch.</p>
                </div>
                <span className="status-pill">{activeUserCount} active</span>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{data.platformUsers.map(renderUserRow)}</tbody>
                </table>
              </div>
                </article>

                <article className="surface-card form-section">
              <div className="form-section__header">
                <p className="eyebrow">Create User</p>
                <h3>Add platform directory user</h3>
                <p>Create reusable operator or viewer identities for future sessions.</p>
              </div>
              <form className="setup-shell" onSubmit={onCreateUser}>
                <label className="field-shell">
                  <span>Name</span>
                  <input
                    value={newUser.name}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, name: event.target.value }))
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
                      setNewUser((current) => ({ ...current, email: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={newUser.active}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, active: event.target.checked }))
                    }
                  />
                  <div>
                    <strong>Active account</strong>
                    <span>User can be assigned immediately to live sessions.</span>
                  </div>
                </label>
                <div className="button-row">
                  <button type="submit" className="button" disabled={isPending}>
                    {isPending ? "Saving..." : "Create user"}
                  </button>
                </div>
              </form>
                </article>
              </section>
            ) : null}

            {tab === "syndicates" ? (
              <section className="admin-grid">
                <article className="surface-card">
              <div className="section-headline">
                <div>
                  <p className="eyebrow">Catalog</p>
                  <h3>Reusable syndicates</h3>
                  <p>Maintain the syndicate roster shared across live auction sessions.</p>
                </div>
                <span className="status-pill">{activeSyndicateCount} active</span>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Color</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{data.syndicateCatalog.map(renderSyndicateRow)}</tbody>
                </table>
              </div>
                </article>

                <article className="surface-card form-section">
              <div className="form-section__header">
                <p className="eyebrow">Create Syndicate</p>
                <h3>Add catalog entry</h3>
                <p>Use shared catalog entries so session setup stays fast and consistent.</p>
              </div>
              <form className="setup-shell" onSubmit={onCreateSyndicate}>
                <label className="field-shell">
                  <span>Name</span>
                  <input
                    value={newSyndicate.name}
                    onChange={(event) =>
                      setNewSyndicate((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="field-shell">
                  <span>Color</span>
                  <input
                    value={newSyndicate.color}
                    onChange={(event) =>
                      setNewSyndicate((current) => ({ ...current, color: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={newSyndicate.active}
                    onChange={(event) =>
                      setNewSyndicate((current) => ({
                        ...current,
                        active: event.target.checked
                      }))
                    }
                  />
                  <div>
                    <strong>Active syndicate</strong>
                    <span>Available immediately during new-session setup.</span>
                  </div>
                </label>
                <div className="button-row">
                  <button type="submit" className="button" disabled={isPending}>
                    {isPending ? "Saving..." : "Create syndicate"}
                  </button>
                </div>
              </form>
                </article>
              </section>
            ) : null}

            {tab === "data" ? (
              <section className="admin-grid">
                <article className="surface-card">
              <div className="section-headline">
                <div>
                  <p className="eyebrow">Data Sources</p>
                  <h3>CSV uploads and API connectors</h3>
                  <p>Keep sources healthy so rooms can import projections and analysis inputs without friction.</p>
                </div>
                <span className="status-pill">{activeDataSourceCount} available</span>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Kind</th>
                      <th>Status</th>
                      <th>Last tested</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
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
                    {data.dataSources.map(renderDataSourceRow)}
                  </tbody>
                </table>
              </div>
                </article>

                <article className="surface-card form-section">
              <div className="form-section__header">
                <p className="eyebrow">Create Source</p>
                <h3>Add CSV or API connection</h3>
                <p>Register a feed once, then reuse it across all auction rooms.</p>
              </div>
              <form className="setup-shell" onSubmit={onCreateDataSource}>
                <label className="field-shell">
                  <span>Name</span>
                  <input
                    value={newSource.name}
                    onChange={(event) =>
                      setNewSource((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="field-shell">
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
                {newSource.kind === "csv" ? (
                  <>
                    <label className="field-shell">
                      <span>CSV file</span>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => onCsvFileSelect(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <label className="field-shell">
                      <span>CSV content</span>
                      <textarea
                        rows={8}
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
                          setNewSource((current) => ({ ...current, url: event.target.value }))
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
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={newSource.active}
                    onChange={(event) =>
                      setNewSource((current) => ({ ...current, active: event.target.checked }))
                    }
                  />
                  <div>
                    <strong>Active source</strong>
                    <span>Make the feed selectable for room setup and analysis immediately.</span>
                  </div>
                </label>
                <div className="button-row">
                  <button type="submit" className="button" disabled={isPending}>
                    {isPending ? "Saving..." : "Create source"}
                  </button>
                </div>
              </form>
                </article>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
