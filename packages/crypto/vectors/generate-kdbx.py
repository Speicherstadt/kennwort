"""
Writes kdbx-4.json: test vectors for the KDBX 4 building blocks of src/kdbx.ts (K-502 Teil 3),
computed with Python's hashlib and hmac, pycryptodome (AES, ChaCha20, Salsa20) and argon2-cffi
(the reference implementation of Argon2), not with the code under test. The compositions follow
KeePassXC as src/kdbx.ts names them. Dev only; run in a venv with
`pip install pycryptodome argon2-cffi` and `python -I packages/crypto/vectors/generate-kdbx.py`.
"""
import hashlib
import hmac
import json
import os
import struct

from argon2.low_level import Type, hash_secret_raw
from Crypto.Cipher import AES, ChaCha20, Salsa20
from Crypto.Util.Padding import pad


def counting(length, start):
    return bytes((start + i) & 0xFF for i in range(length))


def aes_kdf(seed, rounds, key):
    cipher = AES.new(seed, AES.MODE_ECB)
    for _ in range(rounds):
        key = cipher.encrypt(key)
    return hashlib.sha256(key).digest()


def block_mac(hmac_key, index, data):
    key = hashlib.sha512(struct.pack("<Q", index) + hmac_key).digest()
    return hmac.new(key, data, hashlib.sha256).digest()


password = "Weber-Haustechnik-2026 – Größe"
key_file = counting(32, 0x40)
password_part = hashlib.sha256(password.encode("utf-8")).digest()
composite = hashlib.sha256(password_part + key_file).digest()

seed = counting(32, 0x80)
salt = counting(32, 0xA0)
argon2 = [
    {"kind": "argon2d", "version": 0x13, "iterations": 2, "memoryKiB": 64, "parallelism": 2},
    {"kind": "argon2id", "version": 0x13, "iterations": 3, "memoryKiB": 32, "parallelism": 1},
    {"kind": "argon2d", "version": 0x10, "iterations": 1, "memoryKiB": 16, "parallelism": 2},
]
for case in argon2:
    case["transformed"] = hash_secret_raw(
        secret=composite,
        salt=salt,
        time_cost=case["iterations"],
        memory_cost=case["memoryKiB"],
        parallelism=case["parallelism"],
        hash_len=32,
        type=Type.D if case["kind"] == "argon2d" else Type.ID,
        version=case["version"],
    ).hex()

master_seed = counting(32, 0xC0)
transformed = bytes.fromhex(argon2[0]["transformed"])
cipher_key = hashlib.sha256(master_seed + transformed).digest()
hmac_key = hashlib.sha512(master_seed + transformed + b"\x01").digest()
block = "Weber Haustechnik".encode() * 5

plaintext = ("<KeePassFile>Jonas, Anna, Sandra und Max</KeePassFile>" * 3).encode()
aes_iv = counting(16, 0x10)
chacha_iv = counting(12, 0x20)
inner_key = counting(64, 0x30)

vectors = {
    "composite": {
        "password": password,
        "passwordPart": password_part.hex(),
        "keyFile": key_file.hex(),
        "composite": composite.hex(),
    },
    "aesKdf": [
        {"seed": seed.hex(), "rounds": rounds, "transformed": aes_kdf(seed, rounds, composite).hex()}
        for rounds in (1, 1000, 200_001)
    ],
    "argon2": {"salt": salt.hex(), "cases": argon2},
    "keys": {
        "masterSeed": master_seed.hex(),
        "transformed": transformed.hex(),
        "cipherKey": cipher_key.hex(),
        "hmacKey": hmac_key.hex(),
        "block": block.hex(),
        "macs": [
            {"index": str(index), "mac": block_mac(hmac_key, index, block).hex()}
            for index in (0, 1, 2**32 + 7, 2**64 - 1)
        ],
    },
    "payload": {
        "key": cipher_key.hex(),
        "plaintext": plaintext.hex(),
        "aes256": {
            "iv": aes_iv.hex(),
            "ciphertext": AES.new(cipher_key, AES.MODE_CBC, aes_iv).encrypt(pad(plaintext, 16)).hex(),
        },
        "chacha20": {
            "iv": chacha_iv.hex(),
            "ciphertext": ChaCha20.new(key=cipher_key, nonce=chacha_iv).encrypt(plaintext).hex(),
        },
    },
    "innerStream": {
        "key": inner_key.hex(),
        "salsa20": Salsa20.new(
            key=hashlib.sha256(inner_key).digest(), nonce=bytes.fromhex("e830094b97205d2a")
        ).encrypt(bytes(150)).hex(),
        "chacha20": ChaCha20.new(
            key=hashlib.sha512(inner_key).digest()[:32], nonce=hashlib.sha512(inner_key).digest()[32:44]
        ).encrypt(bytes(150)).hex(),
    },
}

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kdbx-4.json")
with open(path, "w", encoding="utf-8") as out:
    json.dump(vectors, out, indent=2, ensure_ascii=False)
    out.write("\n")
