import { FormEvent, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { useVaultStore } from "../../store/useVaultStore";

function passwordStrength(password: string): { label: string; color: string; score: number } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: "Fraca", color: "bg-[var(--color-danger)]", score };
  if (score <= 3) return { label: "Razoável", color: "bg-amber-500", score };
  return { label: "Forte", color: "bg-[var(--color-success)]", score };
}

export function CreateMasterPassword() {
  const create = useVaultStore((s) => s.create);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha mestra deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await create(password);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-bg)]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-xl animate-scale-in">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Criar senha mestra</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Ela protege todo o seu cofre. Guarde-a bem — não é possível recuperá-la.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Senha mestra</Label>
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className={`h-full ${strength.color} transition-all`}
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">{strength.label}</span>
              </div>
            )}
          </div>
          <div>
            <Label>Confirmar senha</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}

        <Button type="submit" variant="primary" className="mt-5 w-full" disabled={loading}>
          {loading ? "Criando cofre..." : "Criar cofre"}
        </Button>
      </form>
    </div>
  );
}
