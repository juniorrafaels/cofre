import { FormEvent, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Input, Label } from "../ui/Input";
import { vaultCommands } from "../../lib/tauri";
import { useVaultStore } from "../../store/useVaultStore";
import { useToastStore } from "../../store/useToastStore";

const CONFIRM_WORD = "EXCLUIR";

type Step = "idle" | "password" | "confirm";

// Exclusão completa do cofre (Configurações → Dados → Zona de perigo). Duas confirmações
// independentes e sequenciais, como pedido:
//  1) senha mestra atual, reautenticada de verdade no Rust (`verify_master_password` decifra o
//     wrapped_dek — não é uma comparação de flag no frontend);
//  2) digitar exatamente "EXCLUIR".
// Só depois das duas o backend (`delete_vault`) reautentica a senha uma última vez e apaga tudo.
export function DeleteVaultSection() {
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const refreshVault = useVaultStore((s) => s.refresh);
  const push = useToastStore((s) => s.push);

  function resetAll() {
    setStep("idle");
    setPassword("");
    setPasswordError(null);
    setConfirmText("");
  }

  async function handleVerifyPassword(e: FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setPasswordError(null);
    try {
      await vaultCommands.verifyMasterPassword(password);
      setStep("confirm");
    } catch (err) {
      setPasswordError(String(err));
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await vaultCommands.deleteVault(password);
      resetAll();
      push("Cofre excluído. Você pode criar um novo agora.", "success");
      await refreshVault();
    } catch (err) {
      push(`Falha ao excluir o cofre: ${String(err)}`, "error");
      resetAll();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)]">
        <AlertTriangle size={15} /> Zona de perigo
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Excluir o cofre apaga permanentemente todas as contas, projetos, plataformas personalizadas, configurações e
        imagens desta instalação, e volta o aplicativo ao estado de uma primeira instalação. Essa ação não pode ser
        desfeita.
      </p>
      <Button variant="danger" size="sm" onClick={() => setStep("password")}>
        <Trash2 size={14} /> Excluir cofre
      </Button>

      <Modal open={step === "password"} onClose={resetAll} title="Excluir cofre — confirme sua senha" width="sm">
        <form onSubmit={handleVerifyPassword} className="space-y-3">
          <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm">
              Esta ação é irreversível. Todos os dados deste cofre serão apagados permanentemente. Antes de continuar,
              confirme sua senha mestra atual.
            </p>
          </div>
          <div>
            <Label>Senha mestra atual</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={verifying}
            />
          </div>
          {passwordError && <p className="text-sm text-[var(--color-danger)]">{passwordError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={resetAll} disabled={verifying}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={!password || verifying}>
              {verifying ? "Verificando..." : "Continuar"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={step === "confirm"} onClose={resetAll} title="Excluir cofre — confirmação final" width="sm">
        <div className="space-y-3">
          <div className="flex gap-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-[var(--color-danger)]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Esta é a última confirmação. Ao continuar, serão apagados:</p>
              <ul className="ml-4 mt-1.5 list-disc space-y-0.5">
                <li>Todas as contas cadastradas</li>
                <li>Todos os projetos</li>
                <li>Plataformas personalizadas</li>
                <li>Configurações do cofre</li>
                <li>Imagens e demais dados relacionados ao cofre</li>
              </ul>
              <p className="mt-1.5 font-medium">Não é possível desfazer.</p>
            </div>
          </div>
          <div>
            <Label>{`Digite "${CONFIRM_WORD}" para confirmar`}</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoFocus
              disabled={deleting}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={resetAll} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={confirmText !== CONFIRM_WORD || deleting} onClick={handleDelete}>
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
