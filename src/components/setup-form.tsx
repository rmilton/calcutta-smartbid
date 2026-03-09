"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { getDefaultPayoutRules } from "@/lib/sample-data";

const defaults = getDefaultPayoutRules();

export function SetupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("2026 March Madness Calcutta");
  const [focusSyndicateName, setFocusSyndicateName] = useState("SmartBid Capital");
  const [sharedAccessCode, setSharedAccessCode] = useState("march26");
  const [syndicatesText, setSyndicatesText] = useState(
    ["SmartBid Capital", "Riverboat", "Glass House", "Fourth Bid"].join("\n")
  );
  const [accessMembersText, setAccessMembersText] = useState(
    [
      "Ryan Milton, rmilton@westmonroe.com, admin",
      "Jordan Ames, jordan@example.com, viewer"
    ].join("\n")
  );
  const [startingBankroll, setStartingBankroll] = useState(defaults.startingBankroll);
  const [houseTakePct, setHouseTakePct] = useState(defaults.houseTakePct);
  const [iterations, setIterations] = useState(4000);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const syndicates = syndicatesText
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((name) => ({ name }));

    const accessMembers = accessMembersText
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((row) => {
        const [name, email, role] = row.split(",").map((part) => part.trim());
        return {
          name,
          email,
          role: role === "viewer" ? "viewer" : "admin"
        };
      });

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
          accessMembers,
          syndicates,
          projectionProvider: "mock",
          simulationIterations: iterations,
          payoutRules: {
            sweet16: defaults.sweet16,
            elite8: defaults.elite8,
            finalFour: defaults.finalFour,
            titleGame: defaults.titleGame,
            champion: defaults.champion,
            startingBankroll,
            houseTakePct
          }
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to create auction session.");
        return;
      }

      const payload = (await response.json()) as { sessionId: string };
      router.push(`/session/${payload.sessionId}`);
    });
  }

  return (
    <form className="setup-shell" onSubmit={onSubmit}>
      <section className="surface-card form-section">
        <div className="form-section__header">
          <p className="eyebrow">Session Identity</p>
          <h2>Core auction setup</h2>
          <p>
            Keep the form fast for power users, but group the settings so the room can
            be configured with less scanning and fewer mistakes.
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
            <span>Focus syndicate</span>
            <input
              value={focusSyndicateName}
              onChange={(event) => setFocusSyndicateName(event.target.value)}
              required
            />
          </label>
          <label className="field-shell">
            <span>Shared access code</span>
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
          <p className="eyebrow">Auction Economics</p>
          <h3>Bankroll and simulation settings</h3>
        </div>

        <div className="form-grid form-grid--three">
          <label className="field-shell">
            <span>Starting bankroll</span>
            <input
              type="number"
              min={1000}
              step={500}
              value={startingBankroll}
              onChange={(event) => setStartingBankroll(Number(event.target.value))}
              required
            />
          </label>
          <label className="field-shell">
            <span>House take %</span>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={houseTakePct}
              onChange={(event) => setHouseTakePct(Number(event.target.value))}
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

      <section className="surface-card form-section">
        <div className="form-section__header">
          <p className="eyebrow">Participants</p>
          <h3>Rosters and room access</h3>
        </div>

        <div className="form-grid form-grid--two">
          <label className="field-shell">
            <span>Syndicates (one per line)</span>
            <textarea
              rows={7}
              value={syndicatesText}
              onChange={(event) => setSyndicatesText(event.target.value)}
            />
          </label>
          <label className="field-shell">
            <span>Access roster (name, email, role per line)</span>
            <textarea
              rows={7}
              value={accessMembersText}
              onChange={(event) => setAccessMembersText(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="button-row button-row--spread">
        <button type="submit" className="button" disabled={isPending}>
          {isPending ? "Building session..." : "Launch live auction"}
        </button>
        <p className="support-copy">
          A sample field is loaded immediately so the room can begin bidding without
          additional setup.
        </p>
      </div>
    </form>
  );
}
