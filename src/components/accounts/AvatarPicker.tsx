import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { resolveImageSrc, pickAndImportImage, deleteImageFile } from "../../lib/images";
import { listImages, deleteImageRecord, countAccountsUsingImage, clearAvatarForImage } from "../../lib/db";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToastStore } from "../../store/useToastStore";
import type { ImageRecord } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (imageId: number | null) => void;
  currentImageId: number | null;
}

function LibraryThumb({
  image,
  selected,
  usageCount,
  onSelect,
  onDelete,
}: {
  image: ImageRecord;
  selected: boolean;
  usageCount: number;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    resolveImageSrc(image.filename).then(setSrc);
  }, [image.filename]);

  return (
    <div
      onClick={onSelect}
      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 ${
        selected ? "border-[var(--color-accent)]" : "border-transparent"
      }`}
    >
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
      {usageCount > 0 && (
        <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {usageCount}x
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export function AvatarPicker({ open, onClose, onSelect, currentImageId }: Props) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [pendingDelete, setPendingDelete] = useState<ImageRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [usage, setUsage] = useState<Record<number, number>>({});
  const push = useToastStore((s) => s.push);

  async function refresh() {
    const list = await listImages();
    setImages(list);
    const entries = await Promise.all(list.map(async (img) => [img.id, await countAccountsUsingImage(img.id)] as const));
    setUsage(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleImport() {
    setImporting(true);
    try {
      const image = await pickAndImportImage();
      if (image) {
        await refresh();
        onSelect(image.id);
        onClose();
      }
    } catch (err) {
      push(`Não foi possível importar a imagem: ${String(err)}`, "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await clearAvatarForImage(pendingDelete.id);
    await deleteImageRecord(pendingDelete.id);
    await deleteImageFile(pendingDelete.filename);
    setPendingDelete(null);
    await refresh();
    push("Imagem removida da biblioteca.", "success");
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Biblioteca de imagens" width="md">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-muted)]">Selecione uma imagem existente ou adicione uma nova.</p>
          <div className="flex gap-2">
            {currentImageId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSelect(null);
                  onClose();
                }}
              >
                <X size={13} /> Remover avatar
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={handleImport} disabled={importing}>
              <Plus size={13} /> {importing ? "Importando..." : "Adicionar nova imagem"}
            </Button>
          </div>
        </div>

        {images.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
            Nenhuma imagem na biblioteca ainda. Adicione uma para começar.
          </p>
        ) : (
          <div className="grid max-h-80 grid-cols-5 gap-2 overflow-y-auto">
            {images.map((image) => (
              <LibraryThumb
                key={image.id}
                image={image}
                selected={image.id === currentImageId}
                usageCount={usage[image.id] ?? 0}
                onSelect={() => {
                  onSelect(image.id);
                  onClose();
                }}
                onDelete={() => setPendingDelete(image)}
              />
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remover imagem"
        message="Essa imagem será removida da biblioteca e das contas que a utilizam como avatar."
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
