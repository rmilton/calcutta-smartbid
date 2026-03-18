"use client";

import { useCallback, useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="theme-toggle__icon"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.75v2.5" />
      <path d="M12 18.75v2.5" />
      <path d="M21.25 12h-2.5" />
      <path d="M5.25 12h-2.5" />
      <path d="m18.54 5.46-1.77 1.77" />
      <path d="m7.23 16.77-1.77 1.77" />
      <path d="m18.54 18.54-1.77-1.77" />
      <path d="m7.23 7.23-1.77-1.77" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="theme-toggle__icon"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.25 3.85a7.95 7.95 0 1 0 4.9 14.55A8.75 8.75 0 1 1 15.25 3.85Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme") as "dark" | "light" | null;
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch {
      // localStorage unavailable (e.g. Safari private mode)
    }
  }, []);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // localStorage unavailable (e.g. Safari private mode)
    }
    document.documentElement.setAttribute("data-theme", next);
  }, [theme]);

  return (
    <button
      type="button"
      className="button button-ghost theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
