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
    <form className="setup-card" onSubmit={onSubmit}>
      <div className="section-heading">
        <p className="eyebrow">Auction access</p>
        <h2>Open your live room</h2>
      </div>

      <div className="setup-grid">
        <label>
          <span>Email address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Shared code</span>
          <input
            value={sharedCode}
            onChange={(event) => setSharedCode(event.target.value)}
            required
          />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="setup-actions">
        <button type="submit" disabled={isPending}>
          {isPending ? "Checking access..." : "Enter auction"}
        </button>
        <p>Platform admins are routed to session setup. Session members are routed into their auction room.</p>
      </div>
    </form>
  );
}
