#!/usr/bin/env python3
"""Static checks for the Velvet package UI and layout."""

import os
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "frontend", "app.js")
HLS = os.path.join(ROOT, "frontend", "hls.min.js")
MANIFEST = os.path.join(ROOT, "manifest.json")


class VelvetFrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(APP, encoding="utf-8") as handle:
            cls.source = handle.read()

    def test_renders_as_native_module(self):
        self.assertIn("export async function render(container, ctx)", self.source)
        self.assertIn("data-testid=\"velvet-root\"", self.source)

    def test_required_controls_exist(self):
        for test_id in (
            "velvet-nav-library", "velvet-nav-duplicates", "velvet-nav-tags",
            "velvet-nav-settings", "velvet-grid", "velvet-search",
            "velvet-detail", "velvet-player", "velvet-delete-selected",
            "velvet-player-close", "velvet-tag-input", "velvet-scan",
        ):
            self.assertIn(f'data-testid="{test_id}"', self.source, test_id)
        # The eye buttons are rendered per file; their test ids are interpolated.
        self.assertIn('data-action="player-eye"', self.source)
        self.assertIn("velvet-eye-", self.source)

    def test_shared_shell_services(self):
        self.assertIn("_ctx.progress.startTask", self.source)
        self.assertIn("_ctx.modal.confirm", self.source)
        self.assertIn("_ctx.modal.form", self.source)
        self.assertIn("_ctx.notifications.toast", self.source)
        self.assertIn("_ctx.pickFolder", self.source)

    def test_file_event_bridge(self):
        self.assertIn("_ctx.ws.connect('/ws/files/events'", self.source)
        self.assertIn("proxyJson('events'", self.source)
        self.assertIn("action === 'delete_soft'", self.source)
        self.assertIn("action === 'rename'", self.source)

    def test_delete_is_optimistic_and_polls_fast(self):
        # A busy volume can hold the unlink for seconds: the row must vanish as
        # soon as the request is accepted, the rollback must be wired, and the
        # first op poll must not sleep for most of a second.
        self.assertIn("hidePendingDelete(unique)", self.source)
        self.assertIn("restorePendingDelete(rollback)", self.source)
        self.assertIn("let delay = 150", self.source)
        self.assertNotIn("sleep(700)", self.source)
        # Counts move locally and the grid is repainted instead of a full
        # library reload after every delete.
        self.assertIn("state.summary = {", self.source)
        self.assertIn("updateChrome();\n            renderView();", self.source)

    def test_no_local_ui_systems(self):
        for forbidden in (
            "window.alert(", "window.confirm(", "window.prompt(", "alert(",
            "new Notification(", "addNotification(", "showConfirm(",
        ):
            self.assertNotIn(forbidden, self.source, forbidden)

    def test_both_theme_palettes(self):
        self.assertIn(":root.dark .vl-root", self.source)
        self.assertIn("color-scheme: light", self.source)
        self.assertIn("color-scheme: dark", self.source)

    def test_vendored_hls_bundle(self):
        self.assertTrue(os.path.isfile(HLS))
        self.assertGreater(os.path.getsize(HLS), 100_000)
        self.assertTrue(os.path.isfile(os.path.join(ROOT, "frontend", "hls.LICENSE.txt")))

    def test_manifest_lists_runtime_files(self):
        import json

        with open(MANIFEST, encoding="utf-8") as handle:
            manifest = json.load(handle)
        listed = {
            (item if isinstance(item, str) else item.get("path"))
            for item in manifest["files"]
        }
        self.assertEqual(manifest["runtime"], "venv")
        self.assertEqual(manifest["python"]["entry"], "server/main.py")
        for path in (
            "server/main.py", "server/paths.py", "server/store.py",
            "server/scanner.py", "server/media.py", "frontend/app.js", "icon.svg",
        ):
            self.assertIn(path, listed)

    def test_javascript_syntax(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        with open(APP, "rb") as handle:
            result = subprocess.run(
                [node, "--input-type=module", "--check"],
                stdin=handle, capture_output=True, text=True, timeout=60,
            )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
