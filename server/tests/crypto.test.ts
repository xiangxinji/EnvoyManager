import { describe, it, expect } from "vitest";
import { generateKeyPairSync, publicEncrypt, privateDecrypt, constants } from "node:crypto";
import { initCrypto, decryptWithPrivateKey, getPublicKey } from "../crypto.js";

describe("Crypto", () => {
  it("initCrypto generates keys and getPublicKey returns PEM", () => {
    initCrypto();
    const pub = getPublicKey();
    expect(pub).toContain("BEGIN PUBLIC KEY");
  });

  it("decryptWithPrivateKey decrypts data encrypted with public key", () => {
    initCrypto();
    const pub = getPublicKey();
    const plaintext = "hello-world-测试中文";
    const encrypted = publicEncrypt(
      { key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha-256" },
      Buffer.from(plaintext, "utf-8"),
    ).toString("base64");
    const decrypted = decryptWithPrivateKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("decryptWithPrivateKey handles empty string", () => {
    initCrypto();
    const pub = getPublicKey();
    const encrypted = publicEncrypt(
      { key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha-256" },
      Buffer.from("", "utf-8"),
    ).toString("base64");
    const decrypted = decryptWithPrivateKey(encrypted);
    expect(decrypted).toBe("");
  });

  it("decryptWithPrivateKey throws on invalid ciphertext", () => {
    initCrypto();
    expect(() => decryptWithPrivateKey("not-valid-base64-encrypted-data")).toThrow();
  });
});
