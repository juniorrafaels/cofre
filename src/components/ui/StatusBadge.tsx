import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "../../types";

const STATUS_COLORS: Record<AccountStatus, string> = {
  active: "bg-[var(--color-success)]",
  blocked: "bg-[var(--color-danger)]",
  recovering: "bg-amber-500",
  suspended: "bg-amber-500",
  disabled: "bg-[var(--color-text-muted)]",
  archived: "bg-[var(--color-text-muted)]",
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  if (status === "active") return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[status]}`} />
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}
