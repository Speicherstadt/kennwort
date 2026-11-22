"""
How the fixtures of Bitwarden's encrypted JSON export (K-502 Teil 4) were made, independently of
Kennwort's code. Dev only.

1. From bitwarden/clients (at ad5a8f31), libs/importer/src/importers/spec-data/bitwarden-json/:
   the `exportJson` of account-encrypted-v1.json.ts and account-encrypted-v2.json.ts as
   bitwarden-account-encrypted-v1.json and -v2.json (account-restricted exports, written by
   Bitwarden), and `data` of password-protected.json.ts as bitwarden-protected-bitwarden.json (a
   password-protected export written by Bitwarden, PBKDF2 with 100 000 iterations; its password
   is not in the repository, so it only shows that a wrong password ends as one).
2. This script writes password-protected exports of fixtures/bitwarden.json and of the e2e
   fixture import-bitwarden.json the way Bitwarden does, with hashlib, hmac, `cryptography` and
   argon2-cffi: bitwarden/clients libs/tools/export-vault-core/src/services/
   base-vault-export.service.ts (buildPasswordExport, lines 21-52) and bitwarden/sdk-internal
   crates/bitwarden-exporters/src/encrypted_json.rs (export_encrypted_json, lines 24-66), the key
   as packages/crypto/vectors/generate-bitwarden.py derives it. Run in a venv with
   `pip install cryptography argon2-cffi`, from the repository's root:
     python -I packages/core/src/import/test/generate-bitwarden.py
"""
import base64
import hashlib
import hmac
import json
import os
import uuid

from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives import hashes, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDFExpand

PASSWORD = "Weber-Haustechnik-2026"
FIXTURES = "packages/core/src/import/fixtures"
E2E = "e2e/fixtures"


def export_key(password, salt, kdf):
    secret, salt = password.encode("utf-8"), salt.encode("utf-8")
    if kdf["kdfType"] == 0:
        material = hashlib.pbkdf2_hmac("sha256", secret, salt, kdf["kdfIterations"], 32)
    else:
        material = hash_secret_raw(
            secret,
            hashlib.sha256(salt).digest(),
            time_cost=kdf["kdfIterations"],
            memory_cost=kdf["kdfMemory"] * 1024,
            parallelism=kdf["kdfParallelism"],
            hash_len=32,
            type=Type.ID,
            version=19,
        )
    expand = lambda info: HKDFExpand(hashes.SHA256(), 32, info).derive(material)
    return expand(b"enc"), expand(b"mac")


def enc_string(key, plain):
    enc_key, mac_key = key
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    encryptor = Cipher(algorithms.AES(enc_key), modes.CBC(iv)).encryptor()
    ct = encryptor.update(padder.update(plain) + padder.finalize()) + encryptor.finalize()
    mac = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode()
    return f"2.{b64(iv)}|{b64(ct)}|{b64(mac)}"


def protect(source, target, kdf):
    with open(source, encoding="utf-8") as file:
        plain = file.read()
    salt = base64.b64encode(os.urandom(16)).decode()
    key = export_key(PASSWORD, salt, kdf)
    doc = {"encrypted": True, "passwordProtected": True, "salt": salt, **kdf}
    doc["encKeyValidation_DO_NOT_EDIT"] = enc_string(key, str(uuid.uuid4()).encode())
    doc["data"] = enc_string(key, plain.encode("utf-8"))
    with open(target, "w", encoding="utf-8") as file:
        json.dump(doc, file, indent=2)
        file.write("\n")


PBKDF2 = {"kdfType": 0, "kdfIterations": 100000}
# Bitwarden's defaults are 32 MiB, 6 iterations, 4 threads (sdk-internal kdf.rs, lines 170-182);
# less memory and fewer iterations keep the tests quick
ARGON2ID = {"kdfType": 1, "kdfIterations": 3, "kdfMemory": 16, "kdfParallelism": 4}
# The cheapest PBKDF2 Bitwarden imports (5 000 iterations), so the browser test stays quick
CHEAP = {"kdfType": 0, "kdfIterations": 5000}

protect(f"{FIXTURES}/bitwarden.json", f"{FIXTURES}/bitwarden-protected-pbkdf2.json", PBKDF2)
protect(f"{FIXTURES}/bitwarden.json", f"{FIXTURES}/bitwarden-protected-argon2id.json", ARGON2ID)
protect(f"{E2E}/import-bitwarden.json", f"{E2E}/import-bitwarden-protected.json", CHEAP)
