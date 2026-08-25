import type { AccountWithRelations } from "../types";

export function matchesSearch(account: AccountWithRelations, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const haystack = [
    account.name,
    account.username,
    account.email,
    account.category,
    account.notes,
    account.platform?.name,
    ...account.tags.map((t) => t.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function sortAccounts(accounts: AccountWithRelations[], field: "name" | "created_at" | "updated_at", direction: "asc" | "desc") {
  const sorted = [...accounts].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return direction === "asc" ? sorted : sorted.reverse();
}
