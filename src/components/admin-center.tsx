import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { AdminSessionSummary } from "@/lib/types";

interface AdminCenterProps {
  sessions: AdminSessionSummary[];
  storageBackend: string;
  platformAdminEmail: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function AdminCenter({
  sessions,
  storageBackend,
  platformAdminEmail
}: AdminCenterProps) {
  return (
    <main className="landing-page">
      <header className="session-header">
        <div>
          <p className="eyebrow">Admin Center</p>
          <h1>Manage live auction rooms.</h1>
          <p className="session-subtitle">
            Platform admin <strong>{platformAdminEmail}</strong> can create sessions,
            review room status, and jump directly into active boards.
          </p>
        </div>
        <div className="session-badges">
          <span>Backend {storageBackend}</span>
          <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="top-grid">
        <article className="hero-card">
          <div className="hero-card__head">
            <div>
              <p className="eyebrow">Session control</p>
              <h2>Create and open live rooms</h2>
            </div>
          </div>
          <div className="hero-insights">
            <div>
              <span>Open sessions</span>
              <strong>{sessions.length}</strong>
            </div>
            <div>
              <span>Most recent update</span>
              <strong>{sessions[0] ? formatDate(sessions[0].updatedAt) : "--"}</strong>
            </div>
          </div>
          <div className="panel-actions" style={{ marginTop: "1rem" }}>
            <Link href="/admin/sessions/new" className="action-link">
              Create live session
            </Link>
          </div>
        </article>

        <article className="metrics-card">
          <p className="eyebrow">System status</p>
          <div className="metric-row">
            <span>Access model</span>
            <strong>Platform admin</strong>
          </div>
          <div className="metric-row">
            <span>Storage backend</span>
            <strong>{storageBackend}</strong>
          </div>
          <div className="metric-row">
            <span>Session creation</span>
            <strong>Admin only</strong>
          </div>
        </article>
      </section>

      <section className="setup-section">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Auction sessions</p>
              <h3>Live room directory</h3>
            </div>
            <div className="panel-actions">
              <Link href="/admin/sessions/new" className="action-link">
                New session
              </Link>
            </div>
          </div>

          {sessions.length === 0 ? (
            <p className="viewer-note" style={{ marginTop: "1rem" }}>
              No sessions created yet.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Updated</th>
                    <th>Provider</th>
                    <th>Purchases</th>
                    <th>Syndicates</th>
                    <th>Overrides</th>
                    <th>Access</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <strong>{session.name}</strong>
                        <div className="viewer-note">Created {formatDate(session.createdAt)}</div>
                      </td>
                      <td>{formatDate(session.updatedAt)}</td>
                      <td>{session.projectionProvider}</td>
                      <td>{session.purchaseCount}</td>
                      <td>{session.syndicateCount}</td>
                      <td>{session.overrideCount}</td>
                      <td>
                        {session.adminCount} admin / {session.viewerCount} viewer
                      </td>
                      <td>
                        <Link href={`/session/${session.id}`}>Open session</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
