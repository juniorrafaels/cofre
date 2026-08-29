import { FormEvent, useEffect, useState } from "react";
import { Eye, ImagePlus, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input, Label, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { AvatarPicker } from "./AvatarPicker";
import { PasswordField } from "./PasswordField";
import { TagPicker } from "../ui/TagPicker";
import {
  ACCOUNT_STATUS_LABELS,
  TWO_FACTOR_METHOD_LABELS,
  type AccountFormValues,
  type AccountStatus,
  type AccountWithRelations,
  type Platform,
  type Project,
  type Tag,
  type TwoFactorMethod,
} from "../../types";
import { accountSecretCommands } from "../../lib/tauri";
import { useToastStore } from "../../store/useToastStore";
import { tryFetch, DECRYPTION_FAILED_MESSAGE } from "../../lib/secretFields";

interface Props {
  open: boolean;
  onClose: () => void;
  // `preserveFields`: campos sensíveis que falharam ao descriptografar e que o usuário não
  // editou — o chamador deve gravar de volta o ciphertext original em vez de recifrar uma
  // string vazia, para não destruir um dado que só não pôde ser exibido (nunca perder dados).
  onSubmit: (values: AccountFormValues, preserveFields: SensitiveField[]) => Promise<void>;
  platforms: Platform[];
  projects: Project[];
  tags: Tag[];
  editingAccount: AccountWithRelations | null;
  defaultPlatformId?: number | null;
  onRequestNewPlatform: () => void;
  newlyCreatedPlatformId?: number | null;
  onNewPlatformConsumed?: () => void;
  onRequestNewProject: () => void;
  newlyCreatedProjectId?: number | null;
  onNewProjectConsumed?: () => void;
}

// Falha de forma segura (Fase 2): um campo cifrado que não decifra NUNCA é tratado como texto
// puro legado — o backend já migra dados legados automaticamente a cada desbloqueio
// (`migrate_plaintext_secrets`), então uma falha aqui indica corrupção/adulteração, e é
// reportada como tal em vez de exibir/gravar de volta um valor não confiável.
export const SENSITIVE_FIELDS = ["notes", "two_factor_phone", "two_factor_email", "two_factor_app", "two_factor_notes"] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

// Fase 4 (SECURITY_AUDIT_PHASE_4.md): busca notes/2FA já decifrados via commands específicos por
// `account_id` (`get_account_notes`/`get_account_two_factor_details`) — não existe mais um
// `decrypt_secret(ciphertext)` genérico para chamar aqui.
async function decryptSensitiveFields(accountId: number): Promise<{
  values: Record<SensitiveField, string>;
  failedFields: SensitiveField[];
}> {
  const [notesR, twoFactorR] = await Promise.all([
    tryFetch(() => accountSecretCommands.getNotes(accountId)),
    tryFetch(() => accountSecretCommands.getTwoFactorDetails(accountId)),
  ]);

  const values: Record<SensitiveField, string> = {
    notes: notesR.ok ? notesR.value : "",
    two_factor_phone: twoFactorR.ok ? twoFactorR.value.phone : "",
    two_factor_email: twoFactorR.ok ? twoFactorR.value.email : "",
    two_factor_app: twoFactorR.ok ? twoFactorR.value.app : "",
    two_factor_notes: twoFactorR.ok ? twoFactorR.value.notes : "",
  };
  const failedFields: SensitiveField[] = [];
  if (!notesR.ok) failedFields.push("notes");
  if (!twoFactorR.ok) {
    failedFields.push("two_factor_phone", "two_factor_email", "two_factor_app", "two_factor_notes");
  }
  return { values, failedFields };
}

function emptyValues(defaultPlatformId?: number | null): AccountFormValues {
  return {
    name: "",
    platform_id: defaultPlatformId ?? null,
    category: "",
    username: "",
    email: "",
    password: "",
    login_url: "",
    website_url: "",
    notes: "",
    favorite: false,
    tags: [],
    avatar_image_id: null,
    projectIds: [],
    status: "active",
    two_factor_enabled: false,
    two_factor_method: null,
    two_factor_phone: "",
    two_factor_email: "",
    two_factor_app: "",
    two_factor_notes: "",
  };
}

export function AccountForm({
  open,
  onClose,
  onSubmit,
  platforms,
  projects,
  tags,
  editingAccount,
  defaultPlatformId,
  onRequestNewPlatform,
  newlyCreatedPlatformId,
  onNewPlatformConsumed,
  onRequestNewProject,
  newlyCreatedProjectId,
  onNewProjectConsumed,
}: Props) {
  const [values, setValues] = useState<AccountFormValues>(emptyValues(defaultPlatformId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [decryptErrors, setDecryptErrors] = useState<SensitiveField[]>([]);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    if (!open) return;
    if (editingAccount) {
      const accountId = editingAccount.id;
      setDecryptErrors([]);
      setValues({
        id: editingAccount.id,
        name: editingAccount.name,
        platform_id: editingAccount.platform_id,
        category: editingAccount.category ?? "",
        username: editingAccount.username ?? "",
        email: editingAccount.email ?? "",
        password: "",
        login_url: editingAccount.login_url ?? "",
        website_url: editingAccount.website_url ?? "",
        // Cifrados no banco — descriptografados de forma assíncrona logo abaixo.
        notes: "",
        favorite: !!editingAccount.favorite,
        tags: editingAccount.tags.map((t) => t.name),
        avatar_image_id: editingAccount.avatar_image_id,
        projectIds: editingAccount.projects.map((p) => p.id),
        status: editingAccount.status,
        two_factor_enabled: !!editingAccount.two_factor_enabled,
        two_factor_method: editingAccount.two_factor_method,
        two_factor_phone: "",
        two_factor_email: "",
        two_factor_app: "",
        two_factor_notes: "",
      });

      decryptSensitiveFields(editingAccount.id).then(({ values: decrypted, failedFields }) => {
        setValues((v) => (v.id === accountId ? { ...v, ...decrypted } : v));
        setDecryptErrors(failedFields);
      });
    } else {
      setDecryptErrors([]);
      setValues(emptyValues(defaultPlatformId));
    }
    setError(null);
  }, [open, editingAccount, defaultPlatformId]);

  useEffect(() => {
    if (open && newlyCreatedPlatformId) {
      handlePlatformChange(newlyCreatedPlatformId);
      onNewPlatformConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newlyCreatedPlatformId]);

  useEffect(() => {
    if (open && newlyCreatedProjectId) {
      setValues((v) => (v.projectIds.includes(newlyCreatedProjectId) ? v : { ...v, projectIds: [...v.projectIds, newlyCreatedProjectId] }));
      onNewProjectConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newlyCreatedProjectId]);

  function handlePlatformChange(platformId: number | null) {
    const platform = platforms.find((p) => p.id === platformId) ?? null;
    setValues((v) => ({
      ...v,
      platform_id: platformId,
      login_url: v.login_url || platform?.login_url || "",
      website_url: v.website_url || platform?.website_url || "",
      category: v.category || platform?.name || "",
    }));
  }

  async function handleRevealCurrentPassword() {
    if (!editingAccount?.has_password) return;
    try {
      const plaintext = await accountSecretCommands.revealPassword(editingAccount.id);
      setValues((v) => ({ ...v, password: plaintext }));
    } catch (err) {
      push(`Não foi possível revelar a senha: ${String(err)}`, "error");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError("Informe um nome para a conta.");
      return;
    }
    setSaving(true);
    try {
      // Um campo que falhou ao descriptografar foi deixado em branco na UI; se o usuário não
      // digitou nada nele, preservamos o ciphertext original em vez de gravar "" por cima.
      const preserveFields = decryptErrors.filter((field) => !values[field].trim());
      await onSubmit(values, preserveFields);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingAccount ? "Editar conta" : "Adicionar conta"} width="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {decryptErrors.length > 0 && (
          <p className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-2.5 text-xs text-[var(--color-danger)]">
            {DECRYPTION_FAILED_MESSAGE} ({decryptErrors.length} campo(s) afetado(s)). Os campos foram deixados em
            branco para não sobrescrever o valor original — edite apenas o que pretende alterar.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Avatar
            imageId={values.avatar_image_id}
            platformIcon={platforms.find((p) => p.id === values.platform_id)?.icon}
            platformLogoImageId={platforms.find((p) => p.id === values.platform_id)?.logo_image_id}
            size={56}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => setAvatarPickerOpen(true)}>
            <ImagePlus size={14} /> Alterar imagem
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Nome da conta</Label>
            <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <Label>Plataforma</Label>
            <div className="flex gap-1.5">
              <select
                value={values.platform_id ?? ""}
                onChange={(e) => handlePlatformChange(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
              >
                <option value="">Selecione...</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={onRequestNewPlatform}>
                Nova
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Categoria</Label>
            <Input value={values.category} onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))} />
          </div>
          <div>
            <Label>Username</Label>
            <Input value={values.username} onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))} placeholder="@usuario" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Senha</Label>
              {editingAccount?.has_password && !values.password && (
                <button type="button" onClick={handleRevealCurrentPassword} className="flex items-center gap-1 text-xs text-[var(--color-accent)]">
                  <Eye size={12} /> Revelar atual
                </button>
              )}
            </div>
            <PasswordField
              value={values.password}
              onChange={(v) => setValues((s) => ({ ...s, password: v }))}
              placeholder={editingAccount ? "Deixe em branco para manter" : ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>URL de login</Label>
            <Input value={values.login_url} onChange={(e) => setValues((v) => ({ ...v, login_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div>
            <Label>URL principal da plataforma</Label>
            <Input value={values.website_url} onChange={(e) => setValues((v) => ({ ...v, website_url: e.target.value }))} placeholder="https://..." />
          </div>
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea rows={2} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
        </div>

        <div>
          <Label>Tags</Label>
          <TagPicker value={values.tags} onChange={(tags) => setValues((v) => ({ ...v, tags }))} suggestions={tags} />
        </div>

        <div>
          <Label>Projetos</Label>
          <div className="flex flex-wrap gap-1.5">
            {values.projectIds.map((id) => {
              const project = projects.find((p) => p.id === id);
              if (!project) return null;
              return (
                <span key={id} className="flex items-center gap-1 rounded-full bg-[var(--color-accent)]/12 px-2.5 py-1 text-xs text-[var(--color-accent)]">
                  {project.name}
                  <button
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, projectIds: v.projectIds.filter((pid) => pid !== id) }))}
                    className="hover:opacity-70"
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <select
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) setValues((v) => ({ ...v, projectIds: [...v.projectIds, id] }));
              }}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
            >
              <option value="">+ Associar projeto...</option>
              {projects
                .filter((p) => !values.projectIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <Button type="button" variant="secondary" onClick={onRequestNewProject}>
              Novo
            </Button>
          </div>
        </div>

        <div>
          <Label>Status</Label>
          <select
            value={values.status}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as AccountStatus }))}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          >
            {Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={values.two_factor_enabled}
              onChange={(e) => setValues((v) => ({ ...v, two_factor_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            Autenticação em dois fatores habilitada
          </label>

          {values.two_factor_enabled && (
            <div className="mt-3 space-y-3">
              <div>
                <Label>Método</Label>
                <select
                  value={values.two_factor_method ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, two_factor_method: (e.target.value || null) as TwoFactorMethod | null }))}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                >
                  <option value="">Selecione...</option>
                  {Object.entries(TWO_FACTOR_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {(values.two_factor_method === "sms" || values.two_factor_method === "whatsapp") && (
                <div>
                  <Label>Telefone utilizado</Label>
                  <Input
                    value={values.two_factor_phone}
                    onChange={(e) => setValues((v) => ({ ...v, two_factor_phone: e.target.value }))}
                    placeholder="+55 11 99999-9999"
                  />
                </div>
              )}

              {values.two_factor_method === "email" && (
                <div>
                  <Label>E-mail utilizado</Label>
                  <Input
                    value={values.two_factor_email}
                    onChange={(e) => setValues((v) => ({ ...v, two_factor_email: e.target.value }))}
                    placeholder={values.email || "email@exemplo.com"}
                  />
                </div>
              )}

              {values.two_factor_method === "authenticator" && (
                <div>
                  <Label>Aplicativo</Label>
                  <Input
                    value={values.two_factor_app}
                    onChange={(e) => setValues((v) => ({ ...v, two_factor_app: e.target.value }))}
                    placeholder="Google Authenticator, Authy, 1Password..."
                    list="authenticator-apps"
                  />
                  <datalist id="authenticator-apps">
                    <option value="Google Authenticator" />
                    <option value="Microsoft Authenticator" />
                    <option value="Authy" />
                    <option value="1Password" />
                    <option value="Bitwarden" />
                  </datalist>
                </div>
              )}

              <div>
                <Label>Observações</Label>
                <Input
                  value={values.two_factor_notes}
                  onChange={(e) => setValues((v) => ({ ...v, two_factor_notes: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={values.favorite}
            onChange={(e) => setValues((v) => ({ ...v, favorite: e.target.checked }))}
            className="h-4 w-4 rounded border-[var(--color-border)]"
          />
          Marcar como favorita
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>

      <AvatarPicker
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentImageId={values.avatar_image_id}
        onSelect={(imageId) => setValues((v) => ({ ...v, avatar_image_id: imageId }))}
      />
    </Modal>
  );
}
