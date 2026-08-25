mod commands;
mod crypto;
mod db;
mod state;

use state::VaultState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::new())
        .invoke_handler(tauri::generate_handler![
            commands::vault::vault_status,
            commands::vault::create_vault,
            commands::vault::unlock_vault,
            commands::vault::lock_vault,
            commands::vault::change_master_password,
            commands::secret::encrypt_secret,
            commands::secret::decrypt_secret,
            commands::clipboard::copy_to_clipboard,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::images::import_image,
            commands::images::delete_image_file,
            commands::images::images_dir_path,
            commands::security_questions::security_questions_summary,
            commands::security_questions::add_security_question,
            commands::security_questions::update_security_question,
            commands::security_questions::delete_security_question,
            commands::security_questions::get_recovery_questions,
            commands::security_questions::attempt_vault_recovery,
            commands::security_questions::reset_master_password_after_recovery,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
