use std::sync::Mutex;
use zeroize::Zeroizing;

pub struct VaultState(pub Mutex<Option<Zeroizing<[u8; 32]>>>);

impl VaultState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn is_unlocked(&self) -> bool {
        self.0.lock().unwrap().is_some()
    }

    pub fn set_dek(&self, dek: [u8; 32]) {
        *self.0.lock().unwrap() = Some(Zeroizing::new(dek));
    }

    pub fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }

    pub fn with_dek<T>(&self, f: impl FnOnce(&[u8; 32]) -> T) -> Option<T> {
        self.0.lock().unwrap().as_ref().map(|dek| f(dek))
    }
}
