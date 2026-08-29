import { FormEvent, useEffect, useState } from "react";
import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { securityQuestionCommands, recoveryKeyCommands } from "../../lib/tauri";
import { useVaultStore } from "../../store/useVaultStore";
import { useToastStore } from "../../store/useToastStore";
import type { RecoveryQuestion } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step =
  | "loading"
  | "unavailable"
  | "choose-method"
  | "recovery-key"
  | "answering"
  | "submitting"
  | "reset-password"
  | "done";

export function RecoveryFlow({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [unavailableReason, setUnavailableReason] = useState("");
  const [questionsAvailable, setQuestionsAvailable] = useState(false);
  const [recoveryKeyAvailable, setRecoveryKeyAvailable] = useState(false);
  const [questions, setQuestions] = useState<RecoveryQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [collected, setCollected] = useState<{ id: number; answer: string }[]>([]);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [recoveryKeyError, setRecoveryKeyError] = useState<string | null>(null);
  const [recoveryKeySubmitting, setRecoveryKeySubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refreshVault = useVaultStore((s) => s.refresh);
  const push = useToastStore((s) => s.push);

  async function startQuestionsFlow() {
    const list = await securityQuestionCommands.getRecoveryQuestions();
    setQuestions(list);
    setCurrentIndex(0);
    setCurrentAnswer("");
    setCollected([]);
    setFailMessage(null);
    setStep("answering");
  }

  async function startFlow() {
    setStep("loading");
    setFailMessage(null);
    const [summary, keyStatus] = await Promise.all([securityQuestionCommands.summary(), recoveryKeyCommands.status()]);
    const hasQuestions = summary.count >= summary.min_required_for_recovery;
    const hasRecoveryKey = keyStatus.enabled;
    setQuestionsAvailable(hasQuestions);
    setRecoveryKeyAvailable(hasRecoveryKey);

    if (!hasQuestions && !hasRecoveryKey) {
      setUnavailableReason(
        summary.count > 0
          ? `São necessárias pelo menos ${summary.min_required_for_recovery} perguntas de segurança cadastradas para habilitar a recuperação por perguntas. Você tem ${summary.count} e nenhuma Recovery Key configurada.`
          : "Nenhum mecanismo de recuperação foi configurado (nem Recovery Key, nem perguntas de segurança). Sem a senha mestra, os dados protegidos não podem ser recuperados.",
      );
      setStep("unavailable");
      return;
    }

    if (hasRecoveryKey && hasQuestions) {
      setStep("choose-method");
    } else if (hasRecoveryKey) {
      setStep("recovery-key");
    } else {
      await startQuestionsFlow();
    }
  }

  useEffect(() => {
    if (open) startFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleRecoveryKeySubmit(e: FormEvent) {
    e.preventDefault();
    setRecoveryKeySubmitting(true);
    setRecoveryKeyError(null);
    try {
      await recoveryKeyCommands.unlockWithKey(recoveryKeyInput);
      setRecoveryKeyInput("");
      setStep("reset-password");
    } catch (err) {
      setRecoveryKeyError(String(err));
    } finally {
      setRecoveryKeySubmitting(false);
    }
  }

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

      {step === "choose-method" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">Como você quer confirmar sua identidade?</p>
          <div className="space-y-2">
            <Button variant="primary" className="w-full justify-start" onClick={() => setStep("recovery-key")}>
              <KeyRound size={14} /> Usar minha Recovery Key
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={() => startQuestionsFlow()}>
              <ShieldCheck size={14} /> Responder perguntas de segurança
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {step === "recovery-key" && (
        <form onSubmit={handleRecoveryKeySubmit} className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Digite a Recovery Key gerada quando você a configurou. Hífens e maiúsculas/minúsculas não importam.
          </p>
          {recoveryKeyError && <p className="text-sm text-[var(--color-danger)]">{recoveryKeyError}</p>}
          <div>
            <Label>Recovery Key</Label>
            <Input
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
              autoFocus
              className="font-mono"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              disabled={recoveryKeySubmitting}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {questionsAvailable && (
              <Button type="button" variant="ghost" onClick={() => startQuestionsFlow()}>
                Usar perguntas em vez disso
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={!recoveryKeyInput.trim() || recoveryKeySubmitting}>
              {recoveryKeySubmitting ? "Verificando..." : "Confirmar"}
            </Button>
          </div>
        </form>
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
            {recoveryKeyAvailable && currentIndex === 0 && (
              <Button type="button" variant="ghost" onClick={() => setStep("recovery-key")}>
                Usar Recovery Key
              </Button>
            )}
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
