"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Mode = "light" | "dark";

function applyMode(mode: Mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function ThemeToggle() {
  // Initialize to undefined so the very first render matches the SSR markup
  // (no class assumptions). The inline script in <head> sets the class before
  // React hydrates, so the visual theme is already correct.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem("fednav-theme") as Mode | null) ?? null;
    const initial: Mode = stored ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
    setMode(initial);
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyMode(next);
    localStorage.setItem("fednav-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      className="grid h-8 w-8 place-items-center rounded-[9px] border border-line-1 bg-surface text-ink-3 hover:bg-bg-2 hover:text-ink-1"
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
