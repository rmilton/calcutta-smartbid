"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

export function AccessForm() {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [sharedCode, setSharedCode] = useState(searchParams.get("code")?.trim() ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prefilledCode = searchParams.get("code")?.trim() ?? "";
    if (prefilledCode) {
      setSharedCode(prefilledCode);
    }
  }, [searchParams]);

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
        <p className="minimal-auth-card__brand">mothership smartbid™</p>
        <h1 className="minimal-auth-card__title">Enter room</h1>
      </div>

      <div className="minimal-auth-form">
        <label className="minimal-field">
          <span className="minimal-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
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
        {isPending ? "Checking access..." : "Enter"}
      </button>
    </form>
  );
}
