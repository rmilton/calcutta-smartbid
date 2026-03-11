"use client";

import { FormEvent, useState, useTransition } from "react";

type AccessMode = "viewer" | "operator" | "admin";

const accessModes: Array<{
  id: AccessMode;
  label: string;
  title: string;
  submitLabel: string;
}> = [
  {
    id: "viewer",
    label: "Viewer",
    title: "Join session",
    submitLabel: "Enter"
  },
  {
    id: "operator",
    label: "Operator",
    title: "Operator access",
    submitLabel: "Enter"
  },
  {
    id: "admin",
    label: "Platform admin",
    title: "Platform admin",
    submitLabel: "Enter admin"
  }
];

export function AccessForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AccessMode>("viewer");

  const activeMode = accessModes.find((candidate) => candidate.id === mode) ?? accessModes[0];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          sharedCode
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to sign in.");
        return;
      }

      const payload = (await response.json()) as { redirectTo: string };
      window.location.assign(payload.redirectTo);
    });
  }

  return (
    <form className="minimal-auth-card" onSubmit={onSubmit}>
      <div className="minimal-auth-card__header">
        <p className="minimal-auth-card__brand">Mothership</p>
        <h1 className="minimal-auth-card__title">{activeMode.title}</h1>
        <div className="access-tier-row" role="tablist" aria-label="Access mode">
          {accessModes.map((candidate) => {
            const isActive = candidate.id === mode;
            return (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={[
                  "access-tier",
                  `access-tier--${candidate.id}`,
                  isActive ? "access-tier--active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setMode(candidate.id)}
              >
                {candidate.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="minimal-auth-form">
        <label className="minimal-field">
          <span className="minimal-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="name@domain.com"
            required
          />
        </label>
        <label className="minimal-field">
          <span className="minimal-label">Code</span>
          <input
            value={sharedCode}
            onChange={(event) => setSharedCode(event.target.value)}
            autoComplete="one-time-code"
            placeholder="Shared code"
            required
          />
        </label>
      </div>

      {error ? <p className="minimal-auth-error">{error}</p> : null}

      <button type="submit" className="minimal-auth-submit" disabled={isPending}>
        {isPending ? "Checking access..." : activeMode.submitLabel}
      </button>
    </form>
  );
}
