#!/usr/bin/env python3
"""EthOS Velvet service tests — stdlib only, no real ffmpeg required.

Run from the package repo root:
    python -m unittest discover -s ethos-velvet/tests -v
"""

import json
import os
import shutil
import sys
import tempfile
import textwrap
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT, "server")
sys.path.insert(0, SERVER_DIR)

import main  # noqa: E402
import media  # noqa: E402
import paths  # noqa: E402
import scanner  # noqa: E402
import store  # noqa: E402

FFPROBE_SCRIPT = """\
#!__PYTHON__
import json, os, re, sys

name = os.path.basename(sys.argv[-1]).lower()
width, height = 7680, 3840
if "mono" in name:
    width, height = 1920, 1080
elif "360" in name:
    width, height = 3840, 1920
duration = 120.0
match = re.search(r"dur(\\d+)", name)
if match:
    duration = float(match.group(1))
print(json.dumps({
    "format": {"duration": str(duration), "bit_rate": "9000000"},
    "streams": [
        {"codec_type": "video", "codec_name": "hevc", "width": width, "height": height},
        {"codec_type": "audio", "codec_name": "aac"},
    ],
}))
"""

FFMPEG_SCRIPT = """\
#!__PYTHON__
import sys

out = sys.argv[sys.argv.index("-y") + 1] if "-y" in sys.argv else sys.argv[-1]
with open(out, "wb") as handle:
    handle.write(b"RIFF" + b"0" * 512 + b"WEBP")
"""


class VelvetServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="velvet-test-")
        self.data = os.path.join(self.tmp, "data")
        self.core = os.path.join(self.tmp, "core-data")
        self.library = os.path.join(self.tmp, "library")
        self.bin = os.path.join(self.tmp, "bin")
        for folder in (self.data, self.core, self.library, self.bin):
            os.makedirs(folder, exist_ok=True)

        self._env = {key: os.environ.get(key) for key in (
            "ETHOS_PACKAGE_DATA_DIR", "ETHOS_CORE_DATA_DIR",
            "VELVET_FFPROBE", "VELVET_FFMPEG",
        )}
        os.environ["ETHOS_PACKAGE_DATA_DIR"] = self.data
        os.environ["ETHOS_CORE_DATA_DIR"] = self.core
        os.environ["VELVET_FFPROBE"] = self._script("ffprobe", FFPROBE_SCRIPT)
        os.environ["VELVET_FFMPEG"] = self._script("ffmpeg", FFMPEG_SCRIPT)

        self.server = main.build_server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        shutil.rmtree(self.tmp, ignore_errors=True)

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _script(self, name, source):
        path = os.path.join(self.bin, name)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(source.replace("__PYTHON__", sys.executable))
        os.chmod(path, 0o755)
        return path

    def _touch(self, name, size=4096, subdir=""):
        folder = os.path.join(self.library, subdir) if subdir else self.library
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name)
        with open(path, "wb") as handle:
            handle.write(b"x" * size)
        stamp = time.time() - 100
        os.utime(path, (stamp, stamp))
        return path

    def _request(self, method, path, body=None, user="marcin", role="admin"):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            self.base + path, data=data, method=method,
            headers={
                "Content-Type": "application/json",
                "X-Ethos-User": user,
                "X-Ethos-Role": role,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.status, response.read(), dict(response.headers)
        except urllib.error.HTTPError as exc:
            try:
                return exc.code, exc.read(), dict(exc.headers)
            finally:
                exc.close()

    def _json(self, method, path, body=None, user="marcin", role="admin"):
        status, payload, _headers = self._request(method, path, body, user, role)
        data = json.loads(payload.decode("utf-8") or "{}")
        return status, data

    def _add_folder(self, role="admin", user="marcin"):
        status, data = self._json("PUT", "/folders", {"folders": [self.library]}, user, role)
        self.assertEqual(status, 200, data)
        return data

    def _scan(self, user="marcin", role="admin"):
        status, data = self._json("POST", "/scan", {}, user, role)
        self.assertEqual(status, 202, data)
        for _ in range(400):
            _code, current = self._json("GET", "/scan/status", user=user, role=role)
            state = current["scan"].get("state")
            if state in ("done", "error"):
                self.assertEqual(state, "done", current["scan"])
                return current["scan"]
            time.sleep(0.05)
        self.fail("scan did not finish")

    def _library(self, query="", user="marcin", role="admin"):
        status, data = self._json("GET", "/library?limit=100" + query, user=user, role=role)
        self.assertEqual(status, 200, data)
        return data

    def _seed_library(self):
        self._add_folder()
        self._touch("StudioVR_Test_Title_A_8K_LR_180_1795012839.mp4")
        self._touch("StudioVR_Test_Title_A_8K_LR_180_1795012999.mp4")
        self._touch("Mono Title 4K.mp4")
        self._touch("360 Tour 8K.mp4")
        self._touch("Fisheye Fun_4096p_FISHEYE190.mp4")
        self._touch(".hidden.mp4")
        os.makedirs(os.path.join(self.library, "Not_A_File_8K_LR.mp4"), exist_ok=True)
        with open(os.path.join(self.library, "Not_A_File_8K_LR.mp4", "note.txt"), "w") as handle:
            handle.write("not a video")
        self._scan()

    def _item(self, library, title):
        for item in library["items"]:
            if item["title"] == title:
                return item
        self.fail(f"title not found: {title} (have {[i['title'] for i in library['items']]})")

    # ── Tests ───────────────────────────────────────────────────────────────

    def test_health_and_identity(self):
        status, payload, _ = self._request("GET", "/health", user="", role="")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload)["status"], "ok")

        status, _payload, _ = self._request("GET", "/state", user="", role="")
        self.assertEqual(status, 401)

        status, data = self._json("GET", "/state")
        self.assertEqual(status, 200)
        self.assertEqual(data["folders"], [])
        self.assertEqual(data["settings"]["quality"], "auto")

    def test_scan_classifies_and_groups_duplicates(self):
        self._seed_library()
        library = self._library()
        self.assertEqual(library["total"], 5)
        titles = sorted(item["title"] for item in library["items"])
        self.assertIn("Mono Title", titles)

        first = self._item(library, "Test Title A")
        self.assertEqual(first["studio"], "StudioVR")
        self.assertTrue(first["sbs"])
        self.assertEqual(first["projection"], "180 SBS")
        self.assertEqual(first["res_label"], "8K")
        self.assertEqual(first["vcodec"], "hevc")
        self.assertEqual(first["audio_tracks"], 1)

        mono = self._item(library, "Mono Title")
        self.assertFalse(mono["sbs"])
        self.assertEqual(mono["projection"], "Mono")
        self.assertEqual(mono["res_label"], "4K")

        tour = self._item(library, "Tour")
        self.assertFalse(tour["sbs"])
        self.assertEqual(tour["projection"], "360")
        self.assertEqual(tour["res_label"], "8K")

        fisheye = self._item(library, "Fun")
        self.assertTrue(fisheye["sbs"])
        self.assertEqual(fisheye["projection"], "Fisheye 180")
        self.assertEqual(fisheye["res_label"], "4096p")

        groups = self._json("GET", "/duplicates")[1]["groups"]
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["count"], 2)
        self.assertEqual(library["summary"]["duplicates"]["groups"], 1)
        self.assertGreater(library["summary"]["duplicates"]["reclaimable"], 0)

        for item in library["items"]:
            self.assertNotIn("hidden", item["name"])
            self.assertFalse(item["path"].endswith("Not_A_File_8K_LR.mp4"))

    def test_per_account_isolation(self):
        self._seed_library()
        path = self._library()["items"][0]["path"]

        bob_library = self._library(user="bob", role="user")
        self.assertEqual(bob_library["total"], 0)

        status, _data = self._json("GET", f"/item?path={urllib.parse.quote(path)}",
                                   user="bob", role="user")
        self.assertIn(status, (403, 404))
        status, _payload, _headers = self._request(
            "GET", f"/thumb?path={urllib.parse.quote(path)}", user="bob", role="user")
        self.assertIn(status, (403, 404))

    def test_folder_rules(self):
        status, _data = self._json("PUT", "/folders",
                                   {"folders": ["/home/alice/private"]}, user="bob", role="user")
        self.assertEqual(status, 403)

        status, _data = self._json("PUT", "/folders",
                                   {"folders": [self.core]}, user="marcin", role="admin")
        self.assertEqual(status, 403)

        status, _data = self._json("PUT", "/folders",
                                   {"folders": ["/media/does-not-exist-velvet"]},
                                   user="bob", role="user")
        self.assertEqual(status, 404)

        status, _data = self._json("PUT", "/folders", {"folders": "nope"})
        self.assertEqual(status, 400)

    def test_tags_ratings_and_filters(self):
        self._seed_library()
        item = self._library()["items"][0]
        path = item["path"]

        status, data = self._json("PATCH", "/media", {
            "path": path, "rating": 4, "favorite": True, "reject": True,
            "tags_add": ["POV", "favourite scene"],
        })
        self.assertEqual(status, 200, data)
        self.assertEqual(data["item"]["rating"], 4)
        self.assertEqual(data["item"]["favorite"], 1)
        self.assertEqual(sorted(data["item"]["tags"]), ["favourite scene", "pov"])

        self.assertEqual(self._library("&tag=pov")["total"], 1)
        self.assertEqual(self._library("&rating=4")["total"], 1)
        self.assertEqual(self._library("&favorite=1")["total"], 1)
        self.assertEqual(self._library("&rejected=1")["total"], 1)
        self.assertEqual(self._library("&q=mono")["total"], 1)

        paths_list = [row["path"] for row in self._library()["items"]]
        status, data = self._json("POST", "/media/batch", {
            "paths": paths_list, "rating": 5, "tags_add": ["bulk"],
        })
        self.assertEqual(status, 200, data)
        self.assertEqual(data["updated"], 5)
        self.assertEqual(self._library("&rating=5")["total"], 5)

        status, data = self._json("POST", "/tags/rename",
                                  {"from": "pov", "to": "first person"})
        self.assertEqual(status, 200, data)
        status, data = self._json("GET", f"/item?path={urllib.parse.quote(path)}")
        self.assertIn("first person", data["item"]["tags"])

        status, data = self._json("POST", "/tags/delete", {"tag": "bulk"})
        self.assertEqual(status, 200)
        self.assertEqual(data["removed"], 5)

    def test_resume_and_settings(self):
        self._seed_library()
        path = self._library()["items"][0]["path"]
        status, data = self._json("PUT", "/resume", {"path": path, "t": 42.5})
        self.assertEqual(status, 200, data)
        status, data = self._json("GET", f"/resume?path={urllib.parse.quote(path)}")
        self.assertEqual(data["t"], 42.5)

        status, data = self._json("PUT", "/settings", {"settings": {
            "quality": "tiny", "eye": "sbs", "grid": "large",
            "auto_scan": False, "page_size": 50,
        }})
        self.assertEqual(status, 200, data)
        self.assertEqual(data["settings"]["quality"], "tiny")
        self.assertFalse(data["settings"]["auto_scan"])

        status, _data = self._json("PUT", "/settings", {"settings": {"quality": "bogus"}})
        self.assertEqual(status, 400)

    def test_thumbnails_and_frames(self):
        self._seed_library()
        item = self._item(self._library(), "Test Title A")
        quoted = urllib.parse.quote(item["path"])

        status, payload, headers = self._request("GET", f"/thumb?path={quoted}")
        self.assertEqual(status, 202)
        self.assertIn("retry_ms", json.loads(payload))

        status, payload, headers = self._wait_image(f"/thumb?path={quoted}")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Content-Type"), "image/webp")
        self.assertTrue(payload.startswith(b"RIFF"))

        # Cached: the second request is immediate.
        status, payload, _ = self._request("GET", f"/thumb?path={quoted}")
        self.assertEqual(status, 200)
        self.assertTrue(payload.startswith(b"RIFF"))

        status, payload, _ = self._wait_image(f"/frame?path={quoted}&i=2")
        self.assertEqual(status, 200)
        self.assertTrue(payload.startswith(b"RIFF"))

        status, _payload, _ = self._request("GET", f"/thumb?path={urllib.parse.quote('/nope.mp4')}")
        self.assertEqual(status, 404)

    def _wait_image(self, path):
        for _ in range(300):
            status, payload, headers = self._request("GET", path)
            if status != 202:
                return status, payload, headers
            time.sleep(0.05)
        self.fail("image did not become ready")

    def test_forget_and_missing(self):
        self._seed_library()
        forgotten = self._library()["items"][0]
        status, data = self._json("POST", "/forget", {"paths": [forgotten["path"]]})
        self.assertEqual(status, 200)
        self.assertEqual(data["removed"], 1)
        self.assertEqual(self._library()["total"], 4)

        # Forget never touches the file, so a rescan re-imports it. Removing a
        # different indexed file must mark that row missing instead.
        victim = self._library()["items"][0]
        os.remove(victim["path"])
        self._scan()
        summary = self._library()["summary"]
        self.assertEqual(summary["missing"], 1)
        self.assertEqual(self._library("&missing=1")["total"], 1)

    def test_limits_and_unknown_routes(self):
        status, _data = self._json("POST", "/media/batch",
                                   {"paths": [f"/tmp/{i}.mp4" for i in range(501)]})
        self.assertEqual(status, 400)

        body = {"settings": {"quality": "auto"}, "padding": "x" * (1024 * 1024)}
        status, _payload, _headers = self._request("PUT", "/settings", body)
        self.assertEqual(status, 413)

        status, data = self._json("GET", "/nope")
        self.assertEqual(status, 404)
        self.assertIn("detail", data)

    def test_pure_classification(self):
        info = scanner.classify(
            "BadoinkVR_Natasha Nice_Nicely_Done_Remastered_8K_180_180x180_3dh_1795331293.mp4",
            {"width": 7680, "height": 3840, "duration": 120},
        )
        self.assertEqual(info["studio"], "BadoinkVR")
        self.assertEqual(info["title"], "Natasha Nice Nicely Done Remastered")
        self.assertEqual(info["res_label"], "8K")
        self.assertEqual(info["projection"], "180 SBS")
        self.assertTrue(info["sbs"])

        mono = scanner.classify("Plain Scene 4K.mp4", {"width": 1920, "height": 1080})
        self.assertFalse(mono["sbs"])
        self.assertEqual(mono["projection"], "Mono")

        wide = scanner.classify("Wide Scene.mp4", {"width": 3840, "height": 1920})
        self.assertTrue(wide["sbs"])
        self.assertEqual(wide["projection"], "180 SBS")

        equirect = scanner.classify("360 Walk 8K.mp4", {"width": 3840, "height": 1920})
        self.assertFalse(equirect["sbs"])
        self.assertEqual(equirect["projection"], "360")

        alpha = scanner.classify("Pass_through_Scene_8K_alpha.mp4",
                                 {"width": 7680, "height": 3840})
        self.assertTrue(alpha["alpha"])

        self.assertEqual(scanner.clean_title("Scene_One_8K_LR_180_1795012839.mp4"),
                         "Scene One")
        self.assertEqual(scanner.resolution_label("Clip_4096p.mp4", {}), "4096p")
        self.assertEqual(scanner.resolution_label("Clip 8K.mp4", {}), "8K")

    def test_duplicate_duration_tolerance(self):
        def row(name, duration):
            store.upsert_media("marcin", {
                "path": os.path.join(self.library, name),
                "name": name,
                "size": 1000,
                "mtime": 1.0,
                "duration": duration,
                "norm_key": "samekey",
                "title": "Same Key",
            })

        row("a.mp4", 100)
        row("b.mp4", 101.5)
        self.assertEqual(len(store.duplicate_groups("marcin")), 1)

        store.forget("marcin", [os.path.join(self.library, "a.mp4"),
                                os.path.join(self.library, "b.mp4")])
        row("c.mp4", 100)
        row("d.mp4", 106)
        self.assertEqual(store.duplicate_groups("marcin"), [])

    def test_path_guard_symlink_escape(self):
        outside = os.path.join(self.tmp, "outside")
        os.makedirs(outside, exist_ok=True)
        link = os.path.join(self.library, "link")
        try:
            os.symlink(outside, link)
        except OSError:
            self.skipTest("symlinks unavailable")

        with self.assertRaises(PermissionError):
            paths.check_path("bob", "user", link, must_exist=True, must_be_dir=True)
        # Admins may reach it, but the core data dir stays off-limits even then.
        resolved = paths.check_path("marcin", "admin", link, must_exist=True, must_be_dir=True)
        self.assertEqual(os.path.realpath(resolved), os.path.realpath(outside))
        with self.assertRaises(PermissionError):
            paths.check_path("marcin", "admin", self.core, must_exist=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
