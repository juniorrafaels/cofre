import { Copy, ExternalLink, Key, Pencil, Star } from "lucide-react";
import type { AccountWithRelations } from "../../types";
import { Avatar } from "../ui/Avatar";
import { useCopy } from "../../lib/useCopy";
import { openLoginUrl, secretCommands } from "../../lib/tauri";
import { useToastStore } from "../../store/useToastStore";

interface Props {
  accounts: AccountWithRelations[];
  onOpenDetail: (account: AccountWithRelations) => void;
  onEdit: (account: AccountWithRelations) => void;
  onToggleFavorite: (account: AccountWithRelations) => void;
}

export function AccountsListView({ accounts, onOpenDetail, onEdit, onToggleFavorite }: Props) {
  const copy = useCopy();
  const push = useToastStore((s) => s.push);

  async function handleLogin(e: React.MouseEvent, account: AccountWithRelations) {
    e.stopPropagation();
    const url = account.login_url || account.platform?.login_url || "";
    if (!url) {
      push("Nenhuma URL de login cadastrada.", "error");
      return;
    }
    await openLoginUrl(url);
  }

  async function handleCopyPassword(e: React.MouseEvent, account: AccountWithRelations) {
    e.stopPropagation();
    if (!account.encrypted_password) {
      push("Nenhuma senha cadastrada.", "error");
      return;
    }
    try {
      const plaintext = await secretCommands.decrypt(account.encrypted_password);
      await copy(plaintext, "Senha");
    } catch (err) {
      push(`Não foi possível copiar a senha: ${String(err)}`, "error");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
            <th className="px-4 py-2.5 font-medium">Conta</th>
            <th className="px-4 py-2.5 font-medium">Plataforma</th>
            <th className="px-4 py-2.5 font-medium">Username</th>
            <th className="px-4 py-2.5 font-medium">E-mail</th>
            <th className="px-4 py-2.5 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr
              key={account.id}
              onClick={() => onOpenDetail(account)}
              className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)]"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar imageId={account.avatar_image_id} platformIcon={account.platform?.icon ?? null} size={28} />
                  <span className="font-medium text-[var(--color-text)]">{account.name}</span>
                  {!!account.favorite && <Star size={12} fill="currentColor" className="text-amber-400" />}
                </div>
              </td>
              <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{account.platform?.name ?? "—"}</td>
              <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{account.username || "—"}</td>
              <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{account.email || "—"}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={(e) => handleLogin(e, account)} title="Abrir login" className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]">
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copy(account.username || account.email, "Username");
                    }}
                    title="Copiar username"
                    className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  >
                    <Copy size={14} />
                  </button>
                  <button onClick={(e) => handleCopyPassword(e, account)} title="Copiar senha" className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]">
                    <Key size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(account);
                    }}
                    title="Favoritar"
                    className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-amber-400"
                  >
                    <Star size={14} fill={account.favorite ? "currentColor" : "none"} className={account.favorite ? "text-amber-400" : ""} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(account);
                    }}
                    title="Editar"
                    className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
