"use client";

import { useTheme } from "./theme-provider";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
  { value: "auto", label: "Auto" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Farbschema"
      className="inline-flex items-center gap-0.5 rounded-full border border-hairline bg-toggle-track p-1 text-xs font-medium"
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setPreference(option.value)}
            className={[
              "rounded-full px-2.5 py-1 transition-colors duration-200",
              active
                ? "bg-toggle-active text-toggle-active-fg shadow-sm"
                : "text-muted hover:bg-surface hover:text-foreground",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
