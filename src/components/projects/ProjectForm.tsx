import { FormEvent, useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input, Label, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { AvatarPicker } from "../accounts/AvatarPicker";
import { TagPicker } from "../ui/TagPicker";
import type { ProjectFormValues, ProjectWithRelations, Tag } from "../../types";

const COLORS = ["#5b5bf0", "#e0454d", "#1ea672", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  editingProject: ProjectWithRelations | null;
  tags: Tag[];
}

function emptyValues(): ProjectFormValues {
  return { name: "", description: "", color: null, avatar_image_id: null, favorite: false, notes: "", tags: [] };
}

export function ProjectForm({ open, onClose, onSubmit, editingProject, tags }: Props) {
  const [values, setValues] = useState<ProjectFormValues>(emptyValues());
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingProject) {
      setValues({
        id: editingProject.id,
        name: editingProject.name,
        description: editingProject.description ?? "",
        color: editingProject.color,
        avatar_image_id: editingProject.avatar_image_id,
        favorite: !!editingProject.favorite,
        notes: editingProject.notes ?? "",
        tags: editingProject.tags.map((t) => t.name),
      });
    } else {
      setValues(emptyValues());
    }
    setError(null);
  }, [open, editingProject]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      setError("Informe um nome para o projeto.");
      return;
    }
    setSaving(true);
    setError(null);
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
    <Modal open={open} onClose={onClose} title={editingProject ? "Editar projeto" : "Novo projeto"} width="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar imageId={values.avatar_image_id} size={56} />
          <Button type="button" variant="secondary" size="sm" onClick={() => setAvatarPickerOpen(true)}>
            <ImagePlus size={14} /> Alterar imagem
          </Button>
        </div>

        <div>
          <Label>Nome</Label>
          <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} autoFocus />
        </div>

        <div>
          <Label>Descrição</Label>
          <Textarea rows={2} value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
        </div>

        <div>
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setValues((v) => ({ ...v, color: null }))}
              className={`h-7 w-7 rounded-full border-2 ${values.color === null ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"} bg-[var(--color-surface-hover)]`}
              title="Sem cor"
            />
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValues((v) => ({ ...v, color: c }))}
                className={`h-7 w-7 rounded-full border-2 ${values.color === c ? "border-[var(--color-text)]" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div>
          <Label>Tags</Label>
          <TagPicker value={values.tags} onChange={(t) => setValues((v) => ({ ...v, tags: t }))} suggestions={tags} />
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea rows={2} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={values.favorite}
            onChange={(e) => setValues((v) => ({ ...v, favorite: e.target.checked }))}
            className="h-4 w-4 rounded border-[var(--color-border)]"
          />
          Marcar como favorito
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
