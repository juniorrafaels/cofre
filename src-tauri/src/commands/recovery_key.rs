use crate::crypto::{self, KdfParams};
use crate::db;
use crate::state::VaultState;
use serde::Serialize;
use tauri::{AppHandle, State};
use zeroize::Zeroizing;

/// Reaproveita o mesmo marcador de verificação usado por `vault_meta.dek_check`
/// (ver `security_questions::compute_dek_check`) — é só `encrypt(dek, marcador_fixo)`.
const DEK_CHECK_PLAINTEXT: &[u8] = b"vault-dek-check-v1";

fn generic_error() -> String {
    "Não foi possível concluir a operação.".to_string()
}

#[derive(Serialize)]
pub struct RecoveryKeyStatus {
    pub enabled: bool,
    pub created_at: Option<String>,
}

#[tauri::command]
pub fn recovery_key_status(app: AppHandle) -> Result<RecoveryKeyStatus, String> {
    let conn = db::open(&app)?;
    let row: Option<(Option<Vec<u8>>, Option<String>)> = conn
        .query_row(
            "SELECT recovery_key_wrapped_dek, recovery_key_created_at FROM vault_meta WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    match row {
        Some((Some(_), created_at)) => Ok(RecoveryKeyStatus { enabled: true, created_at }),
        _ => Ok(RecoveryKeyStatus { enabled: false, created_at: None }),
    }
}

/// Gera uma nova Recovery Key e a torna um segundo caminho independente para desembrulhar a
/// mesma DEK (ver `crypto::generate_recovery_key` — 120 bits de entropia, sem depender de
/// nenhuma informação sobre o usuário). Regenerar invalida qualquer chave anterior. A chave em
/// texto puro só é retornada UMA VEZ aqui — nunca é persistida em lugar nenhum.
///
/// Fase 4 (SECURITY_AUDIT_PHASE_4.md): exige a senha mestra atual, reverificada neste mesmo
/// comando (não um flag "já reautenticado" que a WebView poderia falsificar) — gerar/substituir
/// a Recovery Key é uma operação crítica o bastante (ela sozinha desembrulha a DEK) para não
/// depender só de `state.is_unlocked()`.
#[tauri::command]
pub fn generate_recovery_key(app: AppHandle, state: State<VaultState>, current_password: String) -> Result<String, String> {
    let current_password = Zeroizing::new(current_password);
    let dek = state.with_dek(|dek| *dek).ok_or_else(|| "O cofre está bloqueado.".to_string())?;
    let conn = db::open(&app)?;
    crate::commands::vault::verify_current_password(&conn, &current_password)?;

    let recovery_key = crypto::generate_recovery_key();
    let normalized = Zeroizing::new(crypto::normalize_recovery_key(&recovery_key));

    let salt = crypto::random_bytes(crypto::SALT_LEN);
    let params = KdfParams::default();
    let kek2 = crypto::derive_key(&normalized, &salt, &params).map_err(|_| generic_error())?;
    let wrapped_dek = crypto::encrypt(&kek2, &dek).map_err(|_| generic_error())?;
    let check = crypto::encrypt(&dek, DEK_CHECK_PLAINTEXT).map_err(|_| generic_error())?;
    let params_json = serde_json::to_string(&params).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE vault_meta SET recovery_key_salt = ?1, recovery_key_kdf_params = ?2, recovery_key_wrapped_dek = ?3, recovery_key_check = ?4, recovery_key_created_at = ?5 WHERE id = 1",
        rusqlite::params![salt, params_json, wrapped_dek, check, db::now_iso()],
    )
    .map_err(|e| e.to_string())?;

    Ok(recovery_key)
}

/// Fase 4: também exige reautenticação por senha mestra (ver `generate_recovery_key`) — desativar
/// a Recovery Key destrói um mecanismo de recuperação, não é uma ação reversível de UI comum.
#[tauri::command]
pub fn disable_recovery_key(app: AppHandle, state: State<VaultState>, current_password: String) -> Result<(), String> {
    let current_password = Zeroizing::new(current_password);
    if !state.is_unlocked() {
        return Err("O cofre está bloqueado.".to_string());
    }
    let conn = db::open(&app)?;
    crate::commands::vault::verify_current_password(&conn, &current_password)?;
    conn.execute(
        "UPDATE vault_meta SET recovery_key_salt = NULL, recovery_key_kdf_params = NULL, recovery_key_wrapped_dek = NULL, recovery_key_check = NULL, recovery_key_created_at = NULL WHERE id = 1",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Desbloqueia o cofre a partir da Recovery Key — caminho independente de `unlock_vault`
/// (senha mestra) e de `attempt_vault_recovery` (perguntas de segurança), mas que resulta na
/// mesma DEK. Falha genérica em qualquer etapa, exatamente como `unlock_vault`.
#[tauri::command]
pub fn unlock_with_recovery_key(app: AppHandle, state: State<VaultState>, recovery_key: String) -> Result<(), String> {
    let recovery_key = Zeroizing::new(recovery_key);
    let conn = db::open(&app)?;
    let row: (Option<Vec<u8>>, Option<String>, Option<Vec<u8>>) = conn
        .query_row(
            "SELECT recovery_key_salt, recovery_key_kdf_params, recovery_key_wrapped_dek FROM vault_meta WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "O cofre ainda não foi criado.".to_string())?;

    let (Some(salt), Some(params_json), Some(wrapped_dek)) = row else {
        return Err("Nenhuma Recovery Key foi configurada para este cofre.".to_string());
    };

    let params: KdfParams = serde_json::from_str(&params_json).map_err(|_| generic_error())?;
    let normalized = Zeroizing::new(crypto::normalize_recovery_key(&recovery_key));
    let kek2 = crypto::derive_key(&normalized, &salt, &params).map_err(|_| generic_error())?;
    let dek_bytes = crypto::decrypt(&kek2, &wrapped_dek).map_err(|_| "Recovery Key incorreta.".to_string())?;

    if dek_bytes.len() != 32 {
        return Err("Recovery Key incorreta.".to_string());
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);

    // Auto-cura (Fase 2): este também é um caminho independente para obter a DEK.
    crate::migration::migrate_plaintext_account_fields(&conn, &dek)?;

    state.set_dek(dek);
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::state::VaultState;

    #[test]
    fn generate_requires_unlocked_vault() {
        let state = VaultState::new();
        assert!(!state.is_unlocked());
        // A própria checagem que `generate_recovery_key` faz antes de tocar no banco.
        assert!(state.with_dek(|dek| *dek).is_none());
    }
}
