export interface Platform {
  id: number;
  name: string;
  icon: string | null;
  login_url: string | null;
  website_url: string | null;
  is_custom: number;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface SecurityQuestion {
  id: number;
  question: string;
  share_index: number;
  created_at: string;
}

export interface SecurityQuestionsSummary {
  count: number;
  max_allowed: number;
  min_required_for_recovery: number;
}

export interface RecoveryQuestion {
  id: number;
  question: string;
}

export interface RecoveryOutcome {
  success: boolean;
  message: string;
}

export interface ImageRecord {
  id: number;
  filename: string;
  original_name: string | null;
  hash: string;
  created_at: string;
}

export interface Account {
  id: number;
  name: string;
  platform_id: number | null;
  category: string | null;
  username: string | null;
  email: string | null;
  encrypted_password: string | null;
  login_url: string | null;
  website_url: string | null;
  notes: string | null;
  favorite: number;
  avatar_image_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AccountWithRelations extends Account {
  platform: Platform | null;
  tags: Tag[];
}

export interface AccountFormValues {
  id?: number;
  name: string;
  platform_id: number | null;
  category: string;
  username: string;
  email: string;
  password: string;
  login_url: string;
  website_url: string;
  notes: string;
  favorite: boolean;
  tags: string[];
  avatar_image_id: number | null;
}

export type VaultStatusKind = "loading" | "uninitialized" | "locked" | "unlocked";

export type ThemePreference = "light" | "dark" | "system";
export type ViewMode = "grid" | "list";

export interface AppSettings {
  theme: ThemePreference;
  autoLockMinutes: number;
  clipboardClearEnabled: boolean;
  clipboardClearSeconds: number;
  viewMode: ViewMode;
}

export type SortField = "name" | "created_at" | "updated_at";
export type SortDirection = "asc" | "desc";

export type ViewState =
  | { type: "dashboard" }
  | { type: "platform"; platformId: number }
  | { type: "favorites" }
  | { type: "settings" };
