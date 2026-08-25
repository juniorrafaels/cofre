use crate::crypto;
use crate::state::VaultState;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::State;

#[tauri::command]
pub fn encrypt_secret(state: State<VaultState>, plaintext: String) -> Result<String, String> {
    state
        .with_dek(|dek| {
            crypto::encrypt(dek, plaintext.as_bytes())
                .map(|bytes| B64.encode(bytes))
                .map_err(|_| "Falha ao criptografar.".to_string())
        })
        .ok_or_else(|| "O cofre está bloqueado.".to_string())?
}

#[tauri::command]
pub fn decrypt_secret(state: State<VaultState>, ciphertext: String) -> Result<String, String> {
    let bytes = B64.decode(ciphertext).map_err(|_| "Dados inválidos.".to_string())?;
    state
        .with_dek(|dek| {
            crypto::decrypt(dek, &bytes)
                .map(|plain| String::from_utf8_lossy(&plain).to_string())
                .map_err(|_| "Falha ao descriptografar.".to_string())
        })
        .ok_or_else(|| "O cofre está bloqueado.".to_string())?
}
