import { FormEvent, useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Input, Label } from "../ui/Input";
import { Button } from "../ui/Button";
import type { Platform } from "../../types";

export interface PlatformFormValues {
  name: string;
  icon: string;
  login_url: string;
  website_url: string;
}

const ICON_OPTIONS = ["📸", "📘", "▶️", "📧", "🎵", "🐦", "🎮", "✈️", "💼", "🌐", "🔒", "💬", "🛒", "🎬", "📁"];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PlatformFormValues) => Promise<void>;
  editingPlatform: Platform | null;
}

export function PlatformForm({ open, onClose, onSubmit, editingPlatform }: Props) {
  const [values, setValues] = useState<PlatformFormValues>({ name: "", icon: "globe", login_url: "", website_url: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingPlatform) {
      setValues({
        name: editingPlatform.name,
        icon: editingPlatform.icon ?? "globe",
        login_url: editingPlatform.login_url ?? "",
        website_url: editingPlatform.website_url ?? "",
      });
    } else {
      setValues({ name: "", icon: "globe", login_url: "", website_url: "" });
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
          <Label>Ícone</Label>
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
    </Modal>
  );
}
