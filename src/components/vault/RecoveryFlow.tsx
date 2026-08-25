import { FormEvent, useEffect, useState } from "react";
import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { securityQuestionCommands } from "../../lib/tauri";
import { useVaultStore } from "../../store/useVaultStore";
import { useToastStore } from "../../store/useToastStore";
import type { RecoveryQuestion } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = "loading" | "unavailable" | "answering" | "submitting" | "reset-password" | "done";

export function RecoveryFlow({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [unavailableReason, setUnavailableReason] = useState("");
  const [questions, setQuestions] = useState<RecoveryQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [collected, setCollected] = useState<{ id: number; answer: string }[]>([]);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refreshVault = useVaultStore((s) => s.refresh);
  const push = useToastStore((s) => s.push);

  async function startFlow() {
    setStep("loading");
    setFailMessage(null);
    const summary = await securityQuestionCommands.summary();
    if (summary.count === 0) {
      setUnavailableReason(
        "Não existem perguntas de segurança cadastradas. Sem a senha mestra e sem um mecanismo de recuperação previamente configurado, os dados protegidos não podem ser recuperados.",
      );
      setStep("unavailable");
      return;
    }
    if (summary.count < summary.min_required_for_recovery) {
      setUnavailableReason(
        `São necessárias pelo menos ${summary.min_required_for_recovery} perguntas de segurança cadastradas para habilitar a recuperação. Você tem ${summary.count}.`,
      );
      setStep("unavailable");
      return;
    }
    const list = await securityQuestionCommands.getRecoveryQuestions();
    setQuestions(list);
    setCurrentIndex(0);
    setCurrentAnswer("");
    setCollected([]);
    setStep("answering");
  }

  useEffect(() => {
    if (open) startFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleNext(e: FormEvent) {
    e.preventDefault();
    const nextCollected = [...collected, { id: questions[currentIndex].id, answer: currentAnswer }];
    setCollected(nextCollected);
    setCurrentAnswer("");

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      submitAnswers(nextCollected);
    }
  }

  async function submitAnswers(answers: { id: number; answer: string }[]) {
    setStep("submitting");
    try {
      const outcome = await securityQuestionCommands.attemptRecovery(answers);
      if (outcome.success) {
        setStep("reset-password");
      } else {
        setFailMessage(outcome.message);
        setStep("answering");
        setCurrentIndex(0);
        setCurrentAnswer("");
        setCollected([]);
        const list = await securityQuestionCommands.getRecoveryQuestions();
        setQuestions(list);
      }
    } catch (err) {
      setFailMessage(String(err));
      setStep("answering");
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setResetError(null);
    if (newPassword.length < 8) {
      setResetError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    try {
      await securityQuestionCommands.resetPasswordAfterRecovery(newPassword);
      await refreshVault();
      push("Senha mestra redefinida com sucesso.", "success");
      setStep("done");
      onClose();
    } catch (err) {
      setResetError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Recuperação do cofre" width="sm">
      {step === "loading" && <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>}

      {step === "unavailable" && (
        <div className="space-y-3">
          <div className="flex gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm">{unavailableReason}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {(step === "answering" || step === "submitting") && questions.length > 0 && (
        <form onSubmit={handleNext} className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Para confirmar sua identidade, responda às perguntas de segurança.
          </p>
          {failMessage && <p className="text-sm text-[var(--color-danger)]">{failMessage}</p>}
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Pergunta {currentIndex + 1} de {questions.length}
          </p>
          <div>
            <Label>{questions[currentIndex]?.question}</Label>
            <Input value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} autoFocus disabled={step === "submitting"} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={!currentAnswer.trim() || step === "submitting"}>
              {step === "submitting" ? "Verificando..." : currentIndex + 1 < questions.length ? "Próxima" : "Concluir"}
            </Button>
          </div>
        </form>
      )}

      {step === "reset-password" && (
        <form onSubmit={handleResetPassword} className="space-y-3">
          <div className="flex gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm font-medium">Identidade confirmada! Você pode criar uma nova senha mestra.</p>
          </div>
          <div>
            <Label>Nova senha</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {resetError && <p className="text-sm text-[var(--color-danger)]">{resetError}</p>}
          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary" disabled={saving}>
              <KeyRound size={14} /> {saving ? "Salvando..." : "Alterar senha"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
