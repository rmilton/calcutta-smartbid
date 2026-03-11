import Link from "next/link";

type SessionWorkspaceCurrent = "setup" | "live" | "analysis";

interface SessionWorkspaceNavProps {
  current: SessionWorkspaceCurrent;
  sessionId: string;
  showSetup?: boolean;
}

function getLinkClass(active: boolean) {
  return active ? "session-workspace-nav__link session-workspace-nav__link--active" : "session-workspace-nav__link";
}

export function SessionWorkspaceNav({
  current,
  sessionId,
  showSetup = false
}: SessionWorkspaceNavProps) {
  return (
    <nav aria-label="Session workspace" className="session-workspace-nav">
      {showSetup ? (
        <Link href={`/admin/sessions/${sessionId}`} className={getLinkClass(current === "setup")}>
          Setup &amp; data
        </Link>
      ) : null}
      <Link href={`/session/${sessionId}`} className={getLinkClass(current === "live")}>
        Live board
      </Link>
      <Link
        href={`/csv-analysis?sessionId=${sessionId}`}
        className={getLinkClass(current === "analysis")}
      >
        Analysis
      </Link>
    </nav>
  );
}
