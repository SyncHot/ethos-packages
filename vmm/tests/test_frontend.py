#!/usr/bin/env python3
"""VM Manager window checks — the native module EthOS loads into the page.

The 1.0.8 window called ``_ctx.apiFetch`` while ``render(container, ctx)`` only
ever exposed ``ctx``. The ReferenceError was swallowed by a try/catch, so the
console quietly kept the container port (8094) as its "host port" and every
console link pointed at whatever the NAS happened to run on 8094. Nothing
failed loudly, nothing was logged, and the console simply never opened.

These checks are deliberately dumb: they catch an undefined alias and a broken
module before the package ships, without needing a browser.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP = ROOT / "frontend" / "app.js"
MANIFEST = ROOT / "manifest.json"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    suffix = f" — {detail}" if detail and not ok else ""
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{suffix}")


print("Module scope")
source = APP.read_text(encoding="utf-8")

# The module is imported as a blob module: nothing is shared, so every
# identifier must be declared locally. `ctx` is the render() parameter.
stray = sorted({match for match in re.findall(r"\b_[a-z]+(?=\.)", source)})
check("no stray module-level aliases", not stray, f"uses {', '.join(stray)}")
check("render exposes the sanctioned ctx", "export function render(container, ctx)" in source)
check("console port comes from ctx", "ctx.apiFetch('/api/containers')" in source)
# A wrong host port is worse than no console: 8094 only exists in the container.
check("container port is rejected as a host port", "!== 8094" in source)

print("Syntax")
node = shutil.which("node")
if node:
    proc = subprocess.run([node, "--check", str(APP)], capture_output=True, text=True)
    check("frontend/app.js parses", proc.returncode == 0, proc.stderr.strip()[:200])
else:
    print("  [SKIP] node not installed — syntax check skipped")

print("Manifest")
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
check("version is semantic", bool(re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])))
check("changelog starts with the version", manifest["changelog"].startswith(f"{manifest['version']}: "))
entry = next((item for item in manifest["files"] if item["path"] == "frontend/app.js"), None)
check("frontend/app.js is published in files[]", entry is not None)

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
