use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[tauri::command]
pub fn copy_to_clipboard(app: AppHandle, text: String, clear_after_seconds: Option<u64>) -> Result<(), String> {
    app.clipboard()
        .write_text(text.clone())
        .map_err(|_| "Não foi possível copiar para a área de transferência.".to_string())?;

    if let Some(seconds) = clear_after_seconds {
        if seconds > 0 {
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(seconds)).await;
                // Só limpa se o clipboard ainda contiver o mesmo valor copiado,
                // para não apagar algo que o usuário copiou depois.
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
