"""
How the KDBX fixtures of K-502 Teil 3 were made, independently of Kennwort's code. Dev only.

1. KeePassXC 2.7.6 (Ubuntu's keepassxc package), password Weber-Haustechnik-2026:
     keepassxc-cli import -p -t 100 kdbx-source.xml keepassxc.kdbx
     keepassxc-cli attachment-import keepassxc.kdbx "Technik/Fernwartung/Wärmepumpen-Portal" anhang.txt anhang.txt
     keepassxc-cli import -p --set-key-file keepassxc-keyfile.keyx -t 100 kdbx-source.xml keepassxc-keyfile.kdbx
   The group tags in kdbx-source.xml make KeePassXC write KDBX 4.1; without the line
   `<Tags>Verwaltung</Tags>` it writes KDBX 3.1 (keepassxc-3.1.kdbx).
2. This script, in a venv with pykeepass 4.2.0, opens keepassxc.kdbx and saves it again with cheap
   KDFs, each cipher, with and without compression, both inner streams and every kind of key file:
     python -I generate-kdbx.py keepassxc.kdbx out/
   then the files go to fixtures/ as kdbx-<name>; each was opened again with keepassxc-cli.
"""
import base64, hashlib, os, sys
from collections import OrderedDict
from construct import Container
from pykeepass import PyKeePass
from pykeepass.kdbx_parsing.kdbx4 import kdf_uuids

src, out = sys.argv[1], sys.argv[2]
PW = "Weber-Haustechnik-2026"
os.makedirs(out, exist_ok=True)

def kdf_dict(kind):
    salt = os.urandom(32)
    if kind == "aes":
        items = [("$UUID", 0x42, kdf_uuids["aeskdf"]), ("R", 0x05, 1000), ("S", 0x42, salt)]
    else:
        uuid = kdf_uuids["argon2"] if kind == "argon2d" else kdf_uuids["argon2id"]
        items = [("$UUID", 0x42, uuid), ("S", 0x42, salt), ("P", 0x04, 2),
                 ("M", 0x05, 1024 * 1024), ("I", 0x05, 2), ("V", 0x04, 0x13)]
    d = OrderedDict()
    for i, (k, t, v) in enumerate(items):
        d[k] = Container(type=t, key=k, value=v, next_byte=0 if i == len(items) - 1 else 1)
    return Container(d)

def build(name, kdf, cipher, compress=True, stream="chacha20", password=PW, keyfile=None):
    kp = PyKeePass(src, password=PW)
    h = kp.kdbx.header.value.dynamic_header
    h.cipher_id.data = cipher
    h.kdf_parameters.data.dict = kdf_dict(kdf)
    h.compression_flags.data.compression = compress
    kp.kdbx.body.payload.inner_header.protected_stream_id.data = stream
    if stream == "salsa20":
        kp.kdbx.body.payload.inner_header.protected_stream_key.data = os.urandom(32)
    kp.password = password
    kp.keyfile = keyfile
    path = os.path.join(out, name)
    kp.save(path)
    # read back with pykeepass to be sure the file is sound
    check = PyKeePass(path, password=password, keyfile=keyfile)
    print(name, len(open(path, "rb").read()), [e.title for e in check.entries])

build("argon2d-aes.kdbx", "argon2d", "aes256")
build("argon2id-chacha20.kdbx", "argon2id", "chacha20")
build("aeskdf-aes.kdbx", "aes", "aes256", compress=False, stream="salsa20")

# key files: KeePass XML v1 (base64), raw 32 bytes, 64 hex characters, any other file (SHA-256)
key = bytes(range(32))
files = {
    "key-v1.key": ("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<KeyFile>\n\t<Meta>\n\t\t<Version>1.00</Version>\n\t</Meta>\n"
                   "\t<Key>\n\t\t<Data>" + base64.b64encode(key).decode() + "</Data>\n\t</Key>\n</KeyFile>\n").encode(),
    "key-raw.key": bytes(reversed(key)),
    "key-hex.key": hashlib.sha256(b"hex").hexdigest().encode(),
    "key-any.key": "Weber Haustechnik – Schlüsseldatei\n".encode() * 3,
}
for name, data in files.items():
    open(os.path.join(out, name), "wb").write(data)
build("keyfile-v1.kdbx", "argon2id", "chacha20", password=PW, keyfile=os.path.join(out, "key-v1.key"))
build("keyfile-raw.kdbx", "argon2d", "aes256", password=None, keyfile=os.path.join(out, "key-raw.key"))
build("keyfile-hex.kdbx", "argon2d", "chacha20", password=None, keyfile=os.path.join(out, "key-hex.key"))
build("keyfile-any.kdbx", "argon2d", "aes256", password=PW, keyfile=os.path.join(out, "key-any.key"))
