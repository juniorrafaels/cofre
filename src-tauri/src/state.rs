use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

/// Limita a taxa de chamadas a operações de "revelar" (que devolvem o segredo em texto puro ao
/// JS, sob clique explícito do usuário) — não para impedir um XSS determinado (que pode esperar
/// a janela liberar e continuar), mas para transformar um dump automatizado instantâneo de todas
/// as contas em algo que leva bem mais tempo, dando uma chance real de o usuário notar algo
/// estranho ou bloquear o cofre no meio do caminho (ver SECURITY_AUDIT_PHASE_4.md, seção
/// "Reautenticação e rate limiting" para a justificativa completa e as limitações honestas disso).
/// Não é aplicado a `copy_*` (copiar não devolve nada ao JS) nem a leituras de metadados como
/// notes/2FA (abertas automaticamente ao visualizar uma conta — penalizar isso quebraria a UX).
pub struct RevealLimiter {
    window: Duration,
    max_calls: usize,
    calls: Mutex<VecDeque<Instant>>,
}

impl RevealLimiter {
    fn new(window: Duration, max_calls: usize) -> Self {
        Self { window, max_calls, calls: Mutex::new(VecDeque::new()) }
    }

    /// Registra uma nova tentativa e rejeita se já houve `max_calls` dentro da janela deslizante.
    /// Nunca bloqueia permanentemente: entradas mais antigas que a janela são descartadas a cada
    /// chamada, então o limite se libera sozinho com o tempo, sem precisar de um "reset" manual.
    pub fn check_and_record(&self) -> Result<(), String> {
        let now = Instant::now();
        let mut calls = self.calls.lock().unwrap();
        while let Some(&oldest) = calls.front() {
            if now.duration_since(oldest) > self.window {
                calls.pop_front();
            } else {
                break;
            }
        }
        if calls.len() >= self.max_calls {
            return Err("Muitas revelações em pouco tempo. Aguarde alguns segundos e tente novamente.".to_string());
        }
        calls.push_back(now);
        Ok(())
    }
}

pub struct VaultState {
    dek: Mutex<Option<Zeroizing<[u8; 32]>>>,
    pub reveal_limiter: RevealLimiter,
}

impl VaultState {
    pub fn new() -> Self {
        Self { dek: Mutex::new(None), reveal_limiter: RevealLimiter::new(Duration::from_secs(10), 25) }
    }

    pub fn is_unlocked(&self) -> bool {
        self.dek.lock().unwrap().is_some()
    }

    pub fn set_dek(&self, dek: [u8; 32]) {
        *self.dek.lock().unwrap() = Some(Zeroizing::new(dek));
    }

    pub fn clear(&self) {
        *self.dek.lock().unwrap() = None;
    }

    pub fn with_dek<T>(&self, f: impl FnOnce(&[u8; 32]) -> T) -> Option<T> {
        self.dek.lock().unwrap().as_ref().map(|dek| f(dek))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reveal_limiter_blocks_after_threshold_and_recovers() {
        let limiter = RevealLimiter::new(Duration::from_millis(50), 3);
        assert!(limiter.check_and_record().is_ok());
        assert!(limiter.check_and_record().is_ok());
        assert!(limiter.check_and_record().is_ok());
        assert!(limiter.check_and_record().is_err(), "a 4a chamada dentro da janela deveria ser bloqueada");

        std::thread::sleep(Duration::from_millis(60));
        assert!(limiter.check_and_record().is_ok(), "depois da janela expirar, deveria liberar de novo");
    }
}
