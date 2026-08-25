import { useEffect, useState } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { createPortal } from "react-dom";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { listSecurityQuestions } from "../../lib/db";
import type { SecurityQuestion } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExportQuestionsDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<"warning" | "sheet">("warning");
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);

  useEffect(() => {
    if (open) setStep("warning");
  }, [open]);

  async function handleConfirm() {
    const list = await listSecurityQuestions();
    setQuestions(list);
    setStep("sheet");
  }

  function handleCloseSheet() {
    setStep("warning");
    onClose();
  }

  if (open && step === "sheet") {
    return createPortal(
      <div className="fixed inset-0 z-[200] overflow-y-auto bg-[var(--color-bg)]">
        <div className="mx-auto max-w-2xl p-8">
          <div className="mb-6 flex items-center justify-between print:hidden">
            <Button variant="ghost" onClick={handleCloseSheet}>
              Fechar
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer size={15} /> Imprimir / Salvar como PDF
            </Button>
          </div>

          <div id="print-sheet" className="rounded-xl border border-[var(--color-border)] bg-white p-10 text-black print:border-0 print:p-0">
            <h1 className="mb-1 text-xl font-bold">Perguntas de segurança para recuperação</h1>
            <p className="mb-6 text-sm text-gray-600">
              Guarde este documento em local seguro e privado. Preencha as respostas à mão e não digitalize nem envie por
              e-mail ou mensageiro.
            </p>
            <ol className="space-y-5">
              {questions.map((q, i) => (
                <li key={q.id}>
                  <p className="font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <div className="mt-2 h-px w-full border-b border-dashed border-gray-400" />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Exportar perguntas de segurança" width="sm">
      <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">Atenção</p>
          <p className="mt-1">
            Este documento contém as perguntas usadas para recuperar o seu cofre. Guarde-o em um local seguro e privado.
          </p>
          <p className="mt-1">Não envie este arquivo por e-mail, WhatsApp, Discord ou outros serviços públicos.</p>
          <p className="mt-1">Recomenda-se imprimir e armazenar fisicamente em um local seguro.</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={handleConfirm}>
          Entendi, continuar
        </Button>
      </div>
    </Modal>
  );
}
