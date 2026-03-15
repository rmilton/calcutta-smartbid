"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  DataSource,
  DataSourcePurpose,
  PlatformUser,
  PayoutRules,
  SyndicateCatalogEntry
} from "@/lib/types";
import { getDefaultPayoutRules } from "@/lib/sample-data";
import { titleCaseStage } from "@/lib/utils";

const defaults = getDefaultPayoutRules();
const payoutStages: Array<
  keyof Pick<PayoutRules, "roundOf64" | "roundOf32" | "sweet16" | "elite8" | "finalFour" | "champion">
> = ["roundOf64", "roundOf32", "sweet16", "elite8", "finalFour", "champion"];

interface SetupFormProps {
  platformUsers: PlatformUser[];
  syndicateCatalog: SyndicateCatalogEntry[];
  dataSources: DataSource[];
  mothershipSyndicateName: string;
}

type SourceSetupMode = "later" | "saved-source" | "upload";

interface UploadDraft {
  sourceName: string;
  fileName: string;
  csvContent: string;
}

function buildUploadDraft(sourceName: string): UploadDraft {
  return {
    sourceName,
    fileName: "",
    csvContent: ""
  };
}

export function SetupForm({
  platformUsers,
  syndicateCatalog,
  dataSources,
  mothershipSyndicateName
}: SetupFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("2026 March Madness Calcutta");
  const activeUsers = useMemo(
    () => platformUsers.filter((user) => user.active),
    [platformUsers]
  );
  const activeSyndicates = useMemo(
    () => syndicateCatalog.filter((entry) => entry.active),
    [syndicateCatalog]
  );
  const mothershipCatalogEntry = useMemo(
    () =>
      activeSyndicates.find(
        (entry) =>
          entry.name.trim().toLowerCase() === mothershipSyndicateName.trim().toLowerCase()
      ) ?? null,
    [activeSyndicates, mothershipSyndicateName]
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    activeUsers.slice(0, 1).map((user) => user.id)
  );
  const [userRoles, setUserRoles] = useState<Record<string, "admin" | "viewer">>(
    Object.fromEntries(activeUsers.slice(0, 1).map((user) => [user.id, "admin"]))
  );
  const [selectedSyndicateIds, setSelectedSyndicateIds] = useState<string[]>(
    Array.from(
      new Set(
        [mothershipCatalogEntry?.id, ...activeSyndicates.slice(0, 4).map((entry) => entry.id)].filter(
          Boolean
        )
      )
    ) as string[]
  );
  const [sharedAccessCode, setSharedAccessCode] = useState("march26");
  const [iterations, setIterations] = useState(4000);
  const activeBracketSources = useMemo(
    () => dataSources.filter((source) => source.active && source.purpose === "bracket"),
    [dataSources]
  );
  const activeAnalysisSources = useMemo(
    () => dataSources.filter((source) => source.active && source.purpose === "analysis"),
    [dataSources]
  );
  const [bracketMode, setBracketMode] = useState<SourceSetupMode>("later");
  const [analysisMode, setAnalysisMode] = useState<SourceSetupMode>("later");
  const [bracketSourceKey, setBracketSourceKey] = useState(
    activeBracketSources[0] ? `data-source:${activeBracketSources[0].id}` : ""
  );
  const [analysisSourceKey, setAnalysisSourceKey] = useState(
    activeAnalysisSources[0] ? `data-source:${activeAnalysisSources[0].id}` : ""
  );
  const [bracketUpload, setBracketUpload] = useState<UploadDraft>(
    buildUploadDraft("Official Bracket")
  );
  const [analysisUpload, setAnalysisUpload] = useState<UploadDraft>(
    buildUploadDraft("Team Analysis")
  );
  const [payoutRules, setPayoutRules] = useState<PayoutRules>(defaults);
  const mothershipSelected =
    mothershipCatalogEntry !== null && selectedSyndicateIds.includes(mothershipCatalogEntry.id);
  const totalPayoutPercent = useMemo(
    () => payoutStages.reduce((total, stage) => total + payoutRules[stage], 0),
    [payoutRules]
  );

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

  function onCsvFileSelect(
    file: File | null,
    setDraft: React.Dispatch<React.SetStateAction<UploadDraft>>
  ) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({
        ...current,
        fileName: file.name,
        csvContent: String(reader.result ?? "")
      }));
    };
    reader.readAsText(file);
  }

  function buildSourceSelection(
    mode: SourceSetupMode,
    sourceKey: string,
    upload: UploadDraft
  ) {
    if (mode === "saved-source" && sourceKey) {
      return {
        mode: "saved-source" as const,
        sourceKey
      };
    }

    if (mode === "upload" && upload.csvContent.trim()) {
      return {
        mode: "upload" as const,
        sourceName: upload.sourceName,
        fileName: upload.fileName || null,
        csvContent: upload.csvContent
      };
    }

    return undefined;
  }

  function renderSourceSection(
    purpose: DataSourcePurpose,
    title: string,
    mode: SourceSetupMode,
    setMode: React.Dispatch<React.SetStateAction<SourceSetupMode>>,
    sourceKey: string,
    setSourceKey: React.Dispatch<React.SetStateAction<string>>,
    upload: UploadDraft,
    setUpload: React.Dispatch<React.SetStateAction<UploadDraft>>,
    sources: DataSource[],
    placeholder: string
  ) {
    return (
      <section className="surface-card admin-form-section">
        <div className="admin-form-section__heading">
          <h2>{title}</h2>
          <span className="status-pill">
            {mode === "later" ? "Add later" : mode === "saved-source" ? "Saved source" : "Upload"}
          </span>
        </div>
        <div className="compact-field-grid compact-field-grid--three">
          <label className="field-shell">
            <span>Setup mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as SourceSetupMode)}
            >
              <option value="later">Add later</option>
              <option value="saved-source">Saved source</option>
              <option value="upload">Upload new file</option>
            </select>
          </label>
          {mode === "saved-source" ? (
            <label className="field-shell">
              <span>{title} source</span>
              <select value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>
                <option value="">Select a source</option>
                {sources.map((source) => (
                  <option key={source.id} value={`data-source:${source.id}`}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {mode === "upload" ? (
            <>
              <label className="field-shell">
                <span>Source label</span>
                <input
                  value={upload.sourceName}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      sourceName: event.target.value
                    }))
                  }
                  required={mode === "upload"}
                />
              </label>
              <label className="field-shell">
                <span>CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => onCsvFileSelect(event.target.files?.[0] ?? null, setUpload)}
                />
              </label>
              <label className="field-shell admin-inline-span">
                <span>CSV content</span>
                <textarea
                  rows={6}
                  value={upload.csvContent}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      csvContent: event.target.value
                    }))
                  }
                  placeholder={placeholder}
                  required={mode === "upload"}
                />
              </label>
            </>
          ) : null}
          {mode === "saved-source" && sources.length === 0 ? (
            <p className="support-copy">No active {purpose} sources are available yet.</p>
          ) : null}
        </div>
      </section>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const accessAssignments = selectedUserIds.map((platformUserId) => ({
      platformUserId,
      role: userRoles[platformUserId] ?? "viewer"
    }));

    startTransition(async () => {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: sessionName,
          sharedAccessCode,
          accessAssignments,
          catalogSyndicateIds: selectedSyndicateIds,
          bracketSelection: buildSourceSelection(bracketMode, bracketSourceKey, bracketUpload),
          analysisSelection: buildSourceSelection(analysisMode, analysisSourceKey, analysisUpload),
          simulationIterations: iterations,
          payoutRules
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to create auction session.");
        return;
      }

      const payload = (await response.json()) as { sessionId: string };
      router.push(`/admin/sessions/${payload.sessionId}`);
    });
  }

  return (
    <form id="new-session-form" className="admin-form-layout" onSubmit={onSubmit}>
      <header className="surface-card admin-form-header">
        <div className="admin-form-header__copy">
          <p className="eyebrow">mothership smartbid™</p>
          <h1>New session</h1>
        </div>
        <div className="admin-form-header__actions">
          <Link href="/admin" className="button button-secondary button--small">
            Back
          </Link>
          <button type="submit" className="button button--small" disabled={isPending}>
            {isPending ? "Creating..." : "Create session"}
          </button>
        </div>
      </header>

      <section className="surface-card admin-form-section">
        <div className="admin-form-section__heading">
          <h2>Session</h2>
        </div>
        <div className="compact-field-grid compact-field-grid--three">
          <label className="field-shell">
            <span>Name</span>
            <input
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              required
            />
          </label>
          <label className="field-shell">
            <span>Shared code</span>
            <input
              value={sharedAccessCode}
              onChange={(event) => setSharedAccessCode(event.target.value)}
              required
            />
          </label>
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
          <label className="field-shell">
            <span>Iterations</span>
            <input
              type="number"
              min={1000}
              max={50000}
              step={500}
              value={iterations}
              onChange={(event) => setIterations(Number(event.target.value))}
              required
            />
          </label>
        </div>
      </section>

      {renderSourceSection(
        "bracket",
        "Bracket data",
        bracketMode,
        setBracketMode,
        bracketSourceKey,
        setBracketSourceKey,
        bracketUpload,
        setBracketUpload,
        activeBracketSources,
        "Required: name, region, seed. Optional: id, shortName, regionSlot, site, subregion, isPlayIn, playInGroup, playInSeed."
      )}

      {renderSourceSection(
        "analysis",
        "Analysis data",
        analysisMode,
        setAnalysisMode,
        analysisSourceKey,
        setAnalysisSourceKey,
        analysisUpload,
        setAnalysisUpload,
        activeAnalysisSources,
        "Required: name, rating, offense, defense, tempo. Optional: teamId, shortName, NET Rank, KenPom Rank, Ranked Wins, 3PT%, Q1-Q4 wins."
      )}

      <section className="surface-card admin-form-section">
        <div className="admin-form-section__heading">
          <h2>Tracked syndicates</h2>
          <span className="status-pill">
            {selectedSyndicateIds.length} selected
          </span>
        </div>
        {mothershipCatalogEntry ? (
          <p className={mothershipSelected ? "support-copy" : "error-text"}>
            {mothershipSelected
              ? `${mothershipSyndicateName} is locked as the room perspective.`
              : `${mothershipSyndicateName} must be included in the room.`}
          </p>
        ) : (
          <p className="error-text">
            {mothershipSyndicateName} is missing from the syndicate catalog.
          </p>
        )}
        <div className="table-wrap admin-table-wrap">
          <table className="admin-table admin-table--dense">
            <thead>
              <tr>
                <th>Use</th>
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
      </section>

      <section className="surface-card admin-form-section">
        <div className="admin-form-section__heading">
          <h2>Payouts</h2>
          <span className="status-pill">{totalPayoutPercent.toFixed(1)}%</span>
        </div>
        <div className="compact-payout-grid">
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
        <p className="support-copy">
          Total payout: {totalPayoutPercent.toFixed(1)}%
        </p>
      </section>

      <section className="surface-card admin-form-section">
        <div className="admin-form-section__heading">
          <h2>Access</h2>
          <span className="status-pill">
            {selectedUserIds.length} selected
          </span>
        </div>
        {activeUsers.length === 0 ? (
          <p className="empty-copy">No active users</p>
        ) : (
          <div className="table-wrap admin-table-wrap">
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
                {activeUsers.map((user) => {
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
        )}
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="surface-card admin-sticky-actions">
        <div className="admin-sticky-actions__meta">
          <span>{selectedUserIds.length} users</span>
          <span>{selectedSyndicateIds.length} syndicates</span>
          <span>{payoutRules.projectedPot.toLocaleString()} projected pot</span>
        </div>
        <div className="button-row">
          <Link href="/admin" className="button button-secondary button--small">
            Back
          </Link>
          <button type="submit" className="button button--small" disabled={isPending}>
            {isPending ? "Creating..." : "Create session"}
          </button>
        </div>
      </div>
    </form>
  );
}
