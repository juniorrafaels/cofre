use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct ImportImageResult {
    pub filename: String,
    pub hash: String,
    pub original_name: String,
}

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "não foi possível resolver o diretório de dados do app".to_string())?
        .join("images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn import_image(app: AppHandle, source_path: String) -> Result<ImportImageResult, String> {
    let source = PathBuf::from(&source_path);
    let bytes = fs::read(&source).map_err(|_| "Não foi possível ler o arquivo de imagem.".to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = format!("{:x}", hasher.finalize());

    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let filename = format!("{hash}.{extension}");

    let dir = images_dir(&app)?;
    let target = dir.join(&filename);
    if !target.exists() {
        fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    }

    let original_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("imagem")
        .to_string();

    Ok(ImportImageResult { filename, hash, original_name })
}

#[tauri::command]
pub fn delete_image_file(app: AppHandle, filename: String) -> Result<(), String> {
    let dir = images_dir(&app)?;
    let target = dir.join(&filename);
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn images_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(images_dir(&app)?.to_string_lossy().to_string())
}
