import { FormEvent, useEffect, useState } from "react";
import { Eye, ImagePlus } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input, Label, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { AvatarPicker } from "./AvatarPicker";
import { PasswordField } from "./PasswordField";
import type { AccountFormValues, AccountWithRelations, Platform } from "../../types";
import { secretCommands } from "../../lib/tauri";
import { useToastStore } from "../../store/useToastStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: AccountFormValues) => Promise<void>;
  platforms: Platform[];
  editingAccount: AccountWithRelations | null;
  defaultPlatformId?: number | null;
  onRequestNewPlatform: () => void;
  newlyCreatedPlatformId?: number | null;
  onNewPlatformConsumed?: () => void;
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
  };
}

export function AccountForm({
  open,
  onClose,
  onSubmit,
  platforms,
  editingAccount,
  defaultPlatformId,
  onRequestNewPlatform,
  newlyCreatedPlatformId,
  onNewPlatformConsumed,
}: Props) {
  const [values, setValues] = useState<AccountFormValues>(emptyValues(defaultPlatformId));
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    if (!open) return;
    if (editingAccount) {
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
        notes: editingAccount.notes ?? "",
        favorite: !!editingAccount.favorite,
        tags: editingAccount.tags.map((t) => t.name),
        avatar_image_id: editingAccount.avatar_image_id,
      });
      setTagsInput(editingAccount.tags.map((t) => t.name).join(", "));
    } else {
      setValues(emptyValues(defaultPlatformId));
      setTagsInput("");
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
    if (!editingAccount?.encrypted_password) return;
    try {
      const plaintext = await secretCommands.decrypt(editingAccount.encrypted_password);
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
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await onSubmit({ ...values, tags });
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
        <div className="flex items-center gap-3">
          <Avatar
            imageId={values.avatar_image_id}
            platformIcon={platforms.find((p) => p.id === values.platform_id)?.icon}
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
              {editingAccount?.encrypted_password && !values.password && (
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
          <Label>Tags (separadas por vírgula)</Label>
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="fitness, principal, conteúdo" />
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
