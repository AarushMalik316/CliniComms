#!/usr/bin/env python3
"""
POSTMAN // CLINIC_PI_MAILBOX DAEMON
Hardware: Raspberry Pi Zero W (1.0W continuous solar load) + USB/SD Storage
Function: Local clinic dropbox, AES-256-GCM envelope encryption, and zero-touch ESP32 sync HTTP API.
License: Apache-2.0
"""

import hashlib
import http.server
import json
import os
import secrets
import urllib.parse
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BASE_DIR = Path("/var/spool/screech_postman")
OUTBOX_DIR = BASE_DIR / "outbox"
INBOX_DIR = BASE_DIR / "inbox"
MASTER_KEY = bytes.fromhex(
    os.environ.get(
        "POSTMAN_AES_KEY_HEX",
        "4b9e1f08c32a7d6590e4b1a82f73c5d91e84a0b2c6f3d589a1e7c4b2d0f8a361",
    )
)
AUTH_SECRET = os.environ.get("POSTMAN_AUTH_SECRET", "POSTMAN_DESERT_MUTUAL_KEY_2026")


def ensure_dirs() -> None:
    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    INBOX_DIR.mkdir(parents=True, exist_ok=True)


def encrypt_for_hospital(plaintext_path: Path, dest_node: str = "hospital_server") -> Path:
    raw = plaintext_path.read_bytes()
    sha256_hex = hashlib.sha256(raw).hexdigest()
    iv = secrets.token_bytes(12)
    aesgcm = AESGCM(MASTER_KEY)
    ciphertext = aesgcm.encrypt(iv, raw, None)

    envelope = {
        "filename": plaintext_path.name,
        "dest": dest_node,
        "sha256": sha256_hex,
        "iv_hex": iv.hex(),
        "size_plain": len(raw),
    }
    enc_path = OUTBOX_DIR / f"{plaintext_path.name}.enc"
    meta_path = OUTBOX_DIR / f"{plaintext_path.name}.enc.json"
    enc_path.write_bytes(iv + ciphertext)
    meta_path.write_text(json.dumps(envelope, indent=2))
    return enc_path


class DtnMailboxHandler(http.server.BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        return self.headers.get("X-DTN-Auth", "") == AUTH_SECRET

    def do_GET(self) -> None:
        if not self._authorized():
            self.send_error(403, "Forbidden")
            return

        if self.path == "/dtn/outbox":
            lines = []
            for meta_file in sorted(OUTBOX_DIR.glob("*.enc.json")):
                meta = json.loads(meta_file.read_text())
                enc_name = meta_file.name[:-5]
                lines.append(f"{meta['dest']}|{enc_name}")
            body = "\n".join(lines).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path.startswith("/dtn/bundle/"):
            fname = os.path.basename(self.path[len("/dtn/bundle/") :])
            fpath = OUTBOX_DIR / fname
            if not fpath.is_file():
                self.send_error(404, "Bundle not found")
                return
            data = fpath.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        self.send_error(404, "Unknown route")

    def do_POST(self) -> None:
        if not self._authorized():
            self.send_error(403, "Forbidden")
            return

        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/dtn/upload":
            qs = urllib.parse.parse_qs(parsed.query)
            fname = os.path.basename(qs.get("file", ["bundle.enc"])[0])
            expected_sha = qs.get("sha256", [""])[0]
            length = int(self.headers.get("Content-Length", "0"))
            payload = self.rfile.read(length)

            actual_sha = hashlib.sha256(payload).hexdigest()
            if expected_sha and actual_sha != expected_sha:
                self.send_error(400, "SHA-256 verification failed")
                return

            (INBOX_DIR / fname).write_bytes(payload)
            # Decrypt bundle locally if .enc
            if len(payload) > 12:
                iv, ct = payload[:12], payload[12:]
                plaintext = AESGCM(MASTER_KEY).decrypt(iv, ct, None)
                out_plain = INBOX_DIR / fname.removesuffix(".enc")
                out_plain.write_bytes(plaintext)

            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
            return

        if parsed.path.startswith("/dtn/ack/"):
            fname = os.path.basename(parsed.path[len("/dtn/ack/") :])
            for suffix in ["", ".json"]:
                target = OUTBOX_DIR / f"{fname}{suffix}"
                if target.exists():
                    target.unlink()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ACK")
            return

        self.send_error(404, "Unknown route")


if __name__ == "__main__":
    ensure_dirs()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", 8080), DtnMailboxHandler)
    print("POSTMAN CLINIC_01 PI ZERO MAILBOX LISTENING ON :8080 (1.0W SOLAR MODE)")
    server.serve_forever()
