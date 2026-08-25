import { invoke } from "@tauri-apps/api/core";
import { openUrl as openUrlPlugin } from "@tauri-apps/plugin-opener";
import type { RecoveryOutcome, RecoveryQuestion, SecurityQuestionsSummary } from "../types";

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
}

export const vaultCommands = {
  status: () => invoke<VaultStatus>("vault_status"),
  create: (password: string) => invoke<void>("create_vault", { password }),
  unlock: (password: string) => invoke<void>("unlock_vault", { password }),
  lock: () => invoke<void>("lock_vault"),
  changeMasterPassword: (currentPassword: string, newPassword: string) =>
    invoke<void>("change_master_password", { currentPassword, newPassword }),
};

export const secretCommands = {
  encrypt: (plaintext: string) => invoke<string>("encrypt_secret", { plaintext }),
  decrypt: (ciphertext: string) => invoke<string>("decrypt_secret", { ciphertext }),
};

export const clipboardCommands = {
  copy: (text: string, clearAfterSeconds?: number) =>
    invoke<void>("copy_to_clipboard", { text, clearAfterSeconds: clearAfterSeconds ?? null }),
};

export const backupCommands = {
  export: (outPath: string, backupPassword: string) =>
    invoke<void>("export_backup", { outPath, backupPassword }),
  import: (inPath: string, backupPassword: string) =>
    invoke<void>("import_backup", { inPath, backupPassword }),
};

export async function openLoginUrl(url: string) {
  if (!url) return;
  await openUrlPlugin(url);
}

export const securityQuestionCommands = {
  summary: () => invoke<SecurityQuestionsSummary>("security_questions_summary"),
  add: (question: string, answer: string) => invoke<void>("add_security_question", { question, answer }),
  update: (id: number, question: string, answer?: string) =>
    invoke<void>("update_security_question", { id, question, answer: answer || null }),
  remove: (id: number) => invoke<void>("delete_security_question", { id }),
  getRecoveryQuestions: () => invoke<RecoveryQuestion[]>("get_recovery_questions"),
  attemptRecovery: (answers: { id: number; answer: string }[]) =>
    invoke<RecoveryOutcome>("attempt_vault_recovery", { answers }),
  resetPasswordAfterRecovery: (newPassword: string) =>
    invoke<void>("reset_master_password_after_recovery", { newPassword }),
};
