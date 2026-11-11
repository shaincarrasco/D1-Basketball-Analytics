"use client";
// Light/dark switch. The initial theme is set before paint by the inline script in layout.tsx.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"); }, []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#f5f6fa" : "#060810");
    try { localStorage.setItem("d1h-theme", next); } catch { /* private mode */ }
    setTheme(next);
  };
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button onClick={flip} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-lg border border-line2 bg-deck text-mute hover:text-ink">
      {theme === "light" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
    </button>
  );
}
