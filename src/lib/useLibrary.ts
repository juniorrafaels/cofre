import { useCallback, useEffect, useState } from "react";
import { listAccountsWithRelations, listPlatforms } from "./db";
import type { AccountWithRelations, Platform } from "../types";

export function useLibrary(enabled: boolean) {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [accounts, setAccounts] = useState<AccountWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, a] = await Promise.all([listPlatforms(), listAccountsWithRelations()]);
    setPlatforms(p);
    setAccounts(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const countsByPlatform: Record<number, number> = {};
  for (const account of accounts) {
    if (account.platform_id) {
      countsByPlatform[account.platform_id] = (countsByPlatform[account.platform_id] ?? 0) + 1;
    }
  }
  const favoritesCount = accounts.filter((a) => a.favorite).length;

  return { platforms, accounts, loading, refresh, countsByPlatform, favoritesCount };
}
