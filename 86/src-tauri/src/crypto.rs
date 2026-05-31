use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use sha2::{Sha256, Digest};
use anyhow::{Context, Result};
use rand::RngCore;
use rayon::prelude::*;

const SALT: &[u8] = b"script-workstation-salt";

pub struct CryptoService {
    cipher: Aes256Gcm,
}

impl CryptoService {
    pub fn new(password: &str) -> Result<Self> {
        let key = Self::derive_key(password)?;
        let cipher = Aes256Gcm::new(&key.into());
        Ok(Self { cipher })
    }
    
    fn derive_key(password: &str) -> Result<[u8; 32]> {
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        hasher.update(SALT);
        let result = hasher.finalize();
        
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        Ok(key)
    }
    
    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        let ciphertext = self.cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;
        
        let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        
        Ok(general_purpose::STANDARD.encode(combined))
    }
    
    pub fn decrypt(&self, ciphertext_b64: &str) -> Result<String> {
        let combined = general_purpose::STANDARD
            .decode(ciphertext_b64)
            .map_err(|e| anyhow::anyhow!("Base64 decode failed: {}", e))?;
        
        if combined.len() < 12 {
            return Err(anyhow::anyhow!("Invalid ciphertext: too short"));
        }
        
        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        
        let plaintext = self.cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;
        
        String::from_utf8(plaintext)
            .map_err(|e| anyhow::anyhow!("Invalid UTF-8: {}", e))
    }
}

pub fn generate_password_hash(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(SALT);
    format!("{:x}", hasher.finalize())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    generate_password_hash(password) == hash
}

pub async fn encrypt_batch(contents: &[String], password: &str) -> Result<Vec<String>> {
    let crypto = CryptoService::new(password)?;
    
    let results: Vec<Result<String>> = contents.par_iter()
        .map(|content| crypto.encrypt(content))
        .collect();
    
    results.into_iter().collect()
}

pub async fn decrypt_batch(ciphertexts: &[String], password: &str) -> Result<Vec<String>> {
    let crypto = CryptoService::new(password)?;
    
    let results: Vec<Result<String>> = ciphertexts.par_iter()
        .map(|ct| crypto.decrypt(ct))
        .collect();
    
    results.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_encrypt_decrypt() {
        let crypto = CryptoService::new("testpassword").unwrap();
        let plaintext = "Hello, World!";
        
        let encrypted = crypto.encrypt(plaintext).unwrap();
        let decrypted = crypto.decrypt(&encrypted).unwrap();
        
        assert_eq!(plaintext, decrypted);
    }
    
    #[test]
    fn test_wrong_password() {
        let crypto = CryptoService::new("password1").unwrap();
        let encrypted = crypto.encrypt("test").unwrap();
        
        let crypto2 = CryptoService::new("password2").unwrap();
        assert!(crypto2.decrypt(&encrypted).is_err());
    }
    
    #[test]
    fn test_password_hash() {
        let hash = generate_password_hash("mypassword");
        assert!(verify_password("mypassword", &hash));
        assert!(!verify_password("wrongpassword", &hash));
    }
}
