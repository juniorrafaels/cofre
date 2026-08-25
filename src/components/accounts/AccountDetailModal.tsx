import { useEffect, useState } from "react";
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Avatar } from "../ui/Avatar";
import type { AccountWithRelations } from "../../types";
import { secretCommands, openLoginUrl } from "../../lib/tauri";
import { useCopy } from "../../lib/useCopy";
import { useToastStore } from "../../store/useToastStore";

interface Props {
  account: AccountWithRelations | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AccountDetailModal({ account, onClose, onEdit, onDelete }: Props) {
  const [password, setPassword] = useState("");
  const copy = useCopy();
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    setPassword("");
  }, [account?.id]);

  if (!account) return null;

  const loginUrl = account.login_url || account.platform?.login_url || "";

  async function ensurePassword(): Promise<string> {
    if (password) return password;
    if (!account?.encrypted_password) return "";
    const plaintext = await secretCommands.decrypt(account.encrypted_password);
    setPassword(plaintext);
    return plaintext;
  }

  async function handleLogin() {
    if (!loginUrl) {
      push("Nenhuma URL de login cadastrada.", "error");
      return;
    }
    await openLoginUrl(loginUrl);
  }

  async function handleCopyPassword() {
    try {
      const plaintext = await ensurePassword();
      copy(plaintext, "Senha");
    } catch (err) {
      push(`Não foi possível copiar a senha: ${String(err)}`, "error");
    }
  }

  return (
    <Modal open={!!account} onClose={onClose} title={account.platform?.name ?? "Conta"} width="md">
      <div className="mb-4 flex items-center gap-3">
        <Avatar imageId={account.avatar_image_id} platformIcon={account.platform?.icon ?? null} size={44} />
        <div>
          <p className="text-base font-semibold">{account.name}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{account.category || account.platform?.name}</p>
        </div>
      </div>

      <div className="space-y-3">
        <Field
          label="Username"
          value={account.username || "—"}
          onCopy={() => copy(account.username, "Username")}
        />
        <Field label="E-mail" value={account.email || "—"} onCopy={() => copy(account.email, "E-mail")} />

        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Senha</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1">
              <PasswordFieldLazy account={account} password={password} onReveal={ensurePassword} />
            </div>
            <button onClick={handleCopyPassword} className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]" title="Copiar senha">
              <Copy size={15} />
            </button>
          </div>
        </div>

        {loginUrl && (
          <Field label="URL de login" value={loginUrl} mono />
        )}

        {account.notes && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Observações</p>
            <p className="text-sm text-[var(--color-text)]">{account.notes}</p>
          </div>
        )}

        {account.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {account.tags.map((tag) => (
                <span key={tag.id} className="rounded-full bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
        <Button variant="primary" onClick={handleLogin}>
          <ExternalLink size={15} /> Abrir login
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          <Pencil size={15} /> Editar
        </Button>
        <Button variant="danger" className="ml-auto" onClick={onDelete}>
          <Trash2 size={15} /> Excluir
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, value, onCopy, mono }: { label: string; value: string; onCopy?: () => void; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className={`flex-1 truncate text-sm text-[var(--color-text)] ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
        {onCopy && (
          <button onClick={onCopy} className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]">
            <Copy size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function PasswordFieldLazy({
  account,
  password,
  onReveal,
}: {
  account: AccountWithRelations;
  password: string;
  onReveal: () => Promise<string>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(password);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValue(password);
    setRevealed(false);
  }, [password, account.id]);

  if (!account.encrypted_password) {
    return <p className="text-sm text-[var(--color-text-muted)]">Nenhuma senha cadastrada.</p>;
  }

  async function toggleReveal() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    setLoading(true);
    try {
      const plaintext = await onReveal();
      setValue(plaintext);
      setRevealed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <Input type={revealed ? "text" : "password"} value={revealed ? value : "••••••••••"} readOnly />
      <button
        type="button"
        onClick={toggleReveal}
        disabled={loading}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
        title={revealed ? "Ocultar senha" : "Mostrar senha"}
      >
        {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
