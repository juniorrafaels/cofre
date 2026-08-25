import { useCallback, useEffect, useState } from "react";
import { HelpCircle, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SecurityQuestionForm } from "./SecurityQuestionForm";
import { ExportQuestionsDialog } from "./ExportQuestionsDialog";
import { listSecurityQuestions } from "../../lib/db";
import { securityQuestionCommands } from "../../lib/tauri";
import { useToastStore } from "../../store/useToastStore";
import type { SecurityQuestion } from "../../types";

const MAX_QUESTIONS = 20;

export function SecurityQuestionsSection() {
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SecurityQuestion | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SecurityQuestion | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const push = useToastStore((s) => s.push);

  const refresh = useCallback(async () => {
    const list = await listSecurityQuestions();
    setQuestions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit(question: string, answer?: string) {
    if (editing) {
      await securityQuestionCommands.update(editing.id, question, answer);
      push("Pergunta atualizada.", "success");
    } else {
      if (questions.length >= MAX_QUESTIONS) {
        push(`Você atingiu o limite de ${MAX_QUESTIONS} perguntas de segurança.`, "error");
        return;
      }
      await securityQuestionCommands.add(question, answer ?? "");
      push("Pergunta adicionada.", "success");
    }
    await refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await securityQuestionCommands.remove(pendingDelete.id);
    setPendingDelete(null);
    await refresh();
    push("Pergunta removida.", "success");
  }

  const limitReached = questions.length >= MAX_QUESTIONS;

  return (
    <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <HelpCircle size={15} /> Perguntas de segurança
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Usadas para recuperar o acesso ao cofre caso você esqueça a senha mestra. As respostas nunca são salvas em texto
        puro.
      </p>

      {!loading && (
        <p className="text-sm text-[var(--color-text)]">
          Você possui <strong>{questions.length}</strong> de {MAX_QUESTIONS} perguntas cadastradas.
        </p>
      )}

      <div className="space-y-1">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-hover)]">
            <span className="w-5 shrink-0 text-xs text-[var(--color-text-muted)]">{i + 1}.</span>
            <span className="flex-1 truncate text-sm">{q.question}</span>
            <button
              onClick={() => {
                setEditing(q);
                setFormOpen(true);
              }}
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setPendingDelete(q)}
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-danger)]"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={limitReached}
          title={limitReached ? `Você atingiu o limite de ${MAX_QUESTIONS} perguntas de segurança.` : undefined}
        >
          <Plus size={14} /> Adicionar pergunta
        </Button>
        {questions.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
            <Printer size={14} /> Exportar perguntas
          </Button>
        )}
      </div>
      {limitReached && <p className="text-xs text-[var(--color-danger)]">Você atingiu o limite de {MAX_QUESTIONS} perguntas de segurança.</p>}

      <SecurityQuestionForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editingQuestion={editing} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remover pergunta"
        message={`Tem certeza que deseja remover "${pendingDelete?.question}"? Isso pode reduzir suas opções de recuperação.`}
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ExportQuestionsDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
