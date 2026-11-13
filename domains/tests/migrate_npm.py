#!/usr/bin/env python3
"""Convert Nginx Proxy Manager proxy hosts into a Domains route import.

Reads NPM's SQLite database **read-only** and prints the payload accepted by
``POST /api/routes/import``. Nothing is written to NPM and nothing is sent to
the proxy: inspect the report, then post the JSON yourself.

What maps cleanly: domain(s), forward host/port, enabled flag, custom
``add_header`` lines and ``if ($host = ...) return 301 https://...`` redirects
(those become redirect routes).

What cannot map (reported, not silently dropped): access lists, caching,
block-exploits, HSTS toggles, locations, and any advanced directive that is not
an ``add_header`` or a simple host redirect. Review the report before switching.

Usage:
    python tests/migrate_npm.py --db /path/database.sqlite --out /tmp/import.json
    python tests/migrate_npm.py --db ... --skip domains.myserver.pl
"""

import argparse
import json
import re
import sqlite3
import sys

DOCKER0 = "172.17.0.1"
ADD_HEADER_RE = re.compile(r"add_header\s+([A-Za-z0-9-]+)\s+(?:\"([^\"]*)\"|([^\s;]+))")
HOST_REDIRECT_RE = re.compile(
    r"\$host\s*=\s*[\"']([^\"']+)[\"'][\s\S]*?return\s+(?:301|302|308)\s+(https?://[^\s;]+)"
)
UNSUPPORTED = [
    (re.compile(r"^\s*if\s*\(", re.I), "if block"),
    (re.compile(r"^\s*location\s", re.I), "location block"),
    (re.compile(r"^\s*proxy_pass\b", re.I), "proxy_pass override"),
    (re.compile(r"^\s*deny\b", re.I), "deny rule"),
    (re.compile(r"^\s*auth_basic\b", re.I), "basic auth"),
    (re.compile(r"^\s*rewrite\s", re.I), "rewrite rule"),
]


def parse_advanced(text: str) -> tuple[list[str], dict[str, str], list[str]]:
    """Return (headers, {domain: redirect_base}, unsupported directives)."""
    headers: list[str] = []
    redirects: dict[str, str] = {}
    unsupported: list[str] = []
    if not text:
        return headers, redirects, unsupported
    for name, quoted, bare in ADD_HEADER_RE.findall(text):
        value = (quoted or bare).strip()
        entry = f"{name}: {value}"
        if value and entry not in headers:
            headers.append(entry)
    for domain, target in HOST_REDIRECT_RE.findall(text):
        base = target.replace("$request_uri", "").replace("$uri", "").rstrip("/")
        redirects[domain.lower()] = base
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ADD_HEADER_RE.search(stripped) or "return 30" in stripped or stripped in {"}", "{"}:
            continue
        for pattern, label in UNSUPPORTED:
            if pattern.search(stripped) and label not in unsupported:
                unsupported.append(label)
    return headers, redirects, unsupported


def build(db_path: str, skip: list[str], only_enabled: bool) -> dict:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    routes: list[dict] = []
    used: dict[str, str] = {}
    report: list[str] = []

    for row in con.execute("select * from proxy_host order by id"):
        names = json.loads(row["domain_names"] or "[]")
        label = f"#{row['id']} {' '.join(names) or '(no domain)'} -> {row['forward_host']}:{row['forward_port']}"
        if only_enabled and not row["enabled"]:
            report.append(f"SKIP {label}: disabled")
            continue
        if row["is_deleted"]:
            report.append(f"SKIP {label}: marked deleted")
            continue
        skipped = [name for name in names if name.lower() in skip]
        names = [name for name in names if name.lower() not in skip]
        for name in skipped:
            report.append(f"SKIP {label}: {name} is in --skip")
        if not names:
            continue

        headers, redirects, unsupported = parse_advanced(row["advanced_config"] or "")
        if row["access_list_id"]:
            report.append(f"WARN {label}: access list #{row['access_list_id']} is not migrated")
        if row["caching_enabled"]:
            report.append(f"WARN {label}: caching is not migrated")
        if row["block_exploits"]:
            report.append(f"WARN {label}: block-exploits is not migrated")
        if row["hsts_enabled"]:
            report.append(f"WARN {label}: NPM HSTS toggle replaced by an explicit header")
        for item in unsupported:
            report.append(f"WARN {label}: {item} dropped")
        if (row["forward_scheme"] or "http") == "https":
            report.append(f"WARN {label}: NPM used an HTTPS upstream; migrated as plain HTTP")

        # Keep the address verbatim: 172.17.0.1 is the host's docker0 IP and is
        # reachable from any compose network, while services published on host
        # loopback only (127.0.0.1) are not reachable through host.docker.internal.
        if row["forward_host"] == DOCKER0:
            report.append(f"INFO {label}: keeping {DOCKER0} (host docker0 address)")
        upstream = f"{row['forward_host']}:{row['forward_port']}"
        proxied: list[str] = []
        for name in names:
            lowered = name.lower()
            if lowered in used:
                report.append(f"SKIP {label}: {name} already mapped by {used[lowered]}")
                continue
            used[lowered] = label
            if lowered in redirects:
                routes.append({
                    "domains": [name],
                    "redirect_to": redirects[lowered],
                    "headers": headers,
                    "note": f"NPM #{row['id']} redirect",
                })
            else:
                proxied.append(name)
        if proxied:
            routes.append({
                "domains": proxied,
                "upstream": upstream,
                "headers": headers,
                "preserve_host": True,
                "enabled": bool(row["enabled"]),
                "note": f"NPM #{row['id']}",
            })

    return {"routes": routes}, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", required=True, help="path to NPM's database.sqlite (opened read-only)")
    parser.add_argument("--out", help="write the import payload here (default: stdout)")
    parser.add_argument("--skip", action="append", default=[],
                        help="domain to leave out (repeatable), e.g. the NPM UI host")
    parser.add_argument("--include-disabled", action="store_true", help="also import disabled hosts")
    args = parser.parse_args()

    payload, report = build(args.db, [d.lower() for d in args.skip], not args.include_disabled)

    for line in report:
        print(line, file=sys.stderr)
    text = json.dumps(payload, indent=2) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(text)
        print(f"wrote {len(payload['routes'])} route(s) to {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
