use crate::commands::security_questions;
use crate::crypto::{self, KdfParams};
use crate::db;
use crate::state::VaultState;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Serialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

fn generic_error() -> String {
    "Senha incorreta.".to_string()
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
    if new_password.len() < 8 {
        return Err("A nova senha mestra deve ter pelo menos 8 caracteres.".to_string());
    }
    let conn = db::open(&app)?;
    let (salt, params_json, wrapped_dek): (Vec<u8>, String, Vec<u8>) = conn
        .query_row(
            "SELECT kdf_salt, kdf_params, wrapped_dek FROM vault_meta WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "O cofre ainda não foi criado.".to_string())?;

    let params: KdfParams = serde_json::from_str(&params_json).map_err(|_| generic_error())?;
    let current_kek = crypto::derive_key(&current_password, &salt, &params).map_err(|_| generic_error())?;
    let dek_bytes = crypto::decrypt(&current_kek, &wrapped_dek).map_err(|_| generic_error())?;
    if dek_bytes.len() != 32 {
        return Err(generic_error());
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);

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
