"use client";

import { FormEvent, useState, useTransition } from "react";

type AccessIntent = "platform" | "session";

export function AccessForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [intent, setIntent] = useState<AccessIntent>("session");
  const [error, setError] = useState<string | null>(null);

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
    <form className="surface-card auth-card" onSubmit={onSubmit}>
      <div className="auth-card__header">
        <p className="eyebrow">Choose your path</p>
        <h2>{intent === "platform" ? "Enter the platform control plane" : "Join a live session"}</h2>
        <p>
          {intent === "platform"
            ? "Use your platform admin email and control-plane code. You will land in Sessions, then continue into room setup and launch."
            : "Use your assigned email and shared room code. You will land directly in the live room as an operator or viewer."}
        </p>
      </div>

      <div className="role-choice-grid" role="tablist" aria-label="Access mode">
        <button
          type="button"
          className={intent === "platform" ? "role-choice-card role-choice-card--active" : "role-choice-card"}
          onClick={() => setIntent("platform")}
        >
          <span className="role-choice-card__eyebrow">Platform admin</span>
          <strong>Sessions, setup, and launch</strong>
          <p>Use this path if you manage rooms, directory users, data sources, and session readiness.</p>
        </button>
        <button
          type="button"
          className={intent === "session" ? "role-choice-card role-choice-card--active" : "role-choice-card"}
          onClick={() => setIntent("session")}
        >
          <span className="role-choice-card__eyebrow">Join session</span>
          <strong>Operator or viewer access</strong>
          <p>Use this path if you were invited into a live room with an assigned email and room code.</p>
        </button>
      </div>

      <div className="form-grid form-grid--two">
        <label className="field-shell">
          <span>{intent === "platform" ? "Platform admin email" : "Assigned email"}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field-shell">
          <span>{intent === "platform" ? "Control-plane code" : "Shared room code"}</span>
          <input
            value={sharedCode}
            onChange={(event) => setSharedCode(event.target.value)}
            required
          />
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="button-row button-row--spread">
        <button type="submit" className="button" disabled={isPending}>
          {isPending
            ? "Checking access..."
            : intent === "platform"
              ? "Enter Sessions workspace"
              : "Join live room"}
        </button>
        <p className="support-copy">
          {intent === "platform"
            ? "Platform admin credentials route to the control plane, not the live board."
            : "If you reach the wrong room, your assigned email or shared room code likely does not match the active session."}
        </p>
      </div>
    </form>
  );
}
