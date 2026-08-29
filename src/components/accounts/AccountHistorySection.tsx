import { useEffect, useState } from "react";
import { listAccountHistory } from "../../lib/db";
import type { AccountHistoryEntry } from "../../types";

const EVENT_LABELS: Record<string, string> = {
  created: "Conta criada",
  username_changed: "Username alterado",
  email_changed: "E-mail alterado",
  password_changed: "Senha alterada",
  platform_changed: "Plataforma alterada",
  status_changed: "Status alterado",
  project_added: "Associada a um projeto",
  project_removed: "Removida de um projeto",
  avatar_changed: "Avatar alterado",
  tags_changed: "Tags alteradas",
  property_added: "Propriedade adicionada",
  property_changed: "Propriedade alterada",
  property_removed: "Propriedade removida",
  two_factor_enabled: "2FA habilitado",
  two_factor_disabled: "2FA desabilitado",
  archived: "Conta arquivada",
  restored: "Conta restaurada",
};

export function AccountHistorySection({ accountId }: { accountId: number }) {
  const [entries, setEntries] = useState<AccountHistoryEntry[]>([]);

  useEffect(() => {
    listAccountHistory(accountId).then(setEntries);
  }, [accountId]);

  if (entries.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">Nenhum evento registrado ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="border-l-2 border-[var(--color-border)] pl-3">
          <p className="text-xs text-[var(--color-text-muted)]">{new Date(entry.created_at).toLocaleString("pt-BR")}</p>
          <p className="text-sm text-[var(--color-text)]">{EVENT_LABELS[entry.event] ?? entry.event}</p>
          {entry.detail && <p className="text-xs text-[var(--color-text-muted)]">{entry.detail}</p>}
        </div>
      ))}
    </div>
  );
}
