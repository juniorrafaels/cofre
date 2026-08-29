import { FormEvent, useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Input, Label, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { PROPERTY_TYPE_LABELS, type PropertyDefinition, type PropertyType } from "../../types";

export interface EditingPropertyState {
  name: string;
  type: PropertyType;
  value: string;
  isSensitive: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; type: PropertyType; value: string; isSensitive: boolean }) => Promise<void>;
  definitions: PropertyDefinition[];
  editing?: EditingPropertyState | null;
}

export function AccountPropertyForm({ open, onClose, onSubmit, definitions, editing }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [value, setValue] = useState("");
  const [isSensitive, setIsSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setType(editing?.type ?? "text");
      setValue(editing?.value ?? "");
      setIsSensitive(editing?.isSensitive ?? false);
      setError(null);
    }
  }, [open, editing]);

  function handleSelectExisting(definitionName: string) {
    setName(definitionName);
    const def = definitions.find((d) => d.name === definitionName);
    if (def) setType(def.type);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome da propriedade.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), type, value, isSensitive });
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar propriedade" : "Adicionar propriedade"} width="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            list="property-definitions"
            autoFocus
            disabled={!!editing}
            placeholder="Telefone, E-mail de recuperação..."
          />
          <datalist id="property-definitions">
            {definitions.map((d) => (
              <option key={d.id} value={d.name} />
            ))}
          </datalist>
          {!editing && definitions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {definitions.slice(0, 6).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectExisting(d.name)}
                  className="rounded-full bg-[var(--color-surface-hover)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>Tipo</Label>
          <select
            value={type}
            disabled={!!editing}
            onChange={(e) => setType(e.target.value as PropertyType)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 disabled:opacity-60"
          >
            {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Valor</Label>
          {type === "boolean" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
            >
              <option value="">Selecione...</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          ) : type === "longtext" ? (
            <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
          ) : (
            <Input
              type={type === "date" ? "date" : type === "number" ? "number" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border)]" />
          Tratar como informação sensível
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Salvando..." : editing ? "Salvar" : "Adicionar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
