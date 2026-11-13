#!/usr/bin/env python3
"""Domains package: validation, rendering and state tests (no Docker, no Caddy).

Run: ../ethos-nas/.venv/bin/python tests/test_config_gen.py
"""

import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent / "server"
sys.path.insert(0, str(SERVER))

os.environ["DOMAINS_DATA_DIR"] = tempfile.mkdtemp(prefix="domains-test-")

import config_gen  # noqa: E402
import store  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))


def rejects(fn, value):
    try:
        fn(value)
    except config_gen.ValidationError:
        return True
    except Exception:  # noqa: BLE001 - any other exception is a bug, not a rejection
        return False
    return False


print("Domains")
check("plain domain", config_gen.normalize_domain("app.example.com") == "app.example.com")
check("uppercase and trailing dot normalise",
      config_gen.normalize_domain(" App.Example.COM. ") == "app.example.com")
check("unicode becomes punycode",
      config_gen.normalize_domain("bücher.example") == "xn--bcher-kva.example")
check("newline injection rejected", rejects(config_gen.normalize_domain, "evil.com\nx.com {"))
check("brace injection rejected", rejects(config_gen.normalize_domain, "evil.com {"))
check("space rejected", rejects(config_gen.normalize_domain, "evil .com"))
check("wildcard rejected for now", rejects(config_gen.normalize_domain, "*.example.com"))
check("ip address rejected", rejects(config_gen.normalize_domain, "192.168.1.10"))
check("localhost rejected", rejects(config_gen.normalize_domain, "localhost"))
check("slash rejected", rejects(config_gen.normalize_domain, "evil.com/path"))
check("lists deduplicate",
      config_gen.normalize_domains("a.example.com, a.example.com b.example.com")
      == ["a.example.com", "b.example.com"])
check("empty list rejected", rejects(config_gen.normalize_domains, []))

print("Targets")
check("ip and port", config_gen.normalize_upstream("192.168.1.10:8080") == "192.168.1.10:8080")
check("hostname and port", config_gen.normalize_upstream("nas.local:9000") == "nas.local:9000")
check("http scheme stripped", config_gen.normalize_upstream("http://10.0.0.5:81") == "10.0.0.5:81")
check("ipv6 bracketed", config_gen.normalize_upstream("[fd00::1]:8080") == "[fd00::1]:8080")
check("missing port rejected", rejects(config_gen.normalize_upstream, "192.168.1.10"))
check("port out of range rejected", rejects(config_gen.normalize_upstream, "1.2.3.4:70000"))
check("non numeric port rejected", rejects(config_gen.normalize_upstream, "1.2.3.4:http"))
check("path rejected", rejects(config_gen.normalize_upstream, "1.2.3.4:80/api"))
check("space injection rejected", rejects(config_gen.normalize_upstream, "1.2.3.4:80 {\n}"))
check("unbracketed ipv6 rejected", rejects(config_gen.normalize_upstream, "fd00::1:8080"))
check("https target rejected", rejects(config_gen.normalize_upstream, "https://1.2.3.4:443"))

print("Rendering")
route = {
    "id": "r_1", "domains": ["app.example.com", "www.example.com"],
    "upstream": "192.168.1.10:8080", "enabled": True,
    "preserve_host": True, "stream": False,
}
block = config_gen.render_routes([route])
check("site addresses on one line", "app.example.com www.example.com {" in block, block)
check("upstream rendered", "reverse_proxy 192.168.1.10:8080 {" in block, block)
check("websockets survive reloads", "stream_close_delay 5m" in block, block)
check("no flush by default", "flush_interval" not in block, block)
check("no host override by default", "header_up Host" not in block, block)
check("disabled route omitted", config_gen.render_routes([{**route, "enabled": False}]).strip() == "")
streamed = config_gen.render_routes([{**route, "stream": True, "preserve_host": False}])
check("streaming disables buffering", "flush_interval -1" in streamed, streamed)
check("host override when not preserving",
      "header_up Host {upstream_hostport}" in streamed, streamed)
check("note never reaches the config",
      "note" not in config_gen.render_routes([{**route, "note": "evil { }"}]), block)

options = config_gen.render_options({"acme_email": "me@example.com", "staging": True})
check("email rendered", "\temail me@example.com" in options, options)
check("staging CA rendered", "acme-staging-v02" in options, options)
check("log goes to a file the UI can read", "output file /var/log/caddy/caddy.log" in options, options)
check("no email when unset", "email" not in config_gen.render_options({}), "")
check("bad email rejected", rejects(config_gen.normalize_email, "not-an-email"))

document = config_gen.build_caddyfile({"acme_email": "me@example.com", "staging": False}, [route])
check("document has global block", document.startswith("{\n\tadmin :2019\n"), document[:40])
check("document has the route", "app.example.com www.example.com {" in document)
check("global block closes before sites", "}\n\napp.example.com" in document, document)

print("State")
state = store.normalise({})
check("empty state defaults", state["routes"] == [] and state["settings"]["staging"] is False)
created = store.merge_route(state, config_gen.sanitize_route({
    "domains": "a.example.com", "upstream": "10.0.0.2:80", "note": "test",
}))
check("route gets an id", created["id"].startswith("r_"), created)
check("route stores normalised target", created["upstream"] == "10.0.0.2:80", created)
updated = store.merge_route(state, {**created, "upstream": "10.0.0.3:80"})
check("same id updates in place", updated["id"] == created["id"] and updated["upstream"] == "10.0.0.3:80")
check("only one route stored", len(state["routes"]) == 1, str(state["routes"]))
check("remove reports success", store.remove_route(state, created["id"]) is True)
check("remove twice reports nothing", store.remove_route(state, created["id"]) is False)
check("settings merge", store.merge_settings(state, {"staging": True})["staging"] is True)

saved = store.save(store.normalise({"routes": [created], "settings": {"acme_email": "x@y.z"}}))
check("save round-trips", store.load()["routes"][0]["id"] == saved["routes"][0]["id"])
check("bad state file shape is ignored",
      store.normalise({"routes": [{"nope": 1}], "settings": "x"})["routes"] == [])

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
