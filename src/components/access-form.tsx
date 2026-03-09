"use client";

import { FormEvent, useState, useTransition } from "react";

export function AccessForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [sharedCode, setSharedCode] = useState("");
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
        <p className="eyebrow">Auction Access</p>
        <h2>Open your live room</h2>
        <p>
          Platform admins are routed into session setup. Session members go directly to
          the live board.
        </p>
      </div>

      <div className="form-grid form-grid--two">
        <label className="field-shell">
          <span>Email address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field-shell">
          <span>Shared code</span>
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
          {isPending ? "Checking access..." : "Enter auction"}
        </button>
        <p className="support-copy">
          Use the shared event code from the operator to join the same synchronized room.
        </p>
      </div>
    </form>
  );
}
