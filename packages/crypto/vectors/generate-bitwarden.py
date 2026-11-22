"""
Writes bitwarden-export.json: test vectors for the building blocks of Bitwarden's
password-protected JSON export in src/bitwarden.ts (K-502 Teil 4), computed with Python's hashlib
and hmac, `cryptography` (HKDF-Expand, AES-256-CBC, PKCS#7) and argon2-cffi (the reference
implementation of Argon2), not with the code under test.

The composition follows Bitwarden (bitwarden/sdk-internal at c5c08aeb):
- crates/bitwarden-crypto/src/keys/kdf.rs, derive_kdf_key (lines 34-88): PBKDF2-HMAC-SHA256 with
  32 bytes out, or Argon2id v1.3 with memory in MiB * 1024 KiB, 32 bytes out and the salt hashed
  with SHA-256 first (line 70);
- crates/bitwarden-crypto/src/keys/utils.rs, stretch_key (lines 12-19): HKDF-Expand-SHA256 of the
  KDF output with the infos "enc" and "mac", 32 bytes each;
- crates/bitwarden-exporters/src/encrypted_json.rs (line 49): the salt is the Base64 text itself,
  encoded as UTF-8, not its decoded bytes;
- EncString type 2, "2.<iv>|<ct>|<mac>": AES-256-CBC with PKCS#7 under the enc key, then
  HMAC-SHA256(mac key, iv || ct).

The vectors under "bitwarden" are Bitwarden's own, from the tests of the same files:
kdf.rs test_master_key_derive_pbkdf2 and test_master_key_derive_argon2 (lines 229-271) and
utils.rs test_stretch_kdf_key (lines 55-79); this script checks them before it writes anything.

Dev only; run in a venv with `pip install cryptography argon2-cffi` and
`python -I packages/crypto/vectors/generate-bitwarden.py`.
"""
import base64
import hashlib
import hmac
import json
import os

from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives import hashes, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDFExpand


def counting(length, start):
    return bytes((start + i) & 0xFF for i in range(length))


def kdf(password, salt, params):
    secret, salt = password.encode("utf-8"), salt.encode("utf-8")
    if params["kind"] == "pbkdf2":
        return hashlib.pbkdf2_hmac("sha256", secret, salt, params["iterations"], 32)
    return hash_secret_raw(
        secret,
        hashlib.sha256(salt).digest(),
        time_cost=params["iterations"],
        memory_cost=params["memoryMiB"] * 1024,
        parallelism=params["parallelism"],
        hash_len=32,
        type=Type.ID,
        version=19,
    )


def expand(material, info):
    return HKDFExpand(hashes.SHA256(), 32, info.encode()).derive(material)


def stretch(material):
    return expand(material, "enc"), expand(material, "mac")


def enc_string(enc_key, mac_key, iv, plain):
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plain) + padder.finalize()
    encryptor = Cipher(algorithms.AES(enc_key), modes.CBC(iv)).encryptor()
    ct = encryptor.update(padded) + encryptor.finalize()
    mac = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode()
    return f"2.{b64(iv)}|{b64(ct)}|{b64(mac)}"


# Bitwarden's own vectors (kdf.rs and utils.rs, see above), checked here independently
BITWARDEN_KDF = [
    {
        "password": "67t9b5g67$%Dh89n",
        "salt": "test_key",
        "kdf": {"kind": "pbkdf2", "iterations": 10000},
        "material": bytes([
            31, 79, 104, 226, 150, 71, 177, 90, 194, 80, 172, 209, 17, 129, 132, 81, 138, 167,
            69, 167, 254, 149, 2, 27, 39, 197, 64, 42, 22, 195, 86, 75,
        ]).hex(),
    },
    {
        "password": "67t9b5g67$%Dh89n",
        "salt": "test_key",
        "kdf": {"kind": "argon2id", "iterations": 4, "memoryMiB": 32, "parallelism": 2},
        "material": bytes([
            207, 240, 225, 177, 162, 19, 163, 76, 98, 106, 179, 175, 224, 9, 17, 240, 20, 147,
            237, 47, 246, 150, 141, 184, 62, 225, 131, 242, 51, 53, 225, 242,
        ]).hex(),
    },
]
BITWARDEN_STRETCH = {
    "material": BITWARDEN_KDF[0]["material"],
    "encKey": bytes([
        111, 31, 178, 45, 238, 152, 37, 114, 143, 215, 124, 83, 135, 173, 195, 23, 142,
        134, 120, 249, 61, 132, 163, 182, 113, 197, 189, 204, 188, 21, 237, 96,
    ]).hex(),
    "macKey": bytes([
        221, 127, 206, 234, 101, 27, 202, 38, 86, 52, 34, 28, 78, 28, 185, 16, 48, 61, 127,
        166, 209, 247, 194, 87, 232, 26, 48, 85, 193, 249, 179, 155,
    ]).hex(),
}

for case in BITWARDEN_KDF:
    assert kdf(case["password"], case["salt"], case["kdf"]).hex() == case["material"], case
enc, mac = stretch(bytes.fromhex(BITWARDEN_STRETCH["material"]))
assert (enc.hex(), mac.hex()) == (BITWARDEN_STRETCH["encKey"], BITWARDEN_STRETCH["macKey"])

# The export's salt: 16 bytes in Base64, used as that text
password = "Weber-Haustechnik-2026 – Größe"
salt = base64.b64encode(counting(16, 0x30)).decode()
derive = []
for params in [
    {"kind": "pbkdf2", "iterations": 5000},
    {"kind": "argon2id", "iterations": 2, "memoryMiB": 16, "parallelism": 1},
    {"kind": "argon2id", "iterations": 3, "memoryMiB": 16, "parallelism": 4},
]:
    material = kdf(password, salt, params)
    enc, mac = stretch(material)
    derive.append({
        "password": password,
        "salt": salt,
        "kdf": params,
        "material": material.hex(),
        "encKey": enc.hex(),
        "macKey": mac.hex(),
    })

enc_key, mac_key = counting(32, 0x40), counting(32, 0x60)
cases = []
for length in [0, 1, 15, 16, 17, 100]:
    iv = os.urandom(16)
    plain = counting(length, 0xA0)
    cases.append({"plain": plain.hex(), "encString": enc_string(enc_key, mac_key, iv, plain)})

vectors = {
    "bitwarden": {"kdf": BITWARDEN_KDF, "stretch": BITWARDEN_STRETCH},
    "derive": derive,
    "encString": {"encKey": enc_key.hex(), "macKey": mac_key.hex(), "cases": cases},
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bitwarden-export.json")
with open(out, "w", encoding="utf-8") as file:
    json.dump(vectors, file, indent=2, ensure_ascii=False)
    file.write("\n")
