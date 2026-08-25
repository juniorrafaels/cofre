import { PlatformIcon } from "../ui/PlatformIcon";

interface Props {
  icon: string | null;
  name: string;
  count: number;
  onClick: () => void;
}

export function CategoryCard({ icon, name, count, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-hover)]">
        <PlatformIcon icon={icon} size={18} />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{name}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{count} {count === 1 ? "conta" : "contas"}</p>
      </div>
    </button>
  );
}
