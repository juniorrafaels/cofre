import { FormEvent, useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input, Label } from "../ui/Input";
import { Button } from "../ui/Button";
import { PlatformIcon } from "../ui/PlatformIcon";
import { AvatarPicker } from "../accounts/AvatarPicker";
import type { Platform } from "../../types";

export interface PlatformFormValues {
  name: string;
  icon: string;
  login_url: string;
  website_url: string;
  logo_image_id: number | null;
}

const ICON_OPTIONS = ["📸", "📘", "▶️", "📧", "🎵", "🐦", "🎮", "✈️", "💼", "🌐", "🔒", "💬", "🛒", "🎬", "📁"];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PlatformFormValues) => Promise<void>;
  editingPlatform: Platform | null;
}

function emptyValues(): PlatformFormValues {
  return { name: "", icon: "🌐", login_url: "", website_url: "", logo_image_id: null };
}

export function PlatformForm({ open, onClose, onSubmit, editingPlatform }: Props) {
  const [values, setValues] = useState<PlatformFormValues>(emptyValues());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingPlatform) {
      setValues({
        name: editingPlatform.name,
        icon: editingPlatform.icon ?? "🌐",
        login_url: editingPlatform.login_url ?? "",
        website_url: editingPlatform.website_url ?? "",
        logo_image_id: editingPlatform.logo_image_id,
      });
    } else {
      setValues(emptyValues());
    }
    setError(null);
  }, [open, editingPlatform]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      setError("Informe um nome para a plataforma.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingPlatform ? "Editar plataforma" : "Nova plataforma"} width="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Nome</Label>
          <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} autoFocus />
        </div>

        <div>
          <Label>Logo personalizada (opcional)</Label>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)]">
              <PlatformIcon icon={values.icon} logoImageId={values.logo_image_id} size={20} />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setLogoPickerOpen(true)}>
              <ImagePlus size={13} /> Escolher logo
            </Button>
            {values.logo_image_id && (
              <button
                type="button"
                onClick={() => setValues((v) => ({ ...v, logo_image_id: null }))}
                className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                title="Remover logo, usar ícone"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div>
          <Label>Ícone (usado quando não há logo)</Label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setValues((v) => ({ ...v, icon }))}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-base transition-colors ${
                  values.icon === icon
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>URL de login padrão</Label>
          <Input value={values.login_url} onChange={(e) => setValues((v) => ({ ...v, login_url: e.target.value }))} placeholder="https://..." />
        </div>
        <div>
          <Label>URL principal</Label>
          <Input value={values.website_url} onChange={(e) => setValues((v) => ({ ...v, website_url: e.target.value }))} placeholder="https://..." />
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>

      <AvatarPicker
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        currentImageId={values.logo_image_id}
        onSelect={(imageId) => setValues((v) => ({ ...v, logo_image_id: imageId }))}
      />
    </Modal>
  );
}
