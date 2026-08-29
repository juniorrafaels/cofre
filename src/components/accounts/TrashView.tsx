import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { AccountWithRelations } from "../../types";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface Props {
  accounts: AccountWithRelations[];
  onRestore: (account: AccountWithRelations) => void;
  onPermanentlyDelete: (account: AccountWithRelations) => void;
}

export function TrashView({ accounts, onRestore, onPermanentlyDelete }: Props) {
  const [pending, setPending] = useState<AccountWithRelations | null>(null);

  if (accounts.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="Lixeira vazia" description="Contas excluídas aparecerão aqui antes de serem removidas permanentemente." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-4 py-2.5 font-medium">Conta</th>
              <th className="px-4 py-2.5 font-medium">Plataforma</th>
              <th className="px-4 py-2.5 font-medium">Excluída em</th>
              <th className="px-4 py-2.5 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar imageId={account.avatar_image_id} platformIcon={account.platform?.icon ?? null} size={28} />
                    <span className="font-medium text-[var(--color-text)]">{account.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{account.platform?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                  {account.deleted_at ? new Date(account.deleted_at).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => onRestore(account)}>
                      <RotateCcw size={13} /> Restaurar
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setPending(account)}>
                      <Trash2 size={13} /> Excluir
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="Excluir permanentemente?"
        message={`Esta ação removerá definitivamente "${pending?.name}" e suas informações. Esta ação não poderá ser desfeita.`}
        confirmLabel="Excluir permanentemente"
        danger
        onConfirm={() => {
          if (pending) onPermanentlyDelete(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
