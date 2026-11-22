#!/usr/bin/env python3
"""Unit tests for the Sticky Notes package service (v2).

Run from the repository root:

    python -m unittest discover -s ethos-sticky-notes/tests -v

The service is a stdlib HTTP server with no importable package name, so the
tests load `server/main.py` by path with a throwaway data directory. Push tests
patch DNS and never contact a real push service.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import socket
import stat
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "server" / "main.py"
LEGACY = Path(tempfile.mkdtemp(prefix="sn-legacy-"))


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


class ServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = Path(tempfile.mkdtemp(prefix="sn-data-"))
        _write(LEGACY / "sticky_notes.json", {
            "alice": [{"text": "old note", "color": "blue"}],
        })
        os.environ["ETHOS_PACKAGE_DATA_DIR"] = str(cls.data)
        os.environ["ETHOS_CORE_DATA_DIR"] = str(LEGACY)
        os.environ["ETHOS_PACKAGE_PORT"] = "0"
        spec = importlib.util.spec_from_file_location("sticky_service", SERVICE)
        cls.mod = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(cls.mod)
        cls.push = cls.mod.push_service
        assert cls.push is not None, "push.py must import without pywebpush"

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.data, ignore_errors=True)
        shutil.rmtree(LEGACY, ignore_errors=True)

    def setUp(self) -> None:
        _write(self.data / "notes.json", {"version": 2, "users": {}})
        for name in ("settings.json", "push.json", "vapid_private.pem"):
            path = self.data / name
            if path.exists():
                path.unlink()

    # ── store / migration ─────────────────────────────────────────────────

    def test_legacy_import_creates_v2_notes(self) -> None:
        (self.data / "notes.json").unlink()
        notes = self.mod.list_notes("alice")["notes"]
        self.assertEqual(1, len(notes))
        self.assertEqual("old note", notes[0]["text"])
        self.assertEqual("note", notes[0]["kind"])
        self.assertEqual([], notes[0]["items"])
        self.assertFalse(notes[0]["pinned"])
        stored = json.loads((self.data / "notes.json").read_text(encoding="utf-8"))
        self.assertEqual(2, stored["version"])

    def test_store_and_settings_are_private(self) -> None:
        self.mod.create_note("alice", {"text": "secret"})
        self.mod.update_settings("alice", {"ribbon_enabled": True})
        for name in ("notes.json", "settings.json"):
            mode = stat.S_IMODE((self.data / name).stat().st_mode)
            self.assertEqual(0o600, mode, name)

    # ── notes / checklists ────────────────────────────────────────────────

    def test_create_checklist_and_items(self) -> None:
        created = self.mod.create_note("alice", {
            "kind": "checklist", "text": "Shopping", "items": ["milk"],
        })["note"]
        self.assertEqual("checklist", created["kind"])
        self.assertEqual("milk", created["items"][0]["text"])
        item_id = created["items"][0]["id"]

        toggled = self.mod.update_item("alice", created["id"], item_id, {"done": True})["item"]
        self.assertTrue(toggled["done"])

        added = self.mod.add_item("alice", created["id"], {"text": "bread"})["item"]
        self.assertEqual("bread", added["text"])

        removed = self.mod.delete_item("alice", created["id"], added["id"])["note"]
        self.assertEqual(1, len(removed["items"]))

    def test_add_item_to_text_note_converts_it(self) -> None:
        note = self.mod.create_note("alice", {"text": "just a note"})["note"]
        self.assertEqual("note", note["kind"])
        updated = self.mod.add_item("alice", note["id"], {"text": "todo"})["note"]
        self.assertEqual("checklist", updated["kind"])

    def test_idempotent_client_ids(self) -> None:
        first = self.mod.create_note("alice", {
            "kind": "checklist", "text": "Shopping", "items": ["milk"],
            "client_id": "sn_0123456789ab",
        })["note"]
        again = self.mod.create_note("alice", {
            "kind": "checklist", "text": "Shopping", "items": ["milk"],
            "client_id": "sn_0123456789ab",
        })["note"]
        self.assertEqual(first["id"], again["id"])
        self.assertEqual(1, len(self.mod.list_notes("alice")["notes"]))

        item = self.mod.add_item("alice", first["id"], {
            "text": "bread", "client_id": "ci_0123456789ab",
        })["item"]
        again_item = self.mod.add_item("alice", first["id"], {
            "text": "bread", "client_id": "ci_0123456789ab",
        })["item"]
        self.assertEqual(item["id"], again_item["id"])
        self.assertEqual(2, len(self.mod.list_notes("alice")["notes"][0]["items"]))

    def test_pin_archive_due_and_reminder_validation(self) -> None:
        note = self.mod.create_note("alice", {"text": "x"})["note"]
        updated = self.mod.update_note("alice", note["id"], {
            "pinned": True, "archived": True,
            "due_at": "2026-12-01", "reminder_at": "2026-12-01T09:00:00+01:00",
        })["note"]
        self.assertTrue(updated["pinned"])
        self.assertTrue(updated["archived"])
        self.assertEqual("2026-12-01", updated["due_at"])
        self.assertEqual("2026-12-01T08:00:00+00:00", updated["reminder_at"])

        with self.assertRaises(self.mod.ApiError):
            self.mod.update_note("alice", note["id"], {"due_at": "tomorrow"})
        with self.assertRaises(self.mod.ApiError):
            self.mod.update_note("alice", note["id"], {"reminder_at": "not-a-date"})

    def test_settings_defaults_and_update(self) -> None:
        self.assertEqual(
            {"ribbon_enabled": False, "ribbon_show_completed": True},
            self.mod.get_settings("alice")["settings"],
        )
        updated = self.mod.update_settings("alice", {
            "ribbon_enabled": True, "ribbon_show_completed": False,
        })["settings"]
        self.assertTrue(updated["ribbon_enabled"])
        self.assertFalse(updated["ribbon_show_completed"])
        with self.assertRaises(self.mod.ApiError):
            self.mod.update_settings("alice", {"ribbon_enabled": "maybe"})

    # ── reminders ─────────────────────────────────────────────────────────

    def test_due_reminder_is_claimed_once(self) -> None:
        past = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(timespec="seconds")
        self.mod.create_note("alice", {"text": "call", "reminder_at": past})
        first = self.mod.claim_due_reminders("alice")["reminders"]
        self.assertEqual(1, len(first))
        self.assertEqual("call", first[0]["body"])
        self.assertEqual([], self.mod.claim_due_reminders("alice")["reminders"])

    def test_finished_checklist_does_not_remind(self) -> None:
        past = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(timespec="seconds")
        note = self.mod.create_note("alice", {
            "kind": "checklist", "text": "done",
            "items": [{"text": "a", "done": True}], "reminder_at": past,
        })["note"]
        self.assertEqual([], self.mod.claim_due_reminders("alice")["reminders"])
        stored = self.mod.list_notes("alice")["notes"][0]
        self.assertEqual(note["id"], stored["id"])
        self.assertIsNotNone(stored["reminder_fired_at"])

    def test_old_reminder_is_silently_skipped(self) -> None:
        old = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(timespec="seconds")
        self.mod.create_note("alice", {"text": "stale", "reminder_at": old})
        self.assertEqual([], self.mod.claim_due_reminders("alice")["reminders"])

    # ── push ──────────────────────────────────────────────────────────────

    def test_vapid_key_is_generated(self) -> None:
        key = self.push.public_key()
        self.assertTrue(key)
        self.assertTrue((self.data / "vapid_private.pem").is_file())
        mode = stat.S_IMODE((self.data / "vapid_private.pem").stat().st_mode)
        self.assertEqual(0o600, mode)

    def test_push_subscription_validation(self) -> None:
        keys = {"p256dh": "a", "auth": "b"}
        with self.assertRaises(ValueError):
            self.push.subscribe("alice", {"endpoint": "http://example.com/x", "keys": keys})
        with patch.object(self.push.socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
        ]):
            with self.assertRaises(ValueError):
                self.push.subscribe("alice", {
                    "endpoint": "https://push.example.test/x", "keys": keys,
                })
        public = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        with patch.object(self.push.socket, "getaddrinfo", return_value=public):
            result = self.push.subscribe("alice", {
                "endpoint": "https://push.example.test/x", "keys": keys,
            })
            self.assertEqual(1, result["subscriptions"])
            self.assertEqual(1, len(self.push.list_subscriptions("alice")))
            self.assertEqual(1, self.push.unsubscribe("alice", "https://push.example.test/x")["removed"])

    def test_subscription_moves_between_accounts(self) -> None:
        keys = {"p256dh": "a", "auth": "b"}
        public = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        with patch.object(self.push.socket, "getaddrinfo", return_value=public):
            self.push.subscribe("alice", {"endpoint": "https://push.example.test/x", "keys": keys})
            self.push.subscribe("bob", {"endpoint": "https://push.example.test/x", "keys": keys})
        self.assertEqual([], self.push.list_subscriptions("alice"))
        self.assertEqual(1, len(self.push.list_subscriptions("bob")))

    # ── dispatch ──────────────────────────────────────────────────────────

    def test_dispatch_covers_the_v2_routes(self) -> None:
        status, body = self.mod._dispatch("POST", "/api/sticky-notes", "alice", {
            "kind": "checklist", "text": "T", "items": ["a"],
        })
        self.assertEqual(201, status)
        note_id = body["note"]["id"]
        item_id = body["note"]["items"][0]["id"]

        self.assertEqual(200, self.mod._dispatch(
            "PUT", f"/api/sticky-notes/{note_id}/items/{item_id}", "alice", {"done": True})[0])
        self.assertEqual(201, self.mod._dispatch(
            "POST", f"/api/sticky-notes/{note_id}/items", "alice", {"text": "b"})[0])
        self.assertEqual(200, self.mod._dispatch(
            "GET", "/api/sticky-notes/settings", "alice", {})[0])
        self.assertEqual(200, self.mod._dispatch(
            "PUT", "/api/sticky-notes/settings", "alice", {"ribbon_enabled": True})[0])
        self.assertEqual(200, self.mod._dispatch(
            "GET", "/api/sticky-notes/reminders/due", "alice", {})[0])
        self.assertEqual(404, self._dispatch_error("GET", "/api/sticky-notes/nope/nope/nope"))

    def _dispatch_error(self, method: str, route: str) -> int:
        with self.assertRaises(self.mod.ApiError) as caught:
            self.mod._dispatch(method, route, "alice", {})
        return caught.exception.status


if __name__ == "__main__":
    unittest.main(verbosity=2)
