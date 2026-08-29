import { FormEvent, useState } from "react";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { Database, Layers, Lock, Monitor, Moon, Palette, Shield, Sun } from "lucide-react";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useVaultStore } from "../../store/useVaultStore";
import { vaultCommands, backupCommands } from "../../lib/tauri";
import { useToastStore } from "../../store/useToastStore";
import { SecurityQuestionsSection } from "./SecurityQuestionsSection";
import { RecoveryKeySection } from "./RecoveryKeySection";
import { TagsManagerSection } from "./TagsManagerSection";
import { ListColumnsConfig } from "./ListColumnsConfig";
import { PlatformManagerModal } from "../platforms/PlatformManagerModal";
import { PlatformIcon } from "../ui/PlatformIcon";
import type { Platform } from "../../types";
import clsx from "clsx";

const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60];

interface Props {
  platforms: Platform[];
  countsByPlatform: Record<number, number>;
  onPlatformsChanged: () => void;
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        {icon} {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-[var(--color-text)]">{label}</p>
        {description && <p className="text-xs text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsView({ platforms, countsByPlatform, onPlatformsChanged }: Props) {
  const settings = useSettingsStore();
  const lock = useVaultStore((s) => s.lock);
  const push = useToastStore((s) => s.push);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [platformManagerOpen, setPlatformManagerOpen] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      push("As novas senhas não coincidem.", "error");
      return;
    }
    setChangingPassword(true);
    try {
      await vaultCommands.changeMasterPassword(currentPassword, newPassword);
      push("Senha mestra alterada com sucesso.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      push(String(err), "error");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleExportBackup() {
    if (backupPassword.length < 8) {
      push("Defina uma senha de backup com pelo menos 8 caracteres.", "error");
      return;
    }
    const path = await saveDialog({
      title: "Exportar backup criptografado",
      defaultPath: "cofre-backup.vaultbackup",
      filters: [{ name: "Backup do Cofre", extensions: ["vaultbackup"] }],
    });
    if (!path) return;
    try {
      await backupCommands.export(path, backupPassword);
      push("Backup exportado com sucesso.", "success");
    } catch (err) {
      push(String(err), "error");
    }
  }

  async function handleImportBackup() {
    if (backupPassword.length < 8) {
      push("Informe a senha usada no backup.", "error");
      return;
    }
    const path = await openDialog({
      title: "Importar backup criptografado",
      filters: [{ name: "Backup do Cofre", extensions: ["vaultbackup"] }],
      multiple: false,
    });
    if (!path || Array.isArray(path)) return;
    try {
      await backupCommands.import(path, backupPassword);
      push("Backup importado. Desbloqueie o cofre novamente.", "success");
      await lock();
    } catch (err) {
      push(String(err), "error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <SectionCard icon={<Shield size={16} />} title="Segurança">
        <Row label="Bloquear cofre agora" description="Encerra a sessão desbloqueada imediatamente.">
          <Button variant="secondary" onClick={() => lock()}>
            <Lock size={14} /> Bloquear
          </Button>
        </Row>

        <Row label="Bloqueio automático" description="Tempo de inatividade até bloquear o cofre.">
          <select
            value={settings.autoLockMinutes}
            onChange={(e) => settings.setAutoLockMinutes(Number(e.target.value))}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none"
          >
            {AUTO_LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </Row>

        <Row label="Bloquear ao minimizar" description="Bloqueia imediatamente quando a janela é minimizada ou perde visibilidade.">
          <input
            type="checkbox"
            checked={settings.lockOnMinimize}
            onChange={(e) => settings.setLockOnMinimize(e.target.checked)}
            className="h-4 w-4"
          />
        </Row>

        <Row label="Limpar clipboard automaticamente" description="Apaga a área de transferência após copiar uma senha.">
          <input
            type="checkbox"
            checked={settings.clipboardClearEnabled}
            onChange={(e) => settings.setClipboardClearEnabled(e.target.checked)}
            className="h-4 w-4"
          />
        </Row>

        {settings.clipboardClearEnabled && (
          <Row label="Tempo para limpar o clipboard" description="Segundos após a cópia.">
            <select
              value={settings.clipboardClearSeconds}
              onChange={(e) => settings.setClipboardClearSeconds(Number(e.target.value))}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none"
            >
              {[10, 20, 30, 60].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </Row>
        )}

        <form onSubmit={handleChangePassword} className="space-y-2 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium">Alterar senha mestra</p>
          <div>
            <Label>Senha atual</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label>Nova senha</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button type="submit" variant="primary" disabled={changingPassword || !currentPassword || !newPassword}>
            {changingPassword ? "Alterando..." : "Alterar senha"}
          </Button>
        </form>

        <RecoveryKeySection />
        <SecurityQuestionsSection />
      </SectionCard>

      <SectionCard icon={<Layers size={16} />} title="Plataformas">
        <p className="text-xs text-[var(--color-text-muted)]">
          Gerencie as plataformas disponíveis para suas contas: crie novas, altere nome, ícone e URLs.
        </p>
        <div className="flex flex-wrap gap-2">
          {platforms.slice(0, 8).map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs">
              <PlatformIcon icon={p.icon} size={13} /> {p.name}
            </span>
          ))}
          {platforms.length > 8 && (
            <span className="rounded-full bg-[var(--color-surface-hover)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
              +{platforms.length - 8}
            </span>
          )}
        </div>
        <Button variant="secondary" onClick={() => setPlatformManagerOpen(true)}>
          Gerenciar plataformas
        </Button>
      </SectionCard>

      <TagsManagerSection onChanged={onPlatformsChanged} />

      <PlatformManagerModal
        open={platformManagerOpen}
        onClose={() => setPlatformManagerOpen(false)}
        platforms={platforms}
        countsByPlatform={countsByPlatform}
        onChanged={onPlatformsChanged}
      />

      <SectionCard icon={<Palette size={16} />} title="Aparência">
        <div className="flex gap-2">
          {(
            [
              { key: "light", label: "Claro", icon: <Sun size={14} /> },
              { key: "dark", label: "Escuro", icon: <Moon size={14} /> },
              { key: "system", label: "Sistema", icon: <Monitor size={14} /> },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => settings.setTheme(opt.key)}
              className={clsx(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
                settings.theme === opt.key
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]",
              )}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <p className="mb-2 text-sm font-medium">Visualização em lista</p>
          <ListColumnsConfig />
        </div>
      </SectionCard>

      <SectionCard icon={<Database size={16} />} title="Dados">
        <div>
          <Label>Senha do backup</Label>
          <Input type="password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} placeholder="Senha para proteger o arquivo" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportBackup} className="flex-1">
            Exportar backup
          </Button>
          <Button variant="secondary" onClick={handleImportBackup} className="flex-1">
            Restaurar backup
          </Button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          O backup contém todas as suas contas ainda criptografadas com a senha mestra atual, protegidas por mais uma
          camada com a senha de backup. Restaurar um backup substitui todos os dados do cofre atual.
        </p>
      </SectionCard>
    </div>
  );
}
