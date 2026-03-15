"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { accessImportSampleCsv } from "@/lib/access-import";
import { deriveMothershipFundingSnapshot } from "@/lib/funding";
import { useFeedbackMessage } from "@/lib/hooks/use-feedback-message";
import {
  BudgetConfidence,
  MothershipFundingModel,
  PayoutRules,
  SessionAdminConfig,
  Syndicate
} from "@/lib/types";
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

interface SyndicateFundingDraft {
  estimatedBudgetInput: string;
  budgetConfidence: BudgetConfidence;
  budgetNotes: string;
}

interface ImportDraft {
  sourceName: string;
  fileName: string;
  csvContent: string;
}

const confidenceOptions: BudgetConfidence[] = ["low", "medium", "high"];

function buildImportDraft(
  sourceName: string,
  imported?: { sourceName: string; fileName: string | null } | null
): ImportDraft {
  return {
    sourceName: imported?.sourceName ?? sourceName,
    fileName: imported?.fileName ?? "",
    csvContent: ""
  };
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

function buildSyndicateFundingPayload(
  selectedSyndicateIds: string[],
  syndicateFundingDrafts: Record<string, SyndicateFundingDraft>
) {
  return selectedSyndicateIds.map((catalogEntryId) => {
    const draft = syndicateFundingDrafts[catalogEntryId];

    if (!draft) {
      return {
        catalogEntryId,
        budgetConfidence: "medium" as const,
        budgetNotes: ""
      };
    }

    return {
      catalogEntryId,
      estimatedBudget: parseDollarInput(draft.estimatedBudgetInput),
      budgetConfidence: draft.budgetConfidence,
      budgetNotes: draft.budgetNotes
    };
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function buildSyndicateFundingDrafts(syndicates: Syndicate[]) {
  return Object.fromEntries(
    syndicates
      .filter((syndicate) => syndicate.catalogEntryId)
      .map((syndicate) => [
        syndicate.catalogEntryId as string,
        {
          estimatedBudgetInput: formatDollarInput(syndicate.estimatedBudget),
          budgetConfidence: syndicate.budgetConfidence,
          budgetNotes: syndicate.budgetNotes
        } satisfies SyndicateFundingDraft
      ])
  );
}

export function SessionAdminCenter({
  initialConfig,
  mothershipSyndicateName
}: SessionAdminCenterProps) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [isPending, startTransition] = useTransition();
  const { error, notice, clearFeedback, showError, showNotice } = useFeedbackMessage();
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
  const [mothershipFunding, setMothershipFunding] = useState<MothershipFundingModel>(
    initialConfig.session.mothershipFunding
  );
  const [syndicateFundingDrafts, setSyndicateFundingDrafts] = useState<
    Record<string, SyndicateFundingDraft>
  >(buildSyndicateFundingDrafts(initialConfig.session.syndicates));
  const [sourceKey, setSourceKey] = useState(initialConfig.session.activeDataSource.key);
  const [payoutRules, setPayoutRules] = useState(initialConfig.session.payoutRules);
  const [projectedPotInput, setProjectedPotInput] = useState(
    formatDollarInput(initialConfig.session.payoutRules.projectedPot)
  );
  const [analysisSettings, setAnalysisSettings] = useState(
    initialConfig.session.analysisSettings
  );
  const accessCsvInputRef = useRef<HTMLInputElement | null>(null);
  const bracketCsvInputRef = useRef<HTMLInputElement | null>(null);
  const analysisCsvInputRef = useRef<HTMLInputElement | null>(null);
  const [bracketImportDraft, setBracketImportDraft] = useState<ImportDraft>(
    buildImportDraft("Official Bracket", initialConfig.session.bracketImport)
  );
  const [analysisImportDraft, setAnalysisImportDraft] = useState<ImportDraft>(
    buildImportDraft("Team Analysis", initialConfig.session.analysisImport)
  );

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
  const mothershipSessionSyndicate = useMemo(
    () =>
      config.session.syndicates.find(
        (syndicate) => syndicate.id === config.session.focusSyndicateId
      ) ?? null,
    [config.session.focusSyndicateId, config.session.syndicates]
  );
  const fundingPreview = useMemo(
    () =>
      deriveMothershipFundingSnapshot(
        mothershipFunding,
        mothershipSessionSyndicate?.spend ?? 0
      ),
    [mothershipFunding, mothershipSessionSyndicate?.spend]
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
    setMothershipFunding(config.session.mothershipFunding);
    setSyndicateFundingDrafts(buildSyndicateFundingDrafts(config.session.syndicates));
    setSourceKey(config.session.activeDataSource.key);
    setPayoutRules(config.session.payoutRules);
    setProjectedPotInput(formatDollarInput(config.session.payoutRules.projectedPot));
    setAnalysisSettings(config.session.analysisSettings);
    setBracketImportDraft(buildImportDraft("Official Bracket", config.session.bracketImport));
    setAnalysisImportDraft(buildImportDraft("Team Analysis", config.session.analysisImport));
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

    const payload = (await response.json()) as SessionAdminConfig | null;
    if (payload) {
      setConfig(payload);
    } else {
      await refreshConfig();
    }
    showNotice(successMessage);
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
        showError(submitError instanceof Error ? submitError.message : "Unable to save access.");
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
        showError(
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
      showNotice("Shared access code copied.");
    } catch {
      showError("Unable to copy the shared access code.");
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
      showNotice("Join link copied.");
    } catch {
      showError("Unable to copy the join link.");
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
        showError(
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

  function onImportCsvFile(
    file: File | null,
    setDraft: Dispatch<SetStateAction<ImportDraft>>
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

  function onSaveSyndicates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/syndicates`,
          "PUT",
          {
            catalogSyndicateIds: selectedSyndicateIds,
            syndicateFunding: buildSyndicateFundingPayload(
              selectedSyndicateIds,
              syndicateFundingDrafts
            )
          },
          "Tracked syndicates updated."
        );
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to update syndicates."
        );
      }
    });
  }

  function onSaveFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/funding`,
          "PUT",
          { mothershipFunding },
          "Funding plan updated."
        );
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to update funding plan."
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
        showError(
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
        showError(
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
        showError(
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
        showError(submitError instanceof Error ? submitError.message : "Unable to run import.");
      }
    });
  }

  function onImportBracket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/bracket/import`,
          "POST",
          {
            sourceName: bracketImportDraft.sourceName,
            fileName: bracketImportDraft.fileName || null,
            csvContent: bracketImportDraft.csvContent
          },
          "Bracket import updated."
        );
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to import bracket."
        );
      }
    });
  }

  function onImportAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await submitJson(
          `/api/admin/sessions/${config.session.id}/analysis/import`,
          "POST",
          {
            sourceName: analysisImportDraft.sourceName,
            fileName: analysisImportDraft.fileName || null,
            csvContent: analysisImportDraft.csvContent
          },
          "Analysis import updated."
        );
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to import analysis."
        );
      }
    });
  }

  function updateSyndicateFundingDraft(
    catalogEntryId: string,
    patch: Partial<SyndicateFundingDraft>
  ) {
    setSyndicateFundingDrafts((current) => ({
      ...current,
      [catalogEntryId]: {
        estimatedBudgetInput:
          current[catalogEntryId]?.estimatedBudgetInput ?? formatDollarInput(0),
        budgetConfidence: current[catalogEntryId]?.budgetConfidence ?? "medium",
        budgetNotes: current[catalogEntryId]?.budgetNotes ?? "",
        ...patch
      }
    }));
  }

  function onArchiveSession() {
    startTransition(async () => {
      try {
        clearFeedback();
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
        showNotice("Session archived.");
      } catch (submitError) {
        showError(
          submitError instanceof Error ? submitError.message : "Unable to archive session."
        );
      }
    });
  }

  function onDeleteSession() {
    startTransition(async () => {
      try {
        clearFeedback();
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
        showError(
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
                    <th>Estimated budget</th>
                    <th>Confidence</th>
                    <th>Notes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSyndicates.map((entry) => {
                    const selected = selectedSyndicateIds.includes(entry.id);
                    const sessionSyndicate =
                      config.session.syndicates.find(
                        (syndicate) => syndicate.catalogEntryId === entry.id
                      ) ?? null;
                    const isMothership =
                      entry.name.trim().toLowerCase() ===
                      mothershipSyndicateName.trim().toLowerCase();
                    const draft = syndicateFundingDrafts[entry.id] ?? {
                      estimatedBudgetInput: formatDollarInput(
                        sessionSyndicate?.estimatedBudget ?? 0
                      ),
                      budgetConfidence: sessionSyndicate?.budgetConfidence ?? "medium",
                      budgetNotes: sessionSyndicate?.budgetNotes ?? ""
                    };

                    return (
                      <tr key={entry.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSyndicate(entry.id)}
                          />
                        </td>
                        <td>
                          <div className="syndicate-name">
                            <span className="chip-dot" style={{ backgroundColor: entry.color }} />
                            <strong>{entry.name}</strong>
                          </div>
                        </td>
                        <td>
                          <input
                            className="admin-filter-input"
                            type="text"
                            inputMode="numeric"
                            value={
                              isMothership
                                ? formatDollarInput(mothershipFunding.budgetBase)
                                : draft.estimatedBudgetInput
                            }
                            disabled={!selected || isMothership}
                            onChange={(event) => {
                              const nextValue = parseDollarInput(event.target.value);
                              updateSyndicateFundingDraft(entry.id, {
                                estimatedBudgetInput: formatDollarInput(nextValue)
                              });
                            }}
                          />
                        </td>
                        <td>
                          <select
                            className="inline-select"
                            value={isMothership ? "high" : draft.budgetConfidence}
                            disabled={!selected || isMothership}
                            onChange={(event) =>
                              updateSyndicateFundingDraft(entry.id, {
                                budgetConfidence: event.target.value as BudgetConfidence
                              })
                            }
                          >
                            {confidenceOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="admin-filter-input"
                            type="text"
                            value={isMothership ? "Managed in Funding settings" : draft.budgetNotes}
                            disabled={!selected || isMothership}
                            onChange={(event) =>
                              updateSyndicateFundingDraft(entry.id, {
                                budgetNotes: event.target.value
                              })
                            }
                          />
                        </td>
                        <td>
                          {isMothership ? (
                            <span className="status-pill">Base plan source</span>
                          ) : sessionSyndicate?.estimateExceeded ? (
                            <span className="status-pill">Estimate exceeded</span>
                          ) : (
                            <span className="status-pill">
                              {sessionSyndicate
                                ? formatCurrency(sessionSyndicate.estimatedRemainingBudget)
                                : "Not tracked"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </form>
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section className="surface-card admin-pane">
          <form onSubmit={onSaveFunding}>
            <div className="admin-pane__header admin-pane__section-header">
              <h2>Funding</h2>
              <button type="submit" className="button button--small" disabled={isPending}>
                Save funding
              </button>
            </div>
            <p className="support-copy">
              Mothership funding is now managed separately from room-level projected pot.
            </p>
            <div className="compact-field-grid compact-field-grid--three">
              <label className="field-shell">
                <span>Target share price</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={mothershipFunding.targetSharePrice}
                  onChange={(event) =>
                    setMothershipFunding((current) => ({
                      ...current,
                      targetSharePrice: Number(event.target.value)
                    }))
                  }
                  required
                />
              </label>
              <label className="field-shell">
                <span>Full shares sold</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={mothershipFunding.fullSharesSold}
                  onChange={(event) =>
                    setMothershipFunding((current) => ({
                      ...current,
                      fullSharesSold: Number(event.target.value)
                    }))
                  }
                  required
                />
              </label>
              <label className="field-shell">
                <span>Half shares sold</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={mothershipFunding.halfSharesSold}
                  onChange={(event) =>
                    setMothershipFunding((current) => ({
                      ...current,
                      halfSharesSold: Number(event.target.value)
                    }))
                  }
                  disabled={!mothershipFunding.allowHalfShares}
                  required
                />
              </label>
              <label className="field-shell">
                <span>Budget low</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatDollarInput(mothershipFunding.budgetLow)}
                  onChange={(event) =>
                    setMothershipFunding((current) => ({
                      ...current,
                      budgetLow: parseDollarInput(event.target.value)
                    }))
                  }
                  required
                />
              </label>
              <label className="field-shell">
                <span>Budget base</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatDollarInput(mothershipFunding.budgetBase)}
                  onChange={(event) =>
                    setMothershipFunding((current) => ({
                      ...current,
                      budgetBase: parseDollarInput(event.target.value)
                    }))
                  }
                  required
                />
              </label>
              <label className="field-shell">
                <span>Budget stretch</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatDollarInput(mothershipFunding.budgetStretch)}
                  onChange={(event) =>
                    setMothershipFunding((current) => ({
                      ...current,
                      budgetStretch: parseDollarInput(event.target.value)
                    }))
                  }
                  required
                />
              </label>
            </div>
            <label className="field-shell" style={{ maxWidth: "20rem", marginTop: "1rem" }}>
              <span>Allow half shares</span>
              <select
                value={mothershipFunding.allowHalfShares ? "yes" : "no"}
                onChange={(event) =>
                  setMothershipFunding((current) => ({
                    ...current,
                    allowHalfShares: event.target.value === "yes",
                    halfSharesSold: event.target.value === "yes" ? current.halfSharesSold : 0
                  }))
                }
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <div className="mini-grid" style={{ marginTop: "1rem" }}>
              <MetricReadout
                label="Equivalent shares sold"
                value={fundingPreview.equivalentShares.toFixed(
                  fundingPreview.equivalentShares % 1 === 0 ? 0 : 1
                )}
                tooltip="Full shares plus half shares converted into whole-share equivalents. This is the share count used for target cash and effective share price."
              />
              <MetricReadout
                label="Committed cash at target"
                value={formatCurrency(fundingPreview.committedCash)}
                tooltip="Equivalent shares sold multiplied by the target share price. It shows how much funding those sold shares would support at the planned price."
              />
              <MetricReadout
                label="Effective share price"
                value={
                  fundingPreview.impliedSharePrice === null
                    ? "--"
                    : formatCurrency(fundingPreview.impliedSharePrice)
                }
                tooltip="Current Mothership spend divided by equivalent shares sold. It shows what each sold share is effectively carrying right now."
              />
              <MetricReadout
                label="Base budget room"
                value={formatCurrency(fundingPreview.baseBidRoom)}
                tooltip="Base budget minus current Mothership spend. This is the room left before moving beyond the base funding plan."
              />
              <MetricReadout
                label="Stretch budget room"
                value={formatCurrency(fundingPreview.stretchBidRoom)}
                tooltip="Stretch budget minus current Mothership spend. This is the extra room available if Mothership leans beyond the base plan."
              />
            </div>
          </form>

          <div className="admin-pane__section">
            <div className="admin-pane__section-header">
              <h2>Room planning</h2>
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
                <span>Funding note</span>
                <input value="Projected pot is room-level only" readOnly />
              </label>
            </div>
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
          <div className="admin-pane__header">
            <div>
              <h2>Data</h2>
              <p>{config.session.importReadiness.summary}</p>
            </div>
            <div className="button-row">
              <span
                className={
                  config.session.importReadiness.status === "ready"
                    ? "status-pill status-pill--positive"
                    : "status-pill status-pill--danger"
                }
              >
                {config.session.importReadiness.status === "ready" ? "Room ready" : "Needs attention"}
              </span>
              <span className="status-pill">
                {config.session.importReadiness.mergedProjectionCount} merged teams
              </span>
              <span className="status-pill">
                {(config.session.auctionAssets ?? []).length} auction teams
              </span>
            </div>
          </div>

          <div className="admin-pane__section">
            <p className="eyebrow admin-pane__section-kicker">Selection Sunday readiness</p>
            <div className="compact-field-grid compact-field-grid--three">
              <div className="surface-card" style={{ padding: "1rem" }}>
                <strong>Bracket</strong>
                <p>
                  {config.session.bracketImport
                    ? `${config.session.bracketImport.teamCount} teams from ${config.session.bracketImport.sourceName}`
                    : "No bracket import loaded"}
                </p>
                <p className="support-copy">
                  {config.session.importReadiness.lastBracketImportAt
                    ? `Updated ${formatDateTime(config.session.importReadiness.lastBracketImportAt)}`
                    : "Waiting for import"}
                </p>
              </div>
              <div className="surface-card" style={{ padding: "1rem" }}>
                <strong>Analysis</strong>
                <p>
                  {config.session.analysisImport
                    ? `${config.session.analysisImport.teamCount} rows from ${config.session.analysisImport.sourceName}`
                    : "No analysis import loaded"}
                </p>
                <p className="support-copy">
                  {config.session.importReadiness.lastAnalysisImportAt
                    ? `Updated ${formatDateTime(config.session.importReadiness.lastAnalysisImportAt)}`
                    : "Waiting for import"}
                </p>
              </div>
              <div className="surface-card" style={{ padding: "1rem" }}>
                <strong>Fallback source</strong>
                <p>{config.session.activeDataSource.name}</p>
                <p className="support-copy">
                  Use legacy source imports only if you want the old combined projection flow.
                </p>
              </div>
            </div>
            {config.session.importReadiness.issues.length ? (
              <div className="surface-card" style={{ padding: "1rem", marginTop: "1rem" }}>
                <p className="eyebrow admin-pane__section-kicker">Blocking issues</p>
                <ul className="support-copy" style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {config.session.importReadiness.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {config.session.importReadiness.warnings.length ? (
              <div className="surface-card" style={{ padding: "1rem", marginTop: "1rem" }}>
                <p className="eyebrow admin-pane__section-kicker">Warnings</p>
                <ul className="support-copy" style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {config.session.importReadiness.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="admin-pane__section">
            <p className="eyebrow admin-pane__section-kicker">Bracket import</p>
            <form onSubmit={onImportBracket}>
              <div className="compact-field-grid compact-field-grid--three">
                <label className="field-shell">
                  <span>Source label</span>
                  <input
                    value={bracketImportDraft.sourceName}
                    onChange={(event) =>
                      setBracketImportDraft((current) => ({
                        ...current,
                        sourceName: event.target.value
                      }))
                    }
                    required
                  />
                </label>
                <label className="field-shell">
                  <span>CSV file</span>
                  <input
                    ref={bracketCsvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) =>
                      onImportCsvFile(event.target.files?.[0] ?? null, setBracketImportDraft)
                    }
                  />
                </label>
                <div className="button-row" style={{ alignItems: "end" }}>
                  <button type="submit" className="button button--small" disabled={isPending}>
                    Import bracket
                  </button>
                </div>
              </div>
              <label className="field-shell" style={{ marginTop: "1rem" }}>
                <span>CSV content</span>
                <textarea
                  rows={8}
                  value={bracketImportDraft.csvContent}
                  onChange={(event) =>
                    setBracketImportDraft((current) => ({
                      ...current,
                      csvContent: event.target.value
                    }))
                  }
                  placeholder="Required: name, region, seed. Optional: id, shortName, regionSlot, site, subregion, isPlayIn, playInGroup, playInSeed."
                  required
                />
              </label>
            </form>
          </div>

          <div className="admin-pane__section">
            <p className="eyebrow admin-pane__section-kicker">Analysis import</p>
            <form onSubmit={onImportAnalysis}>
              <div className="compact-field-grid compact-field-grid--three">
                <label className="field-shell">
                  <span>Source label</span>
                  <input
                    value={analysisImportDraft.sourceName}
                    onChange={(event) =>
                      setAnalysisImportDraft((current) => ({
                        ...current,
                        sourceName: event.target.value
                      }))
                    }
                    required
                  />
                </label>
                <label className="field-shell">
                  <span>CSV file</span>
                  <input
                    ref={analysisCsvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) =>
                      onImportCsvFile(event.target.files?.[0] ?? null, setAnalysisImportDraft)
                    }
                  />
                </label>
                <div className="button-row" style={{ alignItems: "end" }}>
                  <button type="submit" className="button button--small" disabled={isPending}>
                    Import analysis
                  </button>
                </div>
              </div>
              <label className="field-shell" style={{ marginTop: "1rem" }}>
                <span>CSV content</span>
                <textarea
                  rows={8}
                  value={analysisImportDraft.csvContent}
                  onChange={(event) =>
                    setAnalysisImportDraft((current) => ({
                      ...current,
                      csvContent: event.target.value
                    }))
                  }
                  placeholder="Required: name, rating, offense, defense, tempo. Optional: teamId, shortName, NET Rank, KenPom Rank, Ranked Wins, 3PT%, Q1-Q4 wins."
                  required
                />
              </label>
            </form>
          </div>

          <div className="admin-pane__section">
            <form onSubmit={onSaveDataSource}>
              <div className="admin-pane__header admin-pane__section-header">
                <div>
                  <p className="eyebrow admin-pane__section-kicker">Legacy projection source</p>
                  <h3>Fallback import flow</h3>
                </div>
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
                    Run legacy import
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
          </div>

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

function MetricReadout({
  label,
  value,
  tooltip
}: {
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <div className="metric-card metric-card--compact">
      <span className={tooltip ? "insight-label" : undefined}>
        {label}
        {tooltip ? (
          <button type="button" className="tooltip-hint" aria-label={`${label} explanation`}>
            ?
            <span className="tooltip-content">{tooltip}</span>
          </button>
        ) : null}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
