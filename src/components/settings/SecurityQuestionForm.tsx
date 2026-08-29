import { FormEvent, useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Input, Label, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import type { SecurityQuestion } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  // Fase 4 (SECURITY_AUDIT_PHASE_4.md): adicionar/editar uma pergunta de segurança exige a senha
  // mestra atual, reverificada no Rust — alterar esse mecanismo de recuperação é uma operação
  // crítica.
  onSubmit: (currentPassword: string, question: string, answer?: string) => Promise<void>;
  editingQuestion: SecurityQuestion | null;
}

export function SecurityQuestionForm({ open, onClose, onSubmit, editingQuestion }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion(editingQuestion?.question ?? "");
    setAnswer("");
    setCurrentPassword("");
    setError(null);
  }, [open, editingQuestion]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) {
      setError("Informe a pergunta.");
      return;
    }
    if (!editingQuestion && !answer.trim()) {
      setError("Informe a resposta.");
      return;
    }
    if (!currentPassword) {
      setError("Confirme sua senha mestra para continuar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(currentPassword, question.trim(), answer.trim() || undefined);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingQuestion ? "Editar pergunta" : "Nova pergunta"} width="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Pergunta</Label>
          <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>Resposta{editingQuestion ? " (deixe em branco para manter a atual)" : ""}</Label>
          <Input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={editingQuestion ? "Nova resposta" : ""} />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            A resposta não é salva em texto puro — ela é usada para proteger criptograficamente parte da chave de
            recuperação. Ainda assim, quem roubar o banco de dados pode tentar adivinhar respostas offline, sem limite
            de tentativas. Para maior segurança, sua resposta não precisa ser a resposta verdadeira: use algo difícil
            de adivinhar ou pesquisar sobre você, e guarde sua própria cópia da resposta em local seguro (ex.: no
            mesmo lugar em que guardar a Recovery Key).
          </p>
        </div>

        <div>
          <Label>Sua senha mestra</Label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Confirme para salvar"
          />
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
