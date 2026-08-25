import { clipboardCommands } from "./tauri";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";

export function useCopy() {
  const clipboardClearEnabled = useSettingsStore((s) => s.clipboardClearEnabled);
  const clipboardClearSeconds = useSettingsStore((s) => s.clipboardClearSeconds);
  const push = useToastStore((s) => s.push);

  return async (text: string | null | undefined, label: string) => {
    if (!text) {
      push(`Nenhum(a) ${label.toLowerCase()} cadastrado(a).`, "error");
      return;
    }
    try {
      await clipboardCommands.copy(text, clipboardClearEnabled ? clipboardClearSeconds : undefined);
      push(
        clipboardClearEnabled ? `${label} copiado(a) — limpo em ${clipboardClearSeconds}s` : `${label} copiado(a)`,
        "success",
      );
    } catch (err) {
      push(`Falha ao copiar: ${String(err)}`, "error");
    }
  };
}
