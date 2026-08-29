use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Escreve no clipboard e, opcionalmente, agenda a limpeza automática. `pub(crate)` (não um
/// `#[tauri::command]`) porque é reaproveitada internamente por `accounts::copy_account_password`
/// e `properties::copy_sensitive_property` — cada um decifra o segredo específico que já buscou
/// no SQLite e só então chama esta função; nenhum ciphertext arbitrário chega até aqui vindo da
/// WebView (Fase 4 — ver SECURITY_AUDIT_PHASE_4.md).
pub(crate) fn write_and_schedule_clear(app: &AppHandle, text: String, clear_after_seconds: Option<u64>) -> Result<(), String> {
    app.clipboard()
        .write_text(text.clone())
        .map_err(|_| "Não foi possível copiar para a área de transferência.".to_string())?;

    if let Some(seconds) = clear_after_seconds {
        if seconds > 0 {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(seconds)).await;
                // Só limpa se o clipboard ainda contiver o mesmo valor copiado, para não apagar
                // algo que o usuário copiou depois. Esta leitura é interna ao processo Rust (não
                // passa pela ACL de IPC) — a WebView não tem mais permissão para ler o clipboard
                // diretamente (ver `capabilities/default.json`, removido `allow-read-text`).
                if let Ok(current) = app.clipboard().read_text() {
                    if current == text {
                        let _ = app.clipboard().clear();
                    }
                }
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn copy_to_clipboard(app: AppHandle, text: String, clear_after_seconds: Option<u64>) -> Result<(), String> {
    write_and_schedule_clear(&app, text, clear_after_seconds)
}
