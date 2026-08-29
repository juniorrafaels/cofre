use crate::commands::vault::verify_current_password;
use crate::crypto::{self, KdfParams};
use crate::db;
use crate::state::VaultState;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use serde::{Deserialize, Serialize};
use sharks::{Share, Sharks};
use std::convert::TryFrom;
use tauri::{AppHandle, State};
use zeroize::Zeroizing;

pub const MAX_QUESTIONS: i64 = 20;
pub const RECOVERY_THRESHOLD: u8 = 3;
const RECOVERY_QUESTIONS_SHOWN: usize = 5;
const LOCKOUT_FAILURE_THRESHOLD: i64 = 5;
const LOCKOUT_MINUTES: i64 = 15;

const DEALER_CONTEXT: &[u8] = b"cofre-de-contas/security-questions-dealer/v1";
const DEK_CHECK_PLAINTEXT: &[u8] = b"vault-dek-check-v1";

fn generic_error() -> String {
    "Não foi possível concluir a operação.".to_string()
}

/// Recalcula, de forma determinística, o share nº `share_index` (1-based) do segredo (a DEK).
/// Como a seed é derivada da própria DEK, o mesmo índice sempre produz o mesmo share — não é
/// preciso guardar o polinômio nem reunir respostas antigas para adicionar/remover perguntas.
fn share_for_index(dek: &[u8; 32], share_index: i64) -> Vec<u8> {
    let seed = crypto::derive_deterministic_seed(dek, DEALER_CONTEXT);
    let mut rng = ChaCha20Rng::from_seed(seed);
    let sharks = Sharks(RECOVERY_THRESHOLD);
    let share = sharks
        .dealer_rng(dek.as_slice(), &mut rng)
        .nth((share_index - 1).max(0) as usize)
        .expect("iterador de shares é infinito");
    Vec::from(&share)
}

fn normalize_answer(answer: &str) -> Zeroizing<String> {
    Zeroizing::new(answer.trim().to_lowercase())
}

fn wrap_share(share_bytes: &[u8], answer: &str) -> Result<(Vec<u8>, String, Vec<u8>), String> {
    let salt = crypto::random_bytes(crypto::SALT_LEN);
    let params = KdfParams::default();
    let key = crypto::derive_key(&normalize_answer(answer), &salt, &params).map_err(|_| generic_error())?;
    let wrapped = crypto::encrypt(&key, share_bytes).map_err(|_| generic_error())?;
    let params_json = serde_json::to_string(&params).map_err(|e| e.to_string())?;
    Ok((salt, params_json, wrapped))
}

fn try_unwrap_share(answer: &str, salt: &[u8], params_json: &str, wrapped: &[u8]) -> Option<Vec<u8>> {
    let params: KdfParams = serde_json::from_str(params_json).ok()?;
    let key = crypto::derive_key(&normalize_answer(answer), salt, &params).ok()?;
    crypto::decrypt(&key, wrapped).ok().map(|z| z.to_vec())
}

#[derive(Serialize)]
pub struct SecurityQuestionsSummary {
    pub count: i64,
    pub max_allowed: i64,
    pub min_required_for_recovery: u8,
}

#[tauri::command]
pub fn security_questions_summary(app: AppHandle) -> Result<SecurityQuestionsSummary, String> {
    let conn = db::open(&app)?;
    db::init_schema(&conn)?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM security_questions", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(SecurityQuestionsSummary { count, max_allowed: MAX_QUESTIONS, min_required_for_recovery: RECOVERY_THRESHOLD })
}

/// Fase 4 (SECURITY_AUDIT_PHASE_4.md): adicionar/editar/remover pergunta de segurança agora
/// exige a senha mestra atual, reverificada no próprio comando — essas ações alteram um dos dois
/// mecanismos de recuperação do cofre, mesmo padrão de reautenticação aplicado à Recovery Key.
#[tauri::command]
pub fn add_security_question(
    app: AppHandle,
    state: State<VaultState>,
    current_password: String,
    question: String,
    answer: String,
) -> Result<(), String> {
    let current_password = Zeroizing::new(current_password);
    let answer = Zeroizing::new(answer);
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("A pergunta não pode ficar vazia.".to_string());
    }
    if answer.trim().is_empty() {
        return Err("A resposta não pode ficar vazia.".to_string());
    }

    let conn = db::open(&app)?;
    verify_current_password(&conn, &current_password)?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM security_questions", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count >= MAX_QUESTIONS {
        return Err("Você atingiu o limite de 20 perguntas de segurança.".to_string());
    }

    let next_index: i64 = conn
        .query_row("SELECT COALESCE(MAX(share_index), 0) + 1 FROM security_questions", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let (salt, params_json, wrapped) = state
        .with_dek(|dek| {
            let share_bytes = share_for_index(dek, next_index);
            wrap_share(&share_bytes, &answer)
        })
        .ok_or_else(|| "O cofre está bloqueado.".to_string())??;

    conn.execute(
        "INSERT INTO security_questions (question, share_index, answer_salt, kdf_params, wrapped_share, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![question, next_index, salt, params_json, wrapped, db::now_iso()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_security_question(
    app: AppHandle,
    state: State<VaultState>,
    current_password: String,
    id: i64,
    question: String,
    answer: Option<String>,
) -> Result<(), String> {
    let current_password = Zeroizing::new(current_password);
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("A pergunta não pode ficar vazia.".to_string());
    }

    let conn = db::open(&app)?;
    verify_current_password(&conn, &current_password)?;

    match answer.filter(|a| !a.trim().is_empty()).map(Zeroizing::new) {
        Some(new_answer) => {
            let share_index: i64 = conn
                .query_row("SELECT share_index FROM security_questions WHERE id = ?1", [id], |row| row.get(0))
                .map_err(|_| "Pergunta não encontrada.".to_string())?;

            let (salt, params_json, wrapped) = state
                .with_dek(|dek| {
                    let share_bytes = share_for_index(dek, share_index);
                    wrap_share(&share_bytes, &new_answer)
                })
                .ok_or_else(|| "O cofre está bloqueado.".to_string())??;

            conn.execute(
                "UPDATE security_questions SET question = ?1, answer_salt = ?2, kdf_params = ?3, wrapped_share = ?4 WHERE id = ?5",
                rusqlite::params![question, salt, params_json, wrapped, id],
            )
            .map_err(|e| e.to_string())?;
        }
        None => {
            conn.execute("UPDATE security_questions SET question = ?1 WHERE id = ?2", rusqlite::params![question, id])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn delete_security_question(app: AppHandle, state: State<VaultState>, current_password: String, id: i64) -> Result<(), String> {
    let current_password = Zeroizing::new(current_password);
    if !state.is_unlocked() {
        return Err("O cofre está bloqueado.".to_string());
    }
    let conn = db::open(&app)?;
    verify_current_password(&conn, &current_password)?;
    conn.execute("DELETE FROM security_questions WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct SecurityQuestionListItem {
    pub id: i64,
    pub question: String,
    pub share_index: i64,
    pub created_at: String,
}

/// Diferente de `get_recovery_questions` (usado durante o fluxo de recuperação, com o cofre
/// ainda BLOQUEADO, e que só mostra uma amostra de 5), este command lista TODAS as perguntas
/// cadastradas para a tela de gerenciamento em Configurações — por isso exige o cofre
/// desbloqueado. Nunca retorna `answer_salt`/`wrapped_share` (não há resposta nenhuma aqui).
#[tauri::command]
pub fn list_security_questions(app: AppHandle, state: State<VaultState>) -> Result<Vec<SecurityQuestionListItem>, String> {
    if !state.is_unlocked() {
        return Err("O cofre está bloqueado.".to_string());
    }
    let conn = db::open(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, question, share_index, created_at FROM security_questions ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], |row| {
            Ok(SecurityQuestionListItem { id: row.get(0)?, question: row.get(1)?, share_index: row.get(2)?, created_at: row.get(3)? })
        })
        .map_err(|e| e.to_string())?;
    mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct RecoveryQuestion {
    pub id: i64,
    pub question: String,
}

#[tauri::command]
pub fn get_recovery_questions(app: AppHandle) -> Result<Vec<RecoveryQuestion>, String> {
    let conn = db::open(&app)?;
    let mut stmt = conn.prepare("SELECT id, question FROM security_questions").map_err(|e| e.to_string())?;
    let mut all: Vec<RecoveryQuestion> = stmt
        .query_map([], |row| Ok(RecoveryQuestion { id: row.get(0)?, question: row.get(1)? }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut rng = rand::thread_rng();
    all.shuffle(&mut rng);
    all.truncate(RECOVERY_QUESTIONS_SHOWN);
    Ok(all)
}

#[derive(Deserialize)]
pub struct RecoveryAnswer {
    pub id: i64,
    pub answer: Zeroizing<String>,
}

#[derive(Serialize)]
pub struct RecoveryOutcome {
    pub success: bool,
    pub message: String,
}

fn recovery_lock_status(conn: &rusqlite::Connection) -> Result<(i64, Option<String>), String> {
    conn.query_row("SELECT failed_count, locked_until FROM recovery_attempts WHERE id = 1", [], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })
    .map_err(|e| e.to_string())
}

fn register_failed_attempt(conn: &rusqlite::Connection, failed_count: i64) -> Result<(), String> {
    let new_count = failed_count + 1;
    if new_count >= LOCKOUT_FAILURE_THRESHOLD {
        let locked_until = (chrono::Utc::now() + chrono::Duration::minutes(LOCKOUT_MINUTES)).to_rfc3339();
        conn.execute(
            "UPDATE recovery_attempts SET failed_count = 0, locked_until = ?1 WHERE id = 1",
            [locked_until],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute("UPDATE recovery_attempts SET failed_count = ?1 WHERE id = 1", [new_count])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn attempt_vault_recovery(
    app: AppHandle,
    state: State<VaultState>,
    answers: Vec<RecoveryAnswer>,
) -> Result<RecoveryOutcome, String> {
    let conn = db::open(&app)?;

    let (failed_count, locked_until) = recovery_lock_status(&conn)?;
    if let Some(locked_until) = locked_until {
        if let Ok(locked_at) = chrono::DateTime::parse_from_rfc3339(&locked_until) {
            let remaining = locked_at.with_timezone(&chrono::Utc) - chrono::Utc::now();
            if remaining.num_seconds() > 0 {
                let minutes = (remaining.num_seconds() as f64 / 60.0).ceil() as i64;
                return Ok(RecoveryOutcome {
                    success: false,
                    message: format!("Muitas tentativas incorretas. Tente novamente em {minutes} minuto(s)."),
                });
            }
            conn.execute("UPDATE recovery_attempts SET locked_until = NULL WHERE id = 1", [])
                .map_err(|e| e.to_string())?;
        }
    }

    let mut collected_shares: Vec<Share> = Vec::new();
    for answer in &answers {
        let row: Option<(Vec<u8>, String, Vec<u8>)> = conn
            .query_row(
                "SELECT answer_salt, kdf_params, wrapped_share FROM security_questions WHERE id = ?1",
                [answer.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        if let Some((salt, params_json, wrapped)) = row {
            if let Some(share_bytes) = try_unwrap_share(&answer.answer, &salt, &params_json, &wrapped) {
                if let Ok(share) = Share::try_from(share_bytes.as_slice()) {
                    collected_shares.push(share);
                }
            }
        }
    }

    if collected_shares.len() < RECOVERY_THRESHOLD as usize {
        register_failed_attempt(&conn, failed_count)?;
        return Ok(RecoveryOutcome {
            success: false,
            message: "Respostas insuficientes ou incorretas. Verifique e tente novamente.".to_string(),
        });
    }

    let sharks = Sharks(RECOVERY_THRESHOLD);
    let recovered = sharks.recover(collected_shares.iter());

    let dek_bytes = match recovered {
        Ok(bytes) if bytes.len() == 32 => bytes,
        _ => {
            register_failed_attempt(&conn, failed_count)?;
            return Ok(RecoveryOutcome {
                success: false,
                message: "Respostas insuficientes ou incorretas. Verifique e tente novamente.".to_string(),
            });
        }
    };
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);

    let dek_check: Option<Vec<u8>> = conn
        .query_row("SELECT dek_check FROM vault_meta WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if let Some(check) = dek_check {
        if crypto::decrypt(&dek, &check).map(|p| p.as_slice() == DEK_CHECK_PLAINTEXT).unwrap_or(false) == false {
            register_failed_attempt(&conn, failed_count)?;
            return Ok(RecoveryOutcome {
                success: false,
                message: "Respostas insuficientes ou incorretas. Verifique e tente novamente.".to_string(),
            });
        }
    }

    conn.execute("UPDATE recovery_attempts SET failed_count = 0, locked_until = NULL WHERE id = 1", [])
        .map_err(|e| e.to_string())?;

    // Auto-cura (Fase 2): a DEK também pode ser obtida por este caminho (sem nunca passar por
    // `unlock_vault`), então a migração precisa rodar aqui também.
    crate::migration::migrate_plaintext_account_fields(&conn, &dek)?;

    state.set_dek(dek);

    Ok(RecoveryOutcome { success: true, message: "Identidade confirmada.".to_string() })
}

#[tauri::command]
pub fn reset_master_password_after_recovery(app: AppHandle, state: State<VaultState>, new_password: String) -> Result<(), String> {
    let new_password = Zeroizing::new(new_password);
    if new_password.len() < 8 {
        return Err("A nova senha mestra deve ter pelo menos 8 caracteres.".to_string());
    }
    let dek = state.with_dek(|dek| *dek).ok_or_else(|| "Identidade ainda não confirmada.".to_string())?;

    let conn = db::open(&app)?;
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

    Ok(())
}

pub fn compute_dek_check(dek: &[u8; 32]) -> Result<Vec<u8>, String> {
    crypto::encrypt(dek, DEK_CHECK_PLAINTEXT).map_err(|_| "Falha ao preparar verificação da DEK.".to_string())
}
