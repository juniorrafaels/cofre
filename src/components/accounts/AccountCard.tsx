import { Copy, ExternalLink, Key, Pencil, Star } from "lucide-react";
import type { AccountWithRelations } from "../../types";
import { Avatar } from "../ui/Avatar";
import { useCopy } from "../../lib/useCopy";
import { openLoginUrl, secretCommands } from "../../lib/tauri";
import { useToastStore } from "../../store/useToastStore";

interface Props {
  account: AccountWithRelations;
  onOpenDetail: () => void;
  onEdit: () => void;
  onToggleFavorite: () => void;
}

export function AccountCard({ account, onOpenDetail, onEdit, onToggleFavorite }: Props) {
  const copy = useCopy();
  const push = useToastStore((s) => s.push);

  const loginUrl = account.login_url || account.platform?.login_url || "";

  async function handleLogin(e: React.MouseEvent) {
    e.stopPropagation();
    if (!loginUrl) {
      push("Nenhuma URL de login cadastrada.", "error");
      return;
    }
    try {
      await openLoginUrl(loginUrl);
    } catch (err) {
      push(`Não foi possível abrir o navegador: ${String(err)}`, "error");
    }
  }

  async function handleCopyPassword(e: React.MouseEvent) {
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
    <div
      onClick={onOpenDetail}
      className="group cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar imageId={account.avatar_image_id} platformIcon={account.platform?.icon ?? null} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">{account.name}</p>
            <p className="truncate text-xs text-[var(--color-text-muted)]">{account.username || account.email || "—"}</p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="shrink-0 text-[var(--color-text-muted)] hover:text-amber-400"
        >
          <Star size={16} fill={account.favorite ? "currentColor" : "none"} className={account.favorite ? "text-amber-400" : ""} />
        </button>
      </div>

      {account.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {account.tags.slice(0, 3).map((tag) => (
            <span key={tag.id} className="rounded-full bg-[var(--color-surface-hover)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1 border-t border-[var(--color-border)] pt-3 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={handleLogin} title="Abrir login" className="flex flex-1 items-center justify-center rounded-md py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
          <ExternalLink size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            copy(account.username || account.email, "Username");
          }}
          title="Copiar username"
          className="flex flex-1 items-center justify-center rounded-md py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <Copy size={14} />
        </button>
        <button onClick={handleCopyPassword} title="Copiar senha" className="flex flex-1 items-center justify-center rounded-md py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
          <Key size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Editar"
          className="flex flex-1 items-center justify-center rounded-md py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}
