import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Printer, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Input, Label } from "../ui/Input";
import { RecoveryKitDialog } from "./RecoveryKitDialog";
import { recoveryKeyCommands, type RecoveryKeyStatus } from "../../lib/tauri";
import { useCopy } from "../../lib/useCopy";
import { useToastStore } from "../../store/useToastStore";

type PendingAction = "generate" | "disable" | null;

export function RecoveryKeySection() {
  const [status, setStatus] = useState<RecoveryKeyStatus | null>(null);
  // Fase 4 (SECURITY_AUDIT_PHASE_4.md): gerar/desativar a Recovery Key exige reautenticação —
  // a senha mestra é conferida de verdade no comando Rust, não é um "já confirmei" do frontend.
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthSubmitting, setReauthSubmitting] = useState(false);
  // A chave só existe em memória do frontend entre gerar e fechar este diálogo — nunca é
  // persistida (nem localStorage), e é descartada assim que o usuário confirma que guardou.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [kitOpen, setKitOpen] = useState(false);
  const copy = useCopy();
  const push = useToastStore((s) => s.push);

  const refresh = useCallback(async () => {
    setStatus(await recoveryKeyCommands.status());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function closeReauth() {
    setPendingAction(null);
    setReauthPassword("");
    setReauthError(null);
  }

  async function handleReauthSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pendingAction) return;
    setReauthSubmitting(true);
    setReauthError(null);
    try {
      if (pendingAction === "generate") {
        const key = await recoveryKeyCommands.generate(reauthPassword);
        setFreshKey(key);
      } else {
        await recoveryKeyCommands.disable(reauthPassword);
        push("Recovery Key desativada.", "success");
      }
      closeReauth();
      await refresh();
    } catch (err) {
      setReauthError(String(err));
    } finally {
      setReauthSubmitting(false);
    }
  }

  function handleDoneWithFreshKey() {
    // Descarta o valor do estado do React — depois disso, ninguém (nem o próprio app) consegue
    // mais mostrar esta chave de novo; só resta gerar uma nova.
    setFreshKey(null);
  }

  return (
    <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound size={15} /> Recovery Key
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Uma chave aleatória de alta entropia (120 bits), gerada pelo próprio aplicativo, que permite recuperar o cofre
        se você esquecer a senha mestra — sem depender de perguntas de segurança. É o método de recuperação mais forte
        disponível: guarde-a impressa ou anotada, em local físico seguro, longe do computador.
      </p>

      {status?.enabled ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <Check size={15} className="shrink-0" />
          <span>
            Configurada{status.created_at ? ` em ${new Date(status.created_at).toLocaleDateString("pt-BR")}` : ""}.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={15} className="shrink-0" />
          <span>Nenhuma Recovery Key configurada. Sem ela, a recuperação depende só das perguntas de segurança.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPendingAction("generate")}>
          <RefreshCw size={14} /> {status?.enabled ? "Gerar nova (substitui a atual)" : "Gerar Recovery Key"}
        </Button>
        {status?.enabled && (
          <Button variant="secondary" size="sm" onClick={() => setPendingAction("disable")}>
            <ShieldOff size={14} /> Desativar
          </Button>
        )}
      </div>

      <Modal
        open={pendingAction !== null}
        onClose={closeReauth}
        title={pendingAction === "disable" ? "Desativar Recovery Key" : status?.enabled ? "Gerar nova Recovery Key" : "Gerar Recovery Key"}
        width="sm"
      >
        <form onSubmit={handleReauthSubmit} className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            {pendingAction === "disable"
              ? "Você não poderá mais usá-la para recuperar o cofre. Isso não afeta as perguntas de segurança, se configuradas."
              : status?.enabled
                ? "A Recovery Key atual deixará de funcionar imediatamente. Você precisará guardar a nova chave em um local seguro."
                : "Você verá a chave apenas uma vez, imediatamente após gerá-la. Guarde-a em um local físico seguro antes de fechar."}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Confirme sua senha mestra para continuar — esta é uma operação crítica que exige reautenticação.
          </p>
          <div>
            <Label>Senha mestra</Label>
            <Input
              type="password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              autoFocus
              disabled={reauthSubmitting}
            />
          </div>
          {reauthError && <p className="text-sm text-[var(--color-danger)]">{reauthError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeReauth} disabled={reauthSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" variant={pendingAction === "disable" ? "danger" : "primary"} disabled={!reauthPassword || reauthSubmitting}>
              {reauthSubmitting ? "Verificando..." : pendingAction === "disable" ? "Desativar" : "Gerar"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!freshKey} onClose={() => {}} title="Sua Recovery Key" width="sm">
        <div className="space-y-3">
          <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm">
              Esta chave só é exibida agora. Ela não fica salva em nenhum lugar em texto puro — nem o próprio aplicativo
              consegue mostrá-la de novo depois que você fechar esta janela.
            </p>
          </div>
          <p className="select-all rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3 text-center font-mono text-base tracking-wider">
            {freshKey}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => freshKey && copy(freshKey, "Recovery Key")}>
              <Copy size={13} /> Copiar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setKitOpen(true)}>
              <Printer size={13} /> Imprimir kit de recuperação
            </Button>
          </div>
          <Button variant="primary" className="w-full" onClick={handleDoneWithFreshKey}>
            Já guardei em local seguro
          </Button>
        </div>
      </Modal>

      <RecoveryKitDialog open={kitOpen} onClose={() => setKitOpen(false)} recoveryKey={freshKey} />
    </div>
  );
}
