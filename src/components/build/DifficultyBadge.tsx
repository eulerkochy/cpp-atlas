import type { StageDifficulty } from "@/lib/build-challenges";
import { cn } from "@/lib/utils";

const LABEL: Record<StageDifficulty, string> = {
  "very-easy": "Very easy",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: StageDifficulty;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-chip)] border px-2 py-0.5 text-xs font-medium",
        difficulty === "hard"
          ? "border-ink bg-sun text-ink"
          : difficulty === "medium"
            ? "border-line-strong bg-sun-wash text-ink"
            : "border-line bg-paper-raised text-ink-soft",
        className
      )}
    >
      {LABEL[difficulty]}
    </span>
  );
}
