use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const DB_FILE_NAME: &str = "vault.db";

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "não foi possível resolver o diretório de dados do app".to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DB_FILE_NAME))
}

pub fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    Connection::open(path).map_err(|e| e.to_string())
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS vault_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kdf_salt BLOB NOT NULL,
  kdf_params TEXT NOT NULL,
  wrapped_dek BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT,
  login_url TEXT,
  website_url TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  platform_id INTEGER REFERENCES platforms(id) ON DELETE SET NULL,
  category TEXT,
  username TEXT,
  email TEXT,
  encrypted_password TEXT,
  login_url TEXT,
  website_url TEXT,
  notes TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT,
  hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS account_tags (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, tag_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  share_index INTEGER NOT NULL UNIQUE,
  answer_salt BLOB NOT NULL,
  kdf_params TEXT NOT NULL,
  wrapped_share BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_attempts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform_id);
CREATE INDEX IF NOT EXISTS idx_accounts_favorite ON accounts(favorite);
"#;

const DEFAULT_PLATFORMS: &[(&str, &str, &str, &str)] = &[
    ("Instagram", "📸", "https://www.instagram.com/accounts/login/", "https://www.instagram.com"),
    ("Facebook", "📘", "https://www.facebook.com/login/", "https://www.facebook.com"),
    ("YouTube", "▶️", "https://accounts.google.com/ServiceLogin?service=youtube", "https://www.youtube.com"),
    ("Gmail", "📧", "https://accounts.google.com/signin", "https://mail.google.com"),
    ("TikTok", "🎵", "https://www.tiktok.com/login", "https://www.tiktok.com"),
    ("X/Twitter", "🐦", "https://x.com/i/flow/login", "https://x.com"),
    ("Discord", "🎮", "https://discord.com/login", "https://discord.com"),
    ("Telegram", "✈️", "https://web.telegram.org/", "https://telegram.org"),
    ("LinkedIn", "💼", "https://www.linkedin.com/login", "https://www.linkedin.com"),
    ("Outros", "🌐", "", ""),
];

pub fn init_schema(conn: &Connection) -> Result<(), String> {
    // WAL permite que a conexão do Rust (comandos do cofre) e a do frontend
    // (tauri-plugin-sql) acessem o mesmo arquivo concorrentemente sem "database is locked".
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    migrate_add_column(conn, "accounts", "avatar_image_id", "INTEGER REFERENCES images(id) ON DELETE SET NULL")?;
    migrate_add_column(conn, "vault_meta", "dek_check", "BLOB")?;

    let recovery_row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM recovery_attempts WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if recovery_row_count == 0 {
        conn.execute("INSERT INTO recovery_attempts (id, failed_count, locked_until) VALUES (1, 0, NULL)", [])
            .map_err(|e| e.to_string())?;
    }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if count == 0 {
        let now = now_iso();
        for (name, icon, login_url, website_url) in DEFAULT_PLATFORMS {
            conn.execute(
                "INSERT INTO platforms (name, icon, login_url, website_url, is_custom, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                rusqlite::params![name, icon, login_url, website_url, now],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn migrate_add_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let existing: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    if !existing.iter().any(|c| c == column) {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}
