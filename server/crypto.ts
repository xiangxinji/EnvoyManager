import { generateKeyPairSync, publicEncrypt, privateDecrypt, constants } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const KEYS_DIR = join(homedir(), ".envoy", "keys");
const PRIVATE_KEY_PATH = join(KEYS_DIR, "private.pem");
const PUBLIC_KEY_PATH = join(KEYS_DIR, "public.pem");

function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(PRIVATE_KEY_PATH, privateKey, "utf-8");
  writeFileSync(PUBLIC_KEY_PATH, publicKey, "utf-8");
  return { publicKey, privateKey };
}

export function loadOrGenerateKeys(): { publicKey: string; privateKey: string } {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    return {
      privateKey: readFileSync(PRIVATE_KEY_PATH, "utf-8"),
      publicKey: readFileSync(PUBLIC_KEY_PATH, "utf-8"),
    };
  }
  return generateKeyPair();
}

export function decryptWithPrivateKey(ciphertext: string): string {
  const buffer = Buffer.from(ciphertext, "base64");
  const decrypted = privateDecrypt(
    { key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha-256" },
    buffer,
  );
  return decrypted.toString("utf-8");
}

let keys: { publicKey: string; privateKey: string };

export function initCrypto() {
  keys = loadOrGenerateKeys();
  console.log("[crypto] RSA key pair loaded");
}

export function getPublicKey(): string {
  return keys.publicKey;
}
