import { create } from "zustand";
import { getAllSettings, setSetting } from "../lib/db";
import type { AppSettings, ThemePreference, ViewMode } from "../types";

const DEFAULTS: AppSettings = {
  theme: "system",
  autoLockMinutes: 5,
  clipboardClearEnabled: true,
  clipboardClearSeconds: 20,
  viewMode: "grid",
};

interface SettingsStore extends AppSettings {
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  setAutoLockMinutes: (minutes: number) => Promise<void>;
  setClipboardClearEnabled: (enabled: boolean) => Promise<void>;
  setClipboardClearSeconds: (seconds: number) => Promise<void>;
  setViewMode: (mode: ViewMode) => Promise<void>;
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    const raw = await getAllSettings();
    const next: AppSettings = {
      theme: (raw.theme as ThemePreference) ?? DEFAULTS.theme,
      autoLockMinutes: raw.auto_lock_minutes ? Number(raw.auto_lock_minutes) : DEFAULTS.autoLockMinutes,
      clipboardClearEnabled: raw.clipboard_clear_enabled ? raw.clipboard_clear_enabled === "true" : DEFAULTS.clipboardClearEnabled,
      clipboardClearSeconds: raw.clipboard_clear_seconds ? Number(raw.clipboard_clear_seconds) : DEFAULTS.clipboardClearSeconds,
      viewMode: raw.view_mode === "list" ? "list" : DEFAULTS.viewMode,
    };
    applyTheme(next.theme);
    set({ ...next, loaded: true });
  },
  setTheme: async (theme) => {
    await setSetting("theme", theme);
    applyTheme(theme);
    set({ theme });
  },
  setAutoLockMinutes: async (minutes) => {
    await setSetting("auto_lock_minutes", String(minutes));
    set({ autoLockMinutes: minutes });
  },
  setClipboardClearEnabled: async (enabled) => {
    await setSetting("clipboard_clear_enabled", String(enabled));
    set({ clipboardClearEnabled: enabled });
  },
  setClipboardClearSeconds: async (seconds) => {
    await setSetting("clipboard_clear_seconds", String(seconds));
    set({ clipboardClearSeconds: seconds });
  },
  setViewMode: async (mode) => {
    await setSetting("view_mode", mode);
    set({ viewMode: mode });
  },
}));

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { theme } = useSettingsStore.getState();
    if (theme === "system") applyTheme("system");
  });
}
