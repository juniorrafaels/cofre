use crate::commands::security_questions;
use crate::crypto::{self, KdfParams};
use crate::db;
use crate::state::VaultState;
use serde::Serialize;
use tauri::{AppHandle, State};
use zeroize::Zeroizing;

#[derive(Serialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

fn generic_error() -> String {
    "Senha incorreta.".to_string()
}

/// Confere uma senha candidata contra o `wrapped_dek` gravado no banco, decifrando-o de verdade
/// (não é uma comparação de flag) — mesma lógica que já existia embutida em
/// `change_master_password`, extraída aqui para ser reaproveitada por qualquer operação crítica
/// que precise reautenticar a senha mestra dentro do próprio comando (Recovery Key, perguntas de
/// segurança — ver SECURITY_AUDIT_PHASE_4.md). Retorna a DEK só para confirmar que a senha
/// realmente desembrulha o segredo certo; o chamador normalmente já tem a DEK via `state`.
pub fn verify_current_password(conn: &rusqlite::Connection, password: &Zeroizing<String>) -> Result<[u8; 32], String> {
    let (salt, params_json, wrapped_dek): (Vec<u8>, String, Vec<u8>) = conn
        .query_row(
            "SELECT kdf_salt, kdf_params, wrapped_dek FROM vault_meta WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "O cofre ainda não foi criado.".to_string())?;

    let params: KdfParams = serde_json::from_str(&params_json).map_err(|_| generic_error())?;
    let kek = crypto::derive_key(password, &salt, &params).map_err(|_| generic_error())?;
    let dek_bytes = crypto::decrypt(&kek, &wrapped_dek).map_err(|_| generic_error())?;
    if dek_bytes.len() != 32 {
        return Err(generic_error());
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);
    Ok(dek)
}

#[tauri::command]
pub fn vault_status(app: AppHandle, state: State<VaultState>) -> Result<VaultStatus, String> {
    let conn = db::open(&app)?;
    db::init_schema(&conn)?;
    let initialized: bool = conn
        .query_row("SELECT COUNT(*) FROM vault_meta WHERE id = 1", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|e| e.to_string())?
        > 0;
    Ok(VaultStatus { initialized, unlocked: state.is_unlocked() })
}

#[tauri::command]
pub fn create_vault(app: AppHandle, state: State<VaultState>, password: String) -> Result<(), String> {
    // Zeroing: a senha mestra em texto puro só existe nesta função pelo tempo da derivação da
    // KEK (Argon2id, ~300-500ms) — envolvê-la garante que os bytes sejam sobrescritos com zero
    // ao sair de escopo, em vez de ficarem na heap liberada até serem reaproveitados por outra
    // alocação (ver SECURITY_AUDIT_PHASE_3.md, seção "Memória/Zeroization" para limitações).
    let password = Zeroizing::new(password);
    if password.len() < 8 {
        return Err("A senha mestra deve ter pelo menos 8 caracteres.".to_string());
    }
    let conn = db::open(&app)?;
    db::init_schema(&conn)?;

    let existing: i64 = conn
        .query_row("SELECT COUNT(*) FROM vault_meta WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("O cofre já foi criado.".to_string());
    }

    let params = KdfParams::default();
    let salt = crypto::random_bytes(crypto::SALT_LEN);
    let kek = crypto::derive_key(&password, &salt, &params).map_err(|_| generic_error())?;

    let mut dek = [0u8; 32];
    dek.copy_from_slice(&crypto::random_bytes(32));
    let wrapped_dek = crypto::encrypt(&kek, &dek).map_err(|_| generic_error())?;

    let params_json = serde_json::to_string(&params).map_err(|e| e.to_string())?;
    let dek_check = security_questions::compute_dek_check(&dek)?;
    conn.execute(
        "INSERT INTO vault_meta (id, kdf_salt, kdf_params, wrapped_dek, dek_check, created_at) VALUES (1, ?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![salt, params_json, wrapped_dek, dek_check, db::now_iso()],
    )
    .map_err(|e| e.to_string())?;

    state.set_dek(dek);
    Ok(())
}

#[tauri::command]
pub fn unlock_vault(app: AppHandle, state: State<VaultState>, password: String) -> Result<(), String> {
    let password = Zeroizing::new(password);
    let conn = db::open(&app)?;
    let (salt, params_json, wrapped_dek): (Vec<u8>, String, Vec<u8>) = conn
        .query_row(
            "SELECT kdf_salt, kdf_params, wrapped_dek FROM vault_meta WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "O cofre ainda não foi criado.".to_string())?;

    let params: KdfParams = serde_json::from_str(&params_json).map_err(|_| generic_error())?;
    let kek = crypto::derive_key(&password, &salt, &params).map_err(|_| generic_error())?;
    let dek_bytes = crypto::decrypt(&kek, &wrapped_dek).map_err(|_| generic_error())?;

    if dek_bytes.len() != 32 {
        return Err(generic_error());
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);

    let has_check: Option<Vec<u8>> = conn
        .query_row("SELECT dek_check FROM vault_meta WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if has_check.is_none() {
        let dek_check = security_questions::compute_dek_check(&dek)?;
        conn.execute("UPDATE vault_meta SET dek_check = ?1 WHERE id = 1", rusqlite::params![dek_check])
            .map_err(|e| e.to_string())?;
    }

    // Auto-cura (Fase 2): re-cifra qualquer campo de conta que ainda esteja em texto puro de
    // versões anteriores (ex.: notes antes desta correção). Idempotente e barato depois da
    // primeira execução — ver `migration.rs`.
    crate::migration::migrate_plaintext_account_fields(&conn, &dek)?;

    state.set_dek(dek);
    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: State<VaultState>) -> Result<(), String> {
    state.clear();
    Ok(())
}

#[tauri::command]
pub fn change_master_password(
    app: AppHandle,
    state: State<VaultState>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    let current_password = Zeroizing::new(current_password);
    let new_password = Zeroizing::new(new_password);
    if new_password.len() < 8 {
        return Err("A nova senha mestra deve ter pelo menos 8 caracteres.".to_string());
    }
    let conn = db::open(&app)?;
    let dek = verify_current_password(&conn, &current_password)?;

    let new_salt = crypto::random_bytes(crypto::SALT_LEN);
    let new_params = KdfParams::default();
    let new_kek = crypto::derive_key(&new_password, &new_salt, &new_params).map_err(|_| generic_error())?;
    let new_wrapped_dek = crypto::encrypt(&new_kek, &dek).map_err(|_| generic_error())?;
    let new_params_json = serde_json::to_string(&new_params).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE vault_meta SET kdf_salt = ?1, kdf_params = ?2, wrapped_dek = ?3 WHERE id = 1",
        rusqlite::params![new_salt, new_params_json, new_wrapped_dek],
    )
    .map_err(|e| e.to_string())?;

    state.set_dek(dek);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_conn_with_password(password: &str) -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        db::init_schema(&conn).unwrap();
        let params = KdfParams { memory_kib: 8 * 1024, iterations: 1, parallelism: 1 };
        let salt = crypto::random_bytes(crypto::SALT_LEN);
        let password = Zeroizing::new(password.to_string());
        let kek = crypto::derive_key(&password, &salt, &params).unwrap();
        let dek = [5u8; 32];
        let wrapped_dek = crypto::encrypt(&kek, &dek).unwrap();
        let params_json = serde_json::to_string(&params).unwrap();
        conn.execute(
            "INSERT INTO vault_meta (id, kdf_salt, kdf_params, wrapped_dek, dek_check, created_at) VALUES (1, ?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![salt, params_json, wrapped_dek, dek.to_vec(), db::now_iso()],
        )
        .unwrap();
        conn
    }

    // Regressão de segurança (SECURITY_AUDIT_PHASE_4.md): a reautenticação exigida por
    // `generate_recovery_key`/`disable_recovery_key`/`add|update|delete_security_question` só
    // pode prosseguir se a senha mestra ATUAL realmente desembrulhar a DEK — não é um flag que a
    // WebView possa simplesmente afirmar como verdadeiro.
    #[test]
    fn verify_current_password_rejects_wrong_password() {
        let conn = fixture_conn_with_password("senha-correta-XSS_TEST");
        assert!(verify_current_password(&conn, &Zeroizing::new("senha-errada".to_string())).is_err());
    }

    #[test]
    fn verify_current_password_accepts_right_password_and_returns_dek() {
        let conn = fixture_conn_with_password("senha-correta-XSS_TEST");
        let dek = verify_current_password(&conn, &Zeroizing::new("senha-correta-XSS_TEST".to_string())).unwrap();
        assert_eq!(dek, [5u8; 32]);
    }
}
