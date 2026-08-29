import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { PlatformIcon } from "../ui/PlatformIcon";
import { PlatformForm, type PlatformFormValues } from "./PlatformForm";
import type { Platform } from "../../types";
import { createPlatform, deletePlatform, reassignAccountsPlatform, updatePlatform } from "../../lib/db";
import { useToastStore } from "../../store/useToastStore";

interface Props {
  open: boolean;
  onClose: () => void;
  platforms: Platform[];
  countsByPlatform: Record<number, number>;
  onChanged: () => void;
}

function DeletePlatformDialog({
  platform,
  platforms,
  linkedCount,
  onCancel,
  onConfirm,
}: {
  platform: Platform;
  platforms: Platform[];
  linkedCount: number;
  onCancel: () => void;
  onConfirm: (reassignTo: number | null) => void;
}) {
  const [reassignTo, setReassignTo] = useState<string>("");
  const otherPlatforms = platforms.filter((p) => p.id !== platform.id);

  return (
    <Modal open onClose={onCancel} title="Excluir plataforma" width="sm">
      {linkedCount > 0 ? (
        <>
          <p className="text-sm text-[var(--color-text)]">
            Esta plataforma possui <strong>{linkedCount}</strong> {linkedCount === 1 ? "conta vinculada" : "contas vinculadas"}.
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Escolha para onde mover essas contas antes de excluir "{platform.name}", ou deixe sem plataforma.
          </p>
          <div className="mt-3">
            <select
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none"
            >
              <option value="">Deixar sem plataforma</option>
              {otherPlatforms.map((p) => (
                <option key={p.id} value={p.id}>
                  Mover para {p.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Tem certeza que deseja excluir "{platform.name}"? Essa ação não pode ser desfeita.</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={() => onConfirm(reassignTo ? Number(reassignTo) : null)}>
          Excluir
        </Button>
      </div>
    </Modal>
  );
}

export function PlatformManagerModal({ open, onClose, platforms, countsByPlatform, onChanged }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Platform | null>(null);
  const push = useToastStore((s) => s.push);

  async function handleSubmit(values: PlatformFormValues) {
    if (editing) {
      await updatePlatform(editing.id, values);
      push("Plataforma atualizada", "success");
    } else {
      await createPlatform(values);
      push("Plataforma criada", "success");
    }
    onChanged();
  }

  async function handleDelete(reassignTo: number | null) {
    if (!pendingDelete) return;
    if ((countsByPlatform[pendingDelete.id] ?? 0) > 0) {
      await reassignAccountsPlatform(pendingDelete.id, reassignTo);
    }
    await deletePlatform(pendingDelete.id);
    setPendingDelete(null);
    onChanged();
    push("Plataforma excluída", "success");
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Gerenciar plataformas" width="md">
        <div className="mb-3 flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={15} /> Nova plataforma
          </Button>
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {platforms.map((platform) => (
            <div key={platform.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--color-surface-hover)]">
              <PlatformIcon icon={platform.icon} logoImageId={platform.logo_image_id} size={17} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{platform.name}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{countsByPlatform[platform.id] ?? 0} contas</p>
              </div>
              <button
                onClick={() => {
                  setEditing(platform);
                  setFormOpen(true);
                }}
                className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setPendingDelete(platform)}
                className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-danger)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Modal>

      <PlatformForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editingPlatform={editing} />

      {pendingDelete && (
        <DeletePlatformDialog
          platform={pendingDelete}
          platforms={platforms}
          linkedCount={countsByPlatform[pendingDelete.id] ?? 0}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
