"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { DataSource, PlatformUser, SyndicateCatalogEntry } from "@/lib/types";
import { getDefaultPayoutRules } from "@/lib/sample-data";

const defaults = getDefaultPayoutRules();

interface SetupFormProps {
  platformUsers: PlatformUser[];
  syndicateCatalog: SyndicateCatalogEntry[];
  dataSources: DataSource[];
}

export function SetupForm({
  platformUsers,
  syndicateCatalog,
  dataSources
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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    activeUsers.slice(0, 1).map((user) => user.id)
  );
  const [userRoles, setUserRoles] = useState<Record<string, "admin" | "viewer">>(
    Object.fromEntries(activeUsers.slice(0, 1).map((user) => [user.id, "admin"]))
  );
  const [selectedSyndicateIds, setSelectedSyndicateIds] = useState<string[]>(
    activeSyndicates.slice(0, 4).map((entry) => entry.id)
  );
  const [focusSyndicateName, setFocusSyndicateName] = useState(
    activeSyndicates[0]?.name ?? "SmartBid Capital"
  );
  const [sharedAccessCode, setSharedAccessCode] = useState("march26");
  const [projectedPot, setProjectedPot] = useState(defaults.projectedPot);
  const [iterations, setIterations] = useState(4000);
  const [dataSourceKey, setDataSourceKey] = useState("builtin:mock");

  const focusOptions = useMemo(
    () =>
      activeSyndicates
        .filter((entry) => selectedSyndicateIds.includes(entry.id))
        .map((entry) => entry.name),
    [activeSyndicates, selectedSyndicateIds]
  );

  useEffect(() => {
    if (focusOptions.length === 0) {
      return;
    }

    if (!focusOptions.includes(focusSyndicateName)) {
      setFocusSyndicateName(focusOptions[0]);
    }
  }, [focusOptions, focusSyndicateName]);

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
          focusSyndicateName,
          sharedAccessCode,
          accessAssignments,
          catalogSyndicateIds: selectedSyndicateIds,
          dataSourceKey,
          simulationIterations: iterations,
          payoutRules: {
            roundOf64: defaults.roundOf64,
            roundOf32: defaults.roundOf32,
            sweet16: defaults.sweet16,
            elite8: defaults.elite8,
            finalFour: defaults.finalFour,
            champion: defaults.champion,
            projectedPot
          }
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
    <form className="setup-shell" onSubmit={onSubmit}>
      <section className="surface-card form-section">
        <div className="form-section__header">
          <p className="eyebrow">Session identity</p>
          <h2>Start the room, then continue into readiness</h2>
          <p>
            Create the room name, choose your syndicate, and define the shared room code.
            You will continue into the readiness checklist after creation.
          </p>
        </div>

        <div className="form-grid form-grid--three">
          <label className="field-shell">
            <span>Session name</span>
            <input
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              required
            />
          </label>
          <label className="field-shell">
            <span>Your syndicate</span>
            <select
              value={focusSyndicateName}
              onChange={(event) => setFocusSyndicateName(event.target.value)}
            >
              {focusOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell">
            <span>Shared room code</span>
            <input
              value={sharedAccessCode}
              onChange={(event) => setSharedAccessCode(event.target.value)}
              required
            />
          </label>
        </div>
      </section>

      <section className="surface-card form-section">
        <div className="form-section__header">
          <p className="eyebrow">Initial readiness</p>
          <h3>Economics, simulation, and data source</h3>
        </div>

        <div className="form-grid form-grid--three">
          <label className="field-shell">
            <span>Projection source</span>
            <select value={dataSourceKey} onChange={(event) => setDataSourceKey(event.target.value)}>
              <option value="builtin:mock">Built-in Mock Field</option>
              {dataSources
                .filter((source) => source.active)
                .map((source) => (
                  <option key={source.id} value={`data-source:${source.id}`}>
                    {source.name} ({source.kind.toUpperCase()})
                  </option>
                ))}
            </select>
          </label>
          <label className="field-shell">
            <span>Projected pot</span>
            <input
              type="number"
              min={1000}
              step={1000}
              value={projectedPot}
              onChange={(event) => setProjectedPot(Number(event.target.value))}
              required
            />
          </label>
          <label className="field-shell">
            <span>Simulation iterations</span>
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

      <section className="form-grid form-grid--two">
        <section className="surface-card form-section">
          <div className="form-section__header">
            <p className="eyebrow">Room access</p>
            <h3>Assign operators and viewers</h3>
          </div>

          {activeUsers.length === 0 ? (
            <p className="empty-copy">Create org users in the admin center before creating a session.</p>
          ) : (
            <div className="selection-list">
              {activeUsers.map((user) => {
                const selected = selectedUserIds.includes(user.id);
                return (
                  <div key={user.id} className="selection-row">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleUser(user.id)}
                      />
                      <span>
                        {user.name} <small>{user.email}</small>
                      </span>
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
          )}
        </section>

        <section className="surface-card form-section">
          <div className="form-section__header">
            <p className="eyebrow">Participating Syndicates</p>
            <h3>Choose the room lineup</h3>
          </div>

          <div className="selection-list">
            {activeSyndicates.map((entry) => (
              <label key={entry.id} className="checkbox-row selection-row selection-row--stacked">
                <span>
                  <input
                    type="checkbox"
                    checked={selectedSyndicateIds.includes(entry.id)}
                    onChange={() => toggleSyndicate(entry.id)}
                  />
                  {entry.name}
                </span>
              </label>
            ))}
          </div>
        </section>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="button-row button-row--spread">
        <button type="submit" className="button" disabled={isPending}>
          {isPending ? "Creating session..." : "Create session and continue"}
        </button>
        <p className="support-copy">
          Next stop: the readiness checklist for room access, economics, imports, and launch tools.
        </p>
      </div>
    </form>
  );
}
