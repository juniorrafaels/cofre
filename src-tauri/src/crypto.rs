use argon2::{Argon2, Params, Version, Algorithm};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce, Key,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zeroize::Zeroizing;

pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 24;
pub const KEY_LEN: usize = 32;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("senha incorreta ou dados corrompidos")]
    DecryptionFailed,
    #[error("falha interna de criptografia")]
    Internal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        // ~128 MiB, 3 iterations, 1 lane — alvo de ~300-500ms em hardware desktop comum.
        Self { memory_kib: 128 * 1024, iterations: 3, parallelism: 1 }
    }
}

pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    buf
}

/// Deriva uma chave de 32 bytes da senha mestra usando Argon2id.
pub fn derive_key(password: &str, salt: &[u8], params: &KdfParams) -> Result<Zeroizing<[u8; KEY_LEN]>, CryptoError> {
    let argon2_params = Params::new(params.memory_kib, params.iterations, params.parallelism, Some(KEY_LEN))
        .map_err(|_| CryptoError::Internal)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);
    let mut out = Zeroizing::new([0u8; KEY_LEN]);
    argon2
        .hash_password_into(password.as_bytes(), salt, out.as_mut())
        .map_err(|_| CryptoError::Internal)?;
    Ok(out)
}

/// Cifra `plaintext` com a chave dada. Retorna `nonce || ciphertext (com tag)`.
pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let nonce_bytes = random_bytes(NONCE_LEN);
    let nonce = XNonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| CryptoError::Internal)?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Deriva, de forma determinística, uma seed de 32 bytes a partir da DEK e de um contexto.
/// Usada para reconstruir o "dealer" do Shamir Secret Sharing sob demanda (mesma DEK + mesmo
/// contexto sempre gera a mesma seed, então cada share pode ser recalculada quando necessário
/// sem precisar armazenar o polinômio ou reunir respostas antigas).
pub fn derive_deterministic_seed(dek: &[u8; KEY_LEN], context: &[u8]) -> [u8; 32] {
    let hk = hkdf::Hkdf::<sha2::Sha256>::new(None, dek);
    let mut seed = [0u8; 32];
    hk.expand(context, &mut seed).expect("comprimento de seed válido");
    seed
}

/// Decifra um blob no formato `nonce || ciphertext (com tag)`.
pub fn decrypt(key: &[u8; KEY_LEN], data: &[u8]) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
    if data.len() < NONCE_LEN {
        return Err(CryptoError::DecryptionFailed);
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = XNonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;
    Ok(Zeroizing::new(plaintext))
}
