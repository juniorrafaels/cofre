use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
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

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  avatar_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_projects (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, project_id)
);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE IF NOT EXISTS custom_property_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  definition_id INTEGER NOT NULL REFERENCES custom_property_definitions(id) ON DELETE CASCADE,
  value TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

-- Rastreia o ciclo de vida de cada plataforma oficial do Cofre (`PLATFORM_SEEDS`) nesta
-- instalação, independente do autoincrement `platforms.id` (que varia entre bancos). `status`
-- é 'provisioned_pending_image' (linha criada/vinculada, aguardando a cópia do asset padrão para
-- dentro de `images`), 'provisioned' (linha e imagem já resolvidas, nunca mais tocadas por
-- `provision_default_platforms`/`provision_default_platform_images`) ou 'removed' (o usuário
-- excluiu essa plataforma de propósito — não deve ser recriada em uma futura inicialização).
CREATE TABLE IF NOT EXISTS platform_seed_state (
  system_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform_id);
CREATE INDEX IF NOT EXISTS idx_accounts_favorite ON accounts(favorite);
CREATE INDEX IF NOT EXISTS idx_account_history_account ON account_history(account_id);
"#;

/// Uma plataforma oficial distribuída com o próprio Cofre. `system_key` é o identificador
/// estável entre instalações (diferente do `id` autoincrement, que varia de banco para banco) —
/// ver seção 11 do pedido de ajuste. `logo_resource` é o nome do arquivo dentro de
/// `src-tauri/resources/default-platform-images/`, resolvido em tempo de execução via
/// `app.path().resolve(_, BaseDirectory::Resource)`; `None` para a plataforma "Outros", que não
/// tem logo próprio.
///
/// Esta lista reflete exatamente as plataformas e imagens que já existiam cadastradas na
/// instalação de desenvolvimento em 2026-08-29 (ver relatório da tarefa) — não foram inventadas
/// novas categorias. A ORDEM do array é a ordem de `sort_order` para uma instalação nova.
struct PlatformSeed {
    system_key: &'static str,
    name: &'static str,
    icon: &'static str,
    login_url: &'static str,
    website_url: &'static str,
    logo_resource: Option<&'static str>,
}

const PLATFORM_SEEDS: &[PlatformSeed] = &[
    PlatformSeed {
        system_key: "instagram",
        name: "Instagram",
        icon: "📸",
        login_url: "https://www.instagram.com/accounts/login/",
        website_url: "https://www.instagram.com",
        logo_resource: Some("instagram.png"),
    },
    PlatformSeed {
        system_key: "outros",
        name: "Outros",
        icon: "🌐",
        login_url: "",
        website_url: "",
        logo_resource: None,
    },
    PlatformSeed {
        system_key: "gmail",
        name: "Gmail",
        icon: "📧",
        login_url: "https://accounts.google.com/signin",
        website_url: "https://mail.google.com",
        logo_resource: Some("gmail.webp"),
    },
    PlatformSeed {
        system_key: "threads",
        name: "Threads",
        icon: "🌐",
        login_url: "https://www.threads.com/",
        website_url: "https://www.threads.com/",
        logo_resource: Some("threads.png"),
    },
    PlatformSeed {
        system_key: "discord",
        name: "Discord",
        icon: "🎮",
        login_url: "https://discord.com/login",
        website_url: "https://discord.com",
        logo_resource: Some("discord.webp"),
    },
    PlatformSeed {
        system_key: "tiktok",
        name: "TikTok",
        icon: "🎵",
        login_url: "https://www.tiktok.com/login",
        website_url: "https://www.tiktok.com",
        logo_resource: Some("tiktok.png"),
    },
    PlatformSeed {
        system_key: "youtube",
        name: "YouTube",
        icon: "▶️",
        login_url: "https://accounts.google.com/ServiceLogin?service=youtube",
        website_url: "https://www.youtube.com",
        logo_resource: Some("youtube.png"),
    },
    PlatformSeed {
        system_key: "facebook",
        name: "Facebook",
        icon: "📘",
        login_url: "https://www.facebook.com/login/",
        website_url: "https://www.facebook.com",
        logo_resource: Some("facebook.webp"),
    },
    PlatformSeed {
        system_key: "telegram",
        name: "Telegram",
        icon: "✈️",
        login_url: "https://web.telegram.org/",
        website_url: "https://telegram.org",
        logo_resource: Some("telegram.webp"),
    },
    PlatformSeed {
        system_key: "outlook",
        name: "Outlook",
        icon: "🌐",
        login_url: "https://outlook.live.com/",
        website_url: "https://outlook.live.com/",
        logo_resource: Some("outlook.webp"),
    },
    PlatformSeed {
        system_key: "x_twitter",
        name: "X/Twitter",
        icon: "🐦",
        login_url: "https://x.com/i/flow/login",
        website_url: "https://x.com",
        logo_resource: Some("x_twitter.webp"),
    },
    PlatformSeed {
        system_key: "linkedin",
        name: "LinkedIn",
        icon: "💼",
        login_url: "https://www.linkedin.com/login",
        website_url: "https://www.linkedin.com",
        logo_resource: Some("linkedin.png"),
    },
    PlatformSeed {
        system_key: "kwai",
        name: "Kwai",
        icon: "🌐",
        login_url: "",
        website_url: "",
        logo_resource: Some("kwai.webp"),
    },
    PlatformSeed {
        system_key: "mastodon",
        name: "Mastodon",
        icon: "🌐",
        login_url: "https://mastodon.social/auth/sign_in",
        website_url: "https://mastodon.social/",
        logo_resource: Some("mastodon.webp"),
    },
    PlatformSeed {
        system_key: "pinterest",
        name: "Pinterest",
        icon: "🌐",
        login_url: "https://br.pinterest.com/",
        website_url: "https://br.pinterest.com/",
        logo_resource: Some("pinterest.png"),
    },
    PlatformSeed {
        system_key: "reddit",
        name: "Reddit",
        icon: "🌐",
        login_url: "https://www.reddit.com/login/",
        website_url: "https://www.reddit.com/",
        logo_resource: Some("reddit.png"),
    },
    PlatformSeed {
        system_key: "substack",
        name: "Substack",
        icon: "🌐",
        login_url: "https://substack.com/",
        website_url: "https://substack.com/",
        logo_resource: Some("substack.png"),
    },
    PlatformSeed {
        system_key: "truth_social",
        name: "Truth",
        icon: "🌐",
        login_url: "https://truthsocial.com/",
        website_url: "https://truthsocial.com/",
        logo_resource: Some("truth_social.png"),
    },
    PlatformSeed {
        system_key: "nostr",
        name: "nostr",
        icon: "🌐",
        login_url: "https://nostr.com/",
        website_url: "https://nostr.com/",
        logo_resource: Some("nostr.png"),
    },
];

pub fn init_schema(conn: &Connection) -> Result<(), String> {
    // WAL permite que múltiplas chamadas de commands concorrentes (cada uma abre sua própria
    // `Connection` via `db::open`) acessem o mesmo arquivo sem "database is locked". Antes da
    // Fase 3 isso também precisava coexistir com a conexão própria do `tauri-plugin-sql` usada
    // pela WebView; esse plugin foi removido (ver SECURITY_AUDIT_PHASE_3.md — toda a superfície
    // de SQL da WebView foi substituída por commands Rust dedicados), mas o WAL continua
    // necessário pela concorrência entre commands do próprio backend.
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    migrate_add_column(conn, "accounts", "avatar_image_id", "INTEGER REFERENCES images(id) ON DELETE SET NULL")?;
    migrate_add_column(conn, "vault_meta", "dek_check", "BLOB")?;
    migrate_add_column(conn, "accounts", "status", "TEXT NOT NULL DEFAULT 'active'")?;
    migrate_add_column(conn, "accounts", "deleted_at", "TEXT")?;
    migrate_add_column(conn, "accounts", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 0")?;
    migrate_add_column(conn, "accounts", "two_factor_method", "TEXT")?;
    migrate_add_column(conn, "accounts", "two_factor_phone", "TEXT")?;
    migrate_add_column(conn, "accounts", "two_factor_email", "TEXT")?;
    migrate_add_column(conn, "accounts", "two_factor_app", "TEXT")?;
    migrate_add_column(conn, "accounts", "two_factor_notes", "TEXT")?;
    migrate_add_column(conn, "images", "name", "TEXT")?;
    migrate_add_column(conn, "platforms", "logo_image_id", "INTEGER REFERENCES images(id) ON DELETE SET NULL")?;
    // Recovery Key (Fase 2): caminho de recuperação independente e de alta entropia, que
    // desembrulha a MESMA DEK sob uma KEK derivada da própria chave via Argon2id — reaproveita
    // exatamente os primitivos já usados pela senha mestra (ver SECURITY_AUDIT_PHASE_2.md).
    migrate_add_column(conn, "vault_meta", "recovery_key_salt", "BLOB")?;
    migrate_add_column(conn, "vault_meta", "recovery_key_kdf_params", "TEXT")?;
    migrate_add_column(conn, "vault_meta", "recovery_key_wrapped_dek", "BLOB")?;
    migrate_add_column(conn, "vault_meta", "recovery_key_check", "BLOB")?;
    migrate_add_column(conn, "vault_meta", "recovery_key_created_at", "TEXT")?;
    // Ordenação definida pelo usuário (Gerenciamento de Plataformas/Projetos). `backfill_sort_order`
    // abaixo garante que registros já existentes recebam uma posição inicial compatível com a
    // ordem em que já apareciam (em vez de todos caírem em 0), e só roda uma única vez por tabela.
    migrate_add_column(conn, "platforms", "sort_order", "INTEGER NOT NULL DEFAULT 0")?;
    migrate_add_column(conn, "projects", "sort_order", "INTEGER NOT NULL DEFAULT 0")?;
    // Identificador estável das plataformas oficiais do Cofre (ver `PlatformSeed`). NULL para
    // qualquer plataforma criada pelo usuário — nunca setado por `create_platform`/`update_platform`.
    migrate_add_column(conn, "platforms", "system_key", "TEXT")?;
    // Só pode ser criado depois que a coluna acima existe. Único apenas entre plataformas
    // oficiais (system_key IS NOT NULL); plataformas do usuário continuam NULL e nunca colidem
    // entre si aqui (índice parcial).
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_platforms_system_key ON platforms(system_key) WHERE system_key IS NOT NULL",
        [],
    )
    .map_err(|e| e.to_string())?;

    let recovery_row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM recovery_attempts WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if recovery_row_count == 0 {
        conn.execute("INSERT INTO recovery_attempts (id, failed_count, locked_until) VALUES (1, 0, NULL)", [])
            .map_err(|e| e.to_string())?;
    }

    backfill_sort_order(conn, "platforms", "platforms_sort_order_seeded", "SELECT id FROM platforms ORDER BY is_custom ASC, name ASC")?;
    backfill_sort_order(conn, "projects", "projects_sort_order_seeded", "SELECT id FROM projects ORDER BY name ASC")?;

    provision_default_platforms(conn)?;

    Ok(())
}

/// Garante que cada plataforma de `PLATFORM_SEEDS` exista nesta instalação, sem duplicar e sem
/// recriar uma que o usuário excluiu de propósito. Roda em toda inicialização (idempotente):
///
/// - Se `platform_seed_state.status = 'removed'` para esse `system_key`, não faz nada (o usuário
///   decidiu excluir essa plataforma — seção 18 do pedido de ajuste).
/// - Se já existe uma linha com esse `system_key`, não faz nada — nome, ícone, urls, ordem e logo
///   já provisionados uma vez nunca são tocados de novo (seção 10: não sobrescrever
///   personalização do usuário).
/// - Senão, tenta "adotar" uma linha pré-existente com o mesmo nome (case-insensitive) que ainda
///   não tem `system_key` — cobre tanto o banco atual desta instalação (que já tinha essas 19
///   plataformas cadastradas manualmente antes desta migração) quanto uma instalação antiga de
///   antes desta feature, ou uma restauração de um backup antigo. Só marca a imagem como
///   pendente se a linha adotada ainda não tiver `logo_image_id` (nunca sobrescreve uma logo que
///   o usuário já escolheu).
/// - Senão (nunca existiu e nunca foi removida), cria a linha do zero.
///
/// Só mexe em `platforms`/`platform_seed_state` — não toca em arquivos nem precisa de
/// `AppHandle`, por isso pode ser chamada por qualquer teste com uma `Connection` em memória. A
/// cópia efetiva do asset de imagem para `images`/AppData é feita depois, por
/// `provision_default_platform_images`, que processa as linhas marcadas aqui como
/// `provisioned_pending_image`.
fn provision_default_platforms(conn: &Connection) -> Result<(), String> {
    for seed in PLATFORM_SEEDS {
        let status: Option<String> = conn
            .query_row("SELECT status FROM platform_seed_state WHERE system_key = ?1", [seed.system_key], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if status.is_some() {
            continue;
        }

        let existing_id: Option<i64> = conn
            .query_row("SELECT id FROM platforms WHERE system_key = ?1", [seed.system_key], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if existing_id.is_some() {
            // Linha já vinculada mas o estado de seed foi perdido por algum motivo (ex.: banco
            // de uma versão intermediária). Só registra o estado, não mexe na linha.
            upsert_seed_state(conn, seed.system_key, "provisioned")?;
            continue;
        }

        let adopt_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM platforms WHERE system_key IS NULL AND lower(name) = lower(?1) ORDER BY id ASC LIMIT 1",
                [seed.name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some(id) = adopt_id {
            conn.execute("UPDATE platforms SET system_key = ?1 WHERE id = ?2", rusqlite::params![seed.system_key, id])
                .map_err(|e| e.to_string())?;
            let has_logo: bool = conn
                .query_row("SELECT logo_image_id FROM platforms WHERE id = ?1", [id], |row| row.get::<_, Option<i64>>(0))
                .map_err(|e| e.to_string())?
                .is_some();
            let needs_image = seed.logo_resource.is_some() && !has_logo;
            upsert_seed_state(conn, seed.system_key, if needs_image { "provisioned_pending_image" } else { "provisioned" })?;
            continue;
        }

        let next_order: i64 = conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM platforms", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO platforms (name, icon, login_url, website_url, is_custom, system_key, created_at, sort_order) \
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
            rusqlite::params![seed.name, seed.icon, seed.login_url, seed.website_url, seed.system_key, now_iso(), next_order],
        )
        .map_err(|e| e.to_string())?;
        upsert_seed_state(conn, seed.system_key, if seed.logo_resource.is_some() { "provisioned_pending_image" } else { "provisioned" })?;
    }
    Ok(())
}

fn upsert_seed_state(conn: &Connection, system_key: &str, status: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO platform_seed_state (system_key, status, updated_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(system_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
        rusqlite::params![system_key, status, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Chamado por `delete_platform` quando a linha excluída tinha um `system_key`: registra que o
/// usuário removeu essa plataforma oficial de propósito, para que uma inicialização futura não a
/// recrie (seção 18 do pedido de ajuste). Sem efeito para plataformas do usuário (sem
/// `system_key` — essas simplesmente deixam de existir, como já acontecia antes).
pub fn mark_platform_seed_removed(conn: &Connection, system_key: &str) -> Result<(), String> {
    upsert_seed_state(conn, system_key, "removed")
}

/// Copia, para cada plataforma oficial marcada como `provisioned_pending_image`, o asset padrão
/// correspondente (`resources/default-platform-images/<arquivo>`) para dentro da biblioteca de
/// imagens desta instalação (`images` + `$APPDATA/images`) — exatamente o mesmo mecanismo usado
/// para uma imagem importada manualmente (`import_image`/`create_image_record`), só que a origem
/// é um resource empacotado com o app em vez de um arquivo escolhido pelo usuário. Depois disso a
/// plataforma nunca mais depende do arquivo em `resources/`: a cópia em `$APPDATA/images` é quem
/// o frontend lê (`resolveImageSrc`), da mesma forma que qualquer outra imagem da biblioteca.
///
/// Precisa de `AppHandle` (para resolver o diretório de resources e o AppData), por isso não é
/// chamada pelos testes de schema puro — só pelos comandos que já rodam dentro do app de verdade
/// (`vault_status`, `create_vault`). A lógica testável sem `AppHandle` está em
/// `provision_default_platform_images_at`.
pub fn provision_default_platform_images(app: &AppHandle, conn: &Connection) -> Result<(), String> {
    let resource_root = app
        .path()
        .resolve("resources/default-platform-images", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let images_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "não foi possível resolver o diretório de dados do app".to_string())?
        .join("images");
    provision_default_platform_images_at(&resource_root, &images_dir, conn)
}

fn provision_default_platform_images_at(resource_root: &Path, images_dir: &Path, conn: &Connection) -> Result<(), String> {
    let pending: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT system_key FROM platform_seed_state WHERE status = 'provisioned_pending_image'")
            .map_err(|e| e.to_string())?;
        let mapped = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    for system_key in pending {
        let Some(seed) = PLATFORM_SEEDS.iter().find(|s| s.system_key == system_key) else { continue };
        let Some(resource_name) = seed.logo_resource else {
            upsert_seed_state(conn, &system_key, "provisioned")?;
            continue;
        };

        let resource_path = resource_root.join(resource_name);
        let bytes = match fs::read(&resource_path) {
            Ok(b) => b,
            // Asset ausente/ilegível (não deveria acontecer em uma build correta): não falha a
            // inicialização do app inteiro, só tenta de novo na próxima vez.
            Err(_) => continue,
        };

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = format!("{:x}", hasher.finalize());

        let existing_image_id: Option<i64> = conn
            .query_row("SELECT id FROM images WHERE hash = ?1", [&hash], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;

        let image_id = match existing_image_id {
            Some(id) => id,
            None => {
                let extension = Path::new(resource_name).extension().and_then(|e| e.to_str()).unwrap_or("png");
                let filename = format!("{hash}.{extension}");
                fs::create_dir_all(images_dir).map_err(|e| e.to_string())?;
                let target = images_dir.join(&filename);
                if !target.exists() {
                    fs::write(&target, &bytes).map_err(|e| e.to_string())?;
                }
                conn.execute(
                    "INSERT INTO images (filename, original_name, hash, created_at) VALUES (?1, NULL, ?2, ?3)",
                    rusqlite::params![filename, hash, now_iso()],
                )
                .map_err(|e| e.to_string())?;
                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "UPDATE platforms SET logo_image_id = ?1 WHERE system_key = ?2 AND logo_image_id IS NULL",
            rusqlite::params![image_id, system_key],
        )
        .map_err(|e| e.to_string())?;
        upsert_seed_state(conn, &system_key, "provisioned")?;
    }
    Ok(())
}

/// Dá uma posição inicial (`sort_order`) a registros que já existiam antes da coluna existir,
/// preservando a ordem em que já eram exibidos (`order_sql`). Roda no máximo uma vez por tabela:
/// a flag em `settings` (`flag_key`) evita que reordenações feitas pelo usuário sejam desfeitas
/// em uma inicialização futura do app.
fn backfill_sort_order(conn: &Connection, table: &str, flag_key: &str, order_sql: &str) -> Result<(), String> {
    let already_seeded: i64 = conn
        .query_row("SELECT COUNT(*) FROM settings WHERE key = ?1", [flag_key], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if already_seeded > 0 {
        return Ok(());
    }

    let ids: Vec<i64> = {
        let mut stmt = conn.prepare(order_sql).map_err(|e| e.to_string())?;
        let mapped = stmt.query_map([], |row| row.get::<_, i64>(0)).map_err(|e| e.to_string())?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    for (index, id) in ids.iter().enumerate() {
        conn.execute(
            &format!("UPDATE {table} SET sort_order = ?1 WHERE id = ?2"),
            rusqlite::params![index as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute("INSERT INTO settings (key, value) VALUES (?1, '1')", [flag_key])
        .map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn platform_row(conn: &Connection, system_key: &str) -> Option<(i64, String, Option<i64>, i64)> {
        conn.query_row(
            "SELECT id, name, logo_image_id, is_custom FROM platforms WHERE system_key = ?1",
            [system_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .unwrap()
    }

    fn seed_status(conn: &Connection, system_key: &str) -> Option<String> {
        conn.query_row("SELECT status FROM platform_seed_state WHERE system_key = ?1", [system_key], |row| row.get(0))
            .optional()
            .unwrap()
    }

    // Seção 7/8 do pedido de ajuste: uma instalação nova (banco vazio) já recebe as 19
    // plataformas oficiais, e rodar a inicialização de novo não duplica nada.
    #[test]
    fn fresh_install_gets_all_default_platforms_without_duplicating() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap();
        assert_eq!(count, PLATFORM_SEEDS.len() as i64);

        let (_, name, _, is_custom) = platform_row(&conn, "instagram").unwrap();
        assert_eq!(name, "Instagram");
        assert_eq!(is_custom, 0);
        assert_eq!(seed_status(&conn, "instagram").as_deref(), Some("provisioned_pending_image"));
        // "outros" não tem logo — já nasce totalmente provisionado, sem esperar por imagem.
        assert_eq!(seed_status(&conn, "outros").as_deref(), Some("provisioned"));

        init_schema(&conn).unwrap();
        let count_again: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap();
        assert_eq!(count_again, PLATFORM_SEEDS.len() as i64);
    }

    // Seção 2/11: um banco pré-existente (como o de desenvolvimento) que já tinha essas
    // plataformas cadastradas manualmente — algumas com o nome "oficial" original (is_custom=0,
    // sem logo) e outras criadas pelo próprio usuário (is_custom=1, já com logo escolhida) — deve
    // "adotar" essas linhas por nome em vez de criar duplicatas, e nunca sobrescrever uma logo
    // que já foi definida.
    #[test]
    fn preexisting_rows_are_adopted_by_name_not_duplicated() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        // Zera tudo que a própria init_schema já teria semeado, para simular um banco de uma
        // versão anterior a esta feature (só tinha as linhas abaixo, sem system_key nenhum).
        conn.execute_batch("DELETE FROM platforms; DELETE FROM platform_seed_state;").unwrap();

        conn.execute(
            "INSERT INTO images (filename, original_name, hash, created_at) VALUES ('user-logo.png', 'meu.png', 'user-logo-hash', 'now')",
            [],
        )
        .unwrap();
        let custom_logo_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO platforms (name, icon, login_url, website_url, is_custom, created_at, sort_order) \
             VALUES ('Instagram', '📸', '', '', 0, 'now', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO platforms (name, icon, login_url, website_url, is_custom, logo_image_id, created_at, sort_order) \
             VALUES ('Threads', '🌐', '', '', 1, ?1, 'now', 1)",
            [custom_logo_id],
        )
        .unwrap();

        provision_default_platforms(&conn).unwrap();

        let total: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap();
        // As 2 linhas adotadas + as 17 restantes criadas do zero = 19, nunca 21.
        assert_eq!(total, PLATFORM_SEEDS.len() as i64);

        let instagram_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM platforms WHERE name = 'Instagram'", [], |row| row.get(0)).unwrap();
        assert_eq!(instagram_count, 1, "não deve duplicar Instagram");
        assert_eq!(seed_status(&conn, "instagram").as_deref(), Some("provisioned_pending_image"));

        // Threads já tinha uma logo escolhida pelo usuário — continua exatamente a mesma.
        let (_, _, threads_logo, threads_is_custom) = platform_row(&conn, "threads").unwrap();
        assert_eq!(threads_logo, Some(custom_logo_id));
        assert_eq!(threads_is_custom, 1, "adoção não mexe em is_custom da linha existente");
        assert_eq!(seed_status(&conn, "threads").as_deref(), Some("provisioned"));
    }

    // Seção 18: se o usuário excluiu uma plataforma oficial de propósito, uma inicialização
    // futura não deve recriá-la.
    #[test]
    fn removed_default_platform_is_not_recreated() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        let (id, ..) = platform_row(&conn, "tiktok").unwrap();
        conn.execute("DELETE FROM platforms WHERE id = ?1", [id]).unwrap();
        mark_platform_seed_removed(&conn, "tiktok").unwrap();

        provision_default_platforms(&conn).unwrap();

        assert!(platform_row(&conn, "tiktok").is_none());
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap();
        assert_eq!(total, PLATFORM_SEEDS.len() as i64 - 1);
    }

    // Seção 9: uma futura versão do Cofre que adicione uma nova entrada a `PLATFORM_SEEDS` deve
    // conseguir criá-la numa instalação já existente, sem duplicar as demais.
    #[test]
    fn new_seed_entry_is_added_on_top_of_existing_install() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let before: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap();

        // Simula "esqueceu" de uma plataforma nova ainda não seedada nesta instalação.
        conn.execute("DELETE FROM platforms WHERE system_key = 'nostr'", []).unwrap();
        conn.execute("DELETE FROM platform_seed_state WHERE system_key = 'nostr'", []).unwrap();

        provision_default_platforms(&conn).unwrap();
        provision_default_platforms(&conn).unwrap(); // idempotente

        let after: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap();
        assert_eq!(after, before);
        assert!(platform_row(&conn, "nostr").is_some());
    }

    fn write_temp_png(dir: &std::path::Path, name: &str, contents: &[u8]) -> std::path::PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(contents).unwrap();
        path
    }

    // Seção 3/4/5: o asset oficial (dentro de `resources/`) é copiado para a biblioteca de
    // imagens da instalação (`images` + pasta de imagens do AppData) — e depois de copiado, a
    // plataforma não depende mais do arquivo de origem.
    #[test]
    fn provisions_image_from_resource_and_survives_source_deletion() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        let tmp = std::env::temp_dir().join(format!("cofre_test_resources_{}", std::process::id()));
        let resource_root = tmp.join("resources");
        let images_dir = tmp.join("appdata_images");
        write_temp_png(&resource_root, "instagram.png", b"fake-instagram-bytes");

        provision_default_platform_images_at(&resource_root, &images_dir, &conn).unwrap();

        let (_, _, logo_id, _) = platform_row(&conn, "instagram").unwrap();
        let logo_id = logo_id.expect("logo deveria ter sido provisionada");
        let filename: String = conn.query_row("SELECT filename FROM images WHERE id = ?1", [logo_id], |row| row.get(0)).unwrap();
        let copied_path = images_dir.join(&filename);
        assert!(copied_path.exists(), "arquivo deveria ter sido copiado para {images_dir:?}");
        assert_eq!(std::fs::read(&copied_path).unwrap(), b"fake-instagram-bytes");
        assert_eq!(seed_status(&conn, "instagram").as_deref(), Some("provisioned"));

        // Simula "apagar o arquivo original de Downloads": remove a fonte inteira.
        std::fs::remove_dir_all(&resource_root).unwrap();
        assert!(copied_path.exists(), "cópia na biblioteca de imagens não pode depender da origem");

        // Rodar de novo (ex.: próxima abertura do app) não falha nem tenta reprocessar — já
        // está 'provisioned', e a coluna logo_image_id já não é NULL.
        provision_default_platform_images_at(&resource_root, &images_dir, &conn).unwrap();
        let (_, _, logo_id_again, _) = platform_row(&conn, "instagram").unwrap();
        assert_eq!(logo_id_again, Some(logo_id));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    // Seção 19: se o usuário já tinha escolhido uma logo diferente para uma plataforma oficial
    // (logo_image_id não-nulo) antes da imagem padrão ser provisionada, o provisionamento não
    // pode sobrescrever essa escolha.
    #[test]
    fn does_not_overwrite_user_chosen_logo() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        conn.execute(
            "INSERT INTO images (filename, original_name, hash, created_at) VALUES ('custom.png', 'x.png', 'custom-logo-hash', 'now')",
            [],
        )
        .unwrap();
        let user_logo_id = conn.last_insert_rowid();
        conn.execute("UPDATE platforms SET logo_image_id = ?1 WHERE system_key = 'instagram'", [user_logo_id]).unwrap();
        // Continua pendente no estado (cenário: linha foi adotada nesta mesma leva, ver teste
        // acima) — o que importa é que a checagem `logo_image_id IS NULL` no UPDATE final
        // protege mesmo assim.
        upsert_seed_state(&conn, "instagram", "provisioned_pending_image").unwrap();

        let tmp = std::env::temp_dir().join(format!("cofre_test_resources2_{}", std::process::id()));
        let resource_root = tmp.join("resources");
        let images_dir = tmp.join("appdata_images");
        write_temp_png(&resource_root, "instagram.png", b"official-instagram-bytes");

        provision_default_platform_images_at(&resource_root, &images_dir, &conn).unwrap();

        let (_, _, logo_id, _) = platform_row(&conn, "instagram").unwrap();
        assert_eq!(logo_id, Some(user_logo_id), "logo escolhida pelo usuário não pode ser trocada");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    // Duas plataformas oficiais que usem exatamente o mesmo arquivo de imagem não devem gerar
    // duas cópias em `images`/AppData — reaproveita pelo hash, igual a `create_image_record`.
    #[test]
    fn reuses_existing_image_row_by_hash_instead_of_duplicating() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        let tmp = std::env::temp_dir().join(format!("cofre_test_resources3_{}", std::process::id()));
        let resource_root = tmp.join("resources");
        let images_dir = tmp.join("appdata_images");
        write_temp_png(&resource_root, "instagram.png", b"shared-bytes");
        write_temp_png(&resource_root, "gmail.webp", b"shared-bytes");

        provision_default_platform_images_at(&resource_root, &images_dir, &conn).unwrap();

        let images_count: i64 = conn.query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0)).unwrap();
        assert_eq!(images_count, 1);
        let (_, _, instagram_logo, _) = platform_row(&conn, "instagram").unwrap();
        let (_, _, gmail_logo, _) = platform_row(&conn, "gmail").unwrap();
        assert_eq!(instagram_logo, gmail_logo);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
