#!/usr/bin/env python3
"""Validate the signed package repository without the EthOS core.

Checks the detached Ed25519 signature, the manifest <-> index hash chain, the
manifest identity rules and the icon contract from `.github/skills/package-icon`.
Run locally with `python .github/scripts/validate_repo.py`; CI runs the same file.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = "https://raw.githubusercontent.com/SyncHot/ethos-packages/main"
PKG_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
REQUIRED = ("id", "name", "version", "description", "icon", "category", "author", "license", "changelog")

errors: list[str] = []


def fail(where: str, message: str) -> None:
    errors.append(f"{where}: {message}")


def verify_signature() -> dict:
    index_bytes = (ROOT / "index.json").read_bytes()
    signature = base64.b64decode((ROOT / "index.json.sig").read_text().strip())
    public = Ed25519PublicKey.from_public_bytes(base64.b64decode((ROOT / "repo.pub").read_text().strip()))
    try:
        public.verify(signature, index_bytes)
    except Exception as exc:  # noqa: BLE001 - report the verification failure
        fail("index.json.sig", f"signature does not verify: {exc}")
    return json.loads(index_bytes)


def check_icon(pkg_dir: Path, manifest: dict) -> None:
    icon = pkg_dir / "icon.svg"
    if not icon.is_file():
        fail(pkg_dir.name, "icon.svg missing")
        return
    svg = icon.read_text(encoding="utf-8")
    if 'viewBox="0 0 256 256"' not in svg:
        fail(pkg_dir.name, 'icon.svg must use viewBox="0 0 256 256"')
    if not re.search(r'<rect[^>]*rx="56"', svg):
        fail(pkg_dir.name, 'icon.svg needs a rounded-square background (rx="56")')
    if "<text" in svg:
        fail(pkg_dir.name, "icon.svg must not contain text")
    expected = f"{BASE_URL}/{pkg_dir.name}/icon.svg"
    if manifest.get("icon_url") != expected:
        fail(pkg_dir.name, f"icon_url must be {expected}")

    files = manifest.get("files") or []
    paths = {item if isinstance(item, str) else item.get("path") for item in files}
    if "icon.svg" not in paths:
        fail(pkg_dir.name, "icon.svg must be listed in files[]")
    for item in files:
        path = item if isinstance(item, str) else item.get("path")
        if isinstance(path, str) and not (pkg_dir / path).is_file():
            fail(pkg_dir.name, f"files[] entry does not exist: {path}")


def main() -> int:
    index = verify_signature()
    entries = {entry["id"]: entry for entry in index.get("packages", [])}
    if not entries:
        fail("index.json", "no packages")

    seen = set()
    for pkg_dir in sorted(p for p in ROOT.iterdir() if p.is_dir() and not p.name.startswith(".")):
        manifest_path = pkg_dir / "manifest.json"
        if not manifest_path.is_file():
            continue
        seen.add(pkg_dir.name)
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            fail(pkg_dir.name, f"manifest.json is not valid JSON: {exc}")
            continue

        for field in REQUIRED:
            if not str(manifest.get(field, "")).strip():
                fail(pkg_dir.name, f"missing required field: {field}")
        if manifest.get("id") != pkg_dir.name:
            fail(pkg_dir.name, "manifest id must match the directory name")
        if not PKG_ID_RE.fullmatch(str(manifest.get("id", ""))):
            fail(pkg_dir.name, "invalid package id")
        if str(manifest.get("name")) == str(manifest.get("id")) or str(manifest.get("name", "")).startswith("pkg-"):
            fail(pkg_dir.name, "name must be the human-readable product name, not the id")

        check_icon(pkg_dir, manifest)

        entry = entries.get(pkg_dir.name)
        if entry is None:
            fail(pkg_dir.name, "missing from index.json (run ethos-pack build)")
            continue
        if entry.get("version") != manifest.get("version"):
            fail(pkg_dir.name, f"index version {entry.get('version')} != manifest {manifest.get('version')}")
        digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        if not HEX64_RE.fullmatch(str(entry.get("manifest_sha256", ""))):
            fail(pkg_dir.name, "index manifest_sha256 is not a sha256")
        elif entry["manifest_sha256"] != digest:
            fail(pkg_dir.name, "index manifest_sha256 is stale (run ethos-pack build + sign)")
        if entry.get("icon_url") != manifest.get("icon_url"):
            fail(pkg_dir.name, "index icon_url differs from the manifest (rebuild + sign)")

    for extra in sorted(set(entries) - seen):
        fail(extra, "index entry has no package directory")

    if errors:
        print("Repository validation failed:", file=sys.stderr)
        for line in errors:
            print(f"  - {line}", file=sys.stderr)
        return 1
    print(f"OK: {len(entries)} package(s) validated (signature, hashes, identity, icons)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
