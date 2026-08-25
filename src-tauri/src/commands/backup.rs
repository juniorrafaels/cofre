use crate::crypto::{self, KdfParams};
use crate::db;
use crate::state::VaultState;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

const MAGIC: &[u8; 8] = b"VLTBKUP1";

#[derive(Serialize, Deserialize)]
struct BackupPayload {
    vault_meta: Value,
    platforms: Vec<Value>,
    accounts: Vec<Value>,
    tags: Vec<Value>,
    account_tags: Vec<Value>,
    settings: Vec<Value>,
}

fn rows_to_json(conn: &Connection, sql: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count).map(|i| stmt.column_name(i).unwrap().to_string()).collect();

    let rows = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in col_names.iter().enumerate() {
                let value: Value = match row.get_ref(i)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => Value::from(n),
                    rusqlite::types::ValueRef::Real(f) => Value::from(f),
                    rusqlite::types::ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).to_string()),
                    rusqlite::types::ValueRef::Blob(b) => {
                        Value::from(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b))
                    }
                };
                map.insert(name.clone(), value);
            }
            Ok(Value::Object(map))
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_backup(app: AppHandle, state: State<VaultState>, out_path: String, backup_password: String) -> Result<(), String> {
    if !state.is_unlocked() {
        return Err("Desbloqueie o cofre antes de exportar um backup.".to_string());
    }
    if backup_password.len() < 8 {
        return Err("A senha do backup deve ter pelo menos 8 caracteres.".to_string());
    }

    let conn = db::open(&app)?;
    let vault_meta_rows = rows_to_json(&conn, "SELECT * FROM vault_meta")?;
    let vault_meta = vault_meta_rows.into_iter().next().unwrap_or(Value::Null);

    let payload = BackupPayload {
        vault_meta,
        platforms: rows_to_json(&conn, "SELECT * FROM platforms")?,
        accounts: rows_to_json(&conn, "SELECT * FROM accounts")?,
        tags: rows_to_json(&conn, "SELECT * FROM tags")?,
        account_tags: rows_to_json(&conn, "SELECT * FROM account_tags")?,
        settings: rows_to_json(&conn, "SELECT * FROM settings")?,
    };

    let json_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;

    let salt = crypto::random_bytes(crypto::SALT_LEN);
    let params = KdfParams::default();
    let key = crypto::derive_key(&backup_password, &salt, &params).map_err(|_| "Falha ao criptografar backup.".to_string())?;
    let encrypted = crypto::encrypt(&key, &json_bytes).map_err(|_| "Falha ao criptografar backup.".to_string())?;
    let params_json = serde_json::to_vec(&params).map_err(|e| e.to_string())?;

    let mut file = Vec::new();
    file.extend_from_slice(MAGIC);
    file.extend_from_slice(&(salt.len() as u32).to_le_bytes());
    file.extend_from_slice(&salt);
    file.extend_from_slice(&(params_json.len() as u32).to_le_bytes());
    file.extend_from_slice(&params_json);
    file.extend_from_slice(&encrypted);

    std::fs::write(&out_path, file).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_backup(app: AppHandle, state: State<VaultState>, in_path: String, backup_password: String) -> Result<(), String> {
    let bytes = std::fs::read(&in_path).map_err(|_| "Não foi possível ler o arquivo de backup.".to_string())?;

    if bytes.len() < 8 || &bytes[0..8] != MAGIC {
        return Err("Arquivo de backup inválido.".to_string());
    }
    let mut offset = 8;
    let salt_len = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    let salt = &bytes[offset..offset + salt_len];
    offset += salt_len;
    let params_len = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    let params: KdfParams = serde_json::from_slice(&bytes[offset..offset + params_len]).map_err(|_| "Arquivo de backup inválido.".to_string())?;
    offset += params_len;
    let encrypted = &bytes[offset..];

    let key = crypto::derive_key(&backup_password, salt, &params).map_err(|_| "Senha de backup incorreta.".to_string())?;
    let json_bytes = crypto::decrypt(&key, encrypted).map_err(|_| "Senha de backup incorreta ou arquivo corrompido.".to_string())?;
    let payload: BackupPayload = serde_json::from_slice(&json_bytes).map_err(|_| "Arquivo de backup inválido.".to_string())?;

    let mut conn = db::open(&app)?;
    db::init_schema(&conn)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(
        "DELETE FROM account_tags; DELETE FROM accounts; DELETE FROM tags; DELETE FROM platforms; DELETE FROM vault_meta;",
    )
    .map_err(|e| e.to_string())?;

    insert_rows(&tx, "platforms", &payload.platforms)?;
    insert_rows(&tx, "accounts", &payload.accounts)?;
    insert_rows(&tx, "tags", &payload.tags)?;
    insert_rows(&tx, "account_tags", &payload.account_tags)?;
    insert_rows(&tx, "settings", &payload.settings)?;
    if !payload.vault_meta.is_null() {
        insert_rows(&tx, "vault_meta", std::slice::from_ref(&payload.vault_meta))?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    state.clear();
    Ok(())
}

fn insert_rows(conn: &Connection, table: &str, rows: &[Value]) -> Result<(), String> {
    for row in rows {
        let obj = row.as_object().ok_or("Arquivo de backup inválido.")?;
        let columns: Vec<&String> = obj.keys().collect();
        let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            table,
            columns.iter().map(|c| c.as_str()).collect::<Vec<_>>().join(", "),
            placeholders.join(", ")
        );

        // Apenas colunas realmente declaradas como BLOB no schema (vault_meta) precisam ser
        // decodificadas de base64 de volta para bytes; encrypted_password já é TEXT (base64).
        let is_blob_col = |col: &str| col == "kdf_salt" || col == "wrapped_dek";

        let params: Vec<Box<dyn rusqlite::ToSql>> = columns
            .iter()
            .map(|c| -> Box<dyn rusqlite::ToSql> {
                let v = &obj[*c];
                if is_blob_col(c) {
                    if let Some(s) = v.as_str() {
                        if let Ok(b) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, s) {
                            return Box::new(b);
                        }
                    }
                }
                match v {
                    Value::Null => Box::new(Option::<String>::None),
                    Value::String(s) => Box::new(s.clone()),
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            Box::new(i)
                        } else {
                            Box::new(n.as_f64().unwrap_or(0.0))
                        }
                    }
                    _ => Box::new(Option::<String>::None),
                }
            })
            .collect();

        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
