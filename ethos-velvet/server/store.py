"""Velvet — per-account library store (stdlib sqlite3).

Every account gets its own database and thumbnail directory, so one signed-in
account can never read another account's index. The service only stores
metadata, tags, ratings and resume positions; video bytes always come from the
core API.

Schema (version 1):
    folders(path PK, added_at)
    media(path PK, name, dir, size, mtime, duration, width, height, bitrate,
          vcodec, acodec, audio_tracks, title, studio, res_label, projection,
          sbs, alpha, norm_key, rating, favorite, reject, missing, added_at,
          probed_at)
    tags(path, tag, PK(path, tag))
    resume(path PK, t, updated_at)
    settings(key PK, value)
"""

import json
import os
import sqlite3
import time
from itertools import groupby

import paths

MAX_FOLDERS = 32
MAX_PATHS_PER_CALL = 500
MAX_TAGS_PER_FILE = 64
MAX_TAG_LEN = 40

SETTINGS_DEFAULTS = {
    "quality": "auto",
    "eye": "left",
    "grid": "medium",
    "auto_scan": True,
    "page_size": 90,
}
SETTINGS_ENUMS = {
    "quality": ("auto", "balanced", "fast", "tiny"),
    "eye": ("left", "right", "sbs"),
    "grid": ("small", "medium", "large"),
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS folders(
    path TEXT PRIMARY KEY,
    added_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS media(
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dir TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    mtime REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    bitrate INTEGER NOT NULL DEFAULT 0,
    vcodec TEXT NOT NULL DEFAULT '',
    acodec TEXT NOT NULL DEFAULT '',
    audio_tracks INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    studio TEXT NOT NULL DEFAULT '',
    res_label TEXT NOT NULL DEFAULT '',
    projection TEXT NOT NULL DEFAULT '',
    sbs INTEGER NOT NULL DEFAULT 0,
    alpha INTEGER NOT NULL DEFAULT 0,
    norm_key TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    reject INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0,
    added_at REAL NOT NULL DEFAULT 0,
    probed_at REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS media_norm ON media(norm_key);
CREATE INDEX IF NOT EXISTS media_studio ON media(studio);
CREATE INDEX IF NOT EXISTS media_added ON media(added_at DESC);
CREATE TABLE IF NOT EXISTS tags(
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY(path, tag)
);
CREATE TABLE IF NOT EXISTS resume(
    path TEXT PRIMARY KEY,
    t REAL NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings(
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

def _now() -> float:
    return time.time()


class _Connection(sqlite3.Connection):
    """Commit on success and always close — sqlite3's default context manager
    commits but leaves the handle open, which leaks one fd per request."""

    def __exit__(self, exc_type, exc, tb):
        try:
            return super().__exit__(exc_type, exc, tb)
        finally:
            self.close()


def _connect(username: str) -> sqlite3.Connection:
    os.makedirs(paths.thumbs_dir(username), exist_ok=True)
    conn = sqlite3.connect(paths.db_path(username), timeout=10, factory=_Connection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(_SCHEMA)
    return conn


def _dict(row) -> dict:
    return {key: row[key] for key in row.keys()} if row is not None else {}


# ── Folders ─────────────────────────────────────────────────────────────────


def list_folders(username: str) -> list[dict]:
    with _connect(username) as conn:
        rows = conn.execute("SELECT path, added_at FROM folders ORDER BY added_at").fetchall()
    return [_dict(row) for row in rows]


def replace_folders(username: str, folder_paths: list[str]) -> list[dict]:
    unique: list[str] = []
    for raw in folder_paths[:MAX_FOLDERS]:
        text = str(raw or "").strip()
        if text and text not in unique:
            unique.append(text)
    now = _now()
    with _connect(username) as conn:
        conn.execute("DELETE FROM folders")
        conn.executemany(
            "INSERT INTO folders(path, added_at) VALUES(?, ?)",
            [(p, now) for p in unique],
        )
    return list_folders(username)


# ── Media ───────────────────────────────────────────────────────────────────


def existing_index(username: str) -> dict[str, dict]:
    """path → the fields the scanner uses to skip unchanged files."""
    with _connect(username) as conn:
        rows = conn.execute("SELECT path, size, mtime, probed_at FROM media").fetchall()
    return {
        row["path"]: {
            "size": int(row["size"]),
            "mtime": float(row["mtime"]),
            "probed_at": float(row["probed_at"]),
        }
        for row in rows
    }


def upsert_media(username: str, item: dict) -> None:
    """Insert or refresh one probed file, preserving user-owned fields."""
    now = _now()
    values = {
        "path": item["path"],
        "name": item.get("name") or os.path.basename(item["path"]),
        "dir": item.get("dir") or os.path.dirname(item["path"]),
        "size": int(item.get("size") or 0),
        "mtime": float(item.get("mtime") or 0),
        "duration": float(item.get("duration") or 0),
        "width": int(item.get("width") or 0),
        "height": int(item.get("height") or 0),
        "bitrate": int(item.get("bitrate") or 0),
        "vcodec": str(item.get("vcodec") or "")[:32],
        "acodec": str(item.get("acodec") or "")[:32],
        "audio_tracks": int(item.get("audio_tracks") or 0),
        "title": str(item.get("title") or "")[:300],
        "studio": str(item.get("studio") or "")[:80],
        "res_label": str(item.get("res_label") or "")[:24],
        "projection": str(item.get("projection") or "")[:40],
        "sbs": 1 if item.get("sbs") else 0,
        "alpha": 1 if item.get("alpha") else 0,
        "norm_key": str(item.get("norm_key") or "")[:32],
        "missing": 0,
        "added_at": now,
        "probed_at": float(item.get("probed_at") or now),
    }
    columns = list(values.keys())
    placeholders = ", ".join("?" for _ in columns)
    updates = ", ".join(f"{c}=excluded.{c}" for c in columns if c not in ("path", "added_at"))
    with _connect(username) as conn:
        conn.execute(
            f"INSERT INTO media({', '.join(columns)}) VALUES({placeholders}) "
            f"ON CONFLICT(path) DO UPDATE SET {updates}",
            [values[c] for c in columns],
        )


def get_media(username: str, path: str) -> dict | None:
    with _connect(username) as conn:
        row = conn.execute("SELECT * FROM media WHERE path=?", (path,)).fetchone()
    return _dict(row) if row else None


def get_item(username: str, path: str) -> dict | None:
    item = get_media(username, path)
    if item:
        item["tags"] = tags_for(username, path)
    return item


def patch_media(username: str, path: str, patch: dict) -> dict | None:
    fields: list[str] = []
    values: list = []
    if "rating" in patch:
        fields.append("rating=?")
        values.append(max(0, min(5, int(patch.get("rating") or 0))))
    if "favorite" in patch:
        fields.append("favorite=?")
        values.append(1 if patch.get("favorite") else 0)
    if "reject" in patch:
        fields.append("reject=?")
        values.append(1 if patch.get("reject") else 0)
    if "title" in patch:
        fields.append("title=?")
        values.append(str(patch.get("title") or "")[:300])
    if fields:
        values.append(path)
        with _connect(username) as conn:
            conn.execute(f"UPDATE media SET {', '.join(fields)} WHERE path=?", values)
    return get_item(username, path)


def forget(username: str, paths_list: list[str]) -> int:
    """Remove index rows/tags/resume for paths; never touches the filesystem."""
    cleaned = [str(p) for p in paths_list[:MAX_PATHS_PER_CALL] if p]
    if not cleaned:
        return 0
    marks = ", ".join("?" for _ in cleaned)
    with _connect(username) as conn:
        count = conn.execute(f"SELECT COUNT(*) FROM media WHERE path IN ({marks})", cleaned).fetchone()[0]
        conn.execute(f"DELETE FROM tags WHERE path IN ({marks})", cleaned)
        conn.execute(f"DELETE FROM resume WHERE path IN ({marks})", cleaned)
        conn.execute(f"DELETE FROM media WHERE path IN ({marks})", cleaned)
    return int(count)


def mark_missing(username: str, roots: list[str], seen: set[str]) -> int:
    """Flag rows under the scanned roots that were not found this pass."""
    if not roots:
        return 0
    prefixes = [root.rstrip(os.sep) + os.sep for root in roots]
    missing: list[str] = []
    with _connect(username) as conn:
        rows = conn.execute("SELECT path, dir, missing FROM media").fetchall()
        for row in rows:
            path = row["path"]
            if path in seen:
                continue
            directory = row["dir"] or os.path.dirname(path)
            if not any(directory == root.rstrip(os.sep) or directory.startswith(prefix)
                       for root, prefix in zip(roots, prefixes)):
                continue
            if not row["missing"]:
                missing.append(path)
        if missing:
            conn.executemany("UPDATE media SET missing=1 WHERE path=?", [(p,) for p in missing])
    return len(missing)


def mark_paths_missing(username: str, paths_list: list[str]) -> list[str]:
    """Mark exact paths (and their directory descendants) missing.

    Used by the File Manager event bridge: a deleted or renamed file disappears
    from the default library immediately, without waiting for a full rescan.
    Returns every row that changed, so the caller can purge its cached stills.
    """
    matched: list[str] = []
    with _connect(username) as conn:
        for raw in paths_list[:MAX_PATHS_PER_CALL]:
            path = str(raw or "").strip().rstrip("/") or "/"
            if not path:
                continue
            escaped = path.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            rows = conn.execute(
                "SELECT path FROM media WHERE path=? OR path LIKE ? ESCAPE '\\'",
                (path, escaped + "/%"),
            ).fetchall()
            for row in rows:
                if row["path"] not in matched:
                    matched.append(row["path"])
        if matched:
            conn.executemany("UPDATE media SET missing=1 WHERE path=?", [(p,) for p in matched])
    return matched


def missing_count(username: str) -> int:
    with _connect(username) as conn:
        row = conn.execute("SELECT COUNT(*) FROM media WHERE missing=1").fetchone()
    return int(row[0]) if row else 0


# ── Tags ────────────────────────────────────────────────────────────────────


def _norm_tag(raw) -> str:
    return " ".join(str(raw or "").split()).lower()[:MAX_TAG_LEN]


def tags_for(username: str, path: str) -> list[str]:
    with _connect(username) as conn:
        rows = conn.execute("SELECT tag FROM tags WHERE path=? ORDER BY tag", (path,)).fetchall()
    return [row[0] for row in rows]


def all_tags(username: str) -> list[dict]:
    with _connect(username) as conn:
        rows = conn.execute(
            "SELECT t.tag AS tag, COUNT(*) AS count FROM tags t "
            "JOIN media m ON m.path = t.path AND m.missing = 0 "
            "GROUP BY t.tag ORDER BY count DESC, t.tag"
        ).fetchall()
    return [_dict(row) for row in rows]


def set_tags(username: str, paths_list: list[str], add=(), remove=()) -> int:
    add_tags = [t for t in (_norm_tag(x) for x in add) if t]
    remove_tags = [t for t in (_norm_tag(x) for x in remove) if t]
    changed = 0
    with _connect(username) as conn:
        for path in paths_list[:MAX_PATHS_PER_CALL]:
            if remove_tags:
                conn.executemany(
                    "DELETE FROM tags WHERE path=? AND tag=?",
                    [(path, tag) for tag in remove_tags],
                )
            if add_tags:
                for tag in add_tags:
                    count = conn.execute("SELECT COUNT(*) FROM tags WHERE path=?", (path,)).fetchone()[0]
                    if count >= MAX_TAGS_PER_FILE:
                        break
                    conn.execute("INSERT OR IGNORE INTO tags(path, tag) VALUES(?, ?)", (path, tag))
            changed += 1
    return changed


def rename_tag(username: str, old: str, new: str) -> int:
    old_tag = _norm_tag(old)
    new_tag = _norm_tag(new)
    if not old_tag or not new_tag:
        raise ValueError("Both tag names are required")
    with _connect(username) as conn:
        if old_tag != new_tag:
            conn.execute(
                "INSERT OR IGNORE INTO tags(path, tag) SELECT path, ? FROM tags WHERE tag=?",
                (new_tag, old_tag),
            )
            conn.execute("DELETE FROM tags WHERE tag=?", (old_tag,))
        return int(conn.execute("SELECT COUNT(*) FROM tags WHERE tag=?", (new_tag,)).fetchone()[0])


def delete_tag(username: str, tag: str) -> int:
    tag = _norm_tag(tag)
    if not tag:
        return 0
    with _connect(username) as conn:
        count = conn.execute("SELECT COUNT(*) FROM tags WHERE tag=?", (tag,)).fetchone()[0]
        conn.execute("DELETE FROM tags WHERE tag=?", (tag,))
    return int(count)


# ── Library queries ─────────────────────────────────────────────────────────


def _like(value: str) -> str:
    escaped = str(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_media(username: str, filters: dict | None = None) -> dict:
    filters = filters or {}
    where: list[str] = []
    args: list = []

    if filters.get("missing"):
        where.append("missing=1")
    elif not filters.get("include_missing"):
        where.append("missing=0")
    if filters.get("q"):
        where.append("(title LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')")
        pattern = _like(filters["q"])
        args.extend([pattern, pattern])
    if filters.get("studio"):
        where.append("studio=?")
        args.append(str(filters["studio"]))
    if filters.get("proj"):
        where.append("projection=?")
        args.append(str(filters["proj"]))
    if filters.get("res"):
        where.append("res_label=?")
        args.append(str(filters["res"]))
    if filters.get("tag"):
        where.append("EXISTS(SELECT 1 FROM tags t WHERE t.path=media.path AND t.tag=?)")
        args.append(_norm_tag(filters["tag"]))
    if filters.get("favorite"):
        where.append("favorite=1")
    if filters.get("rejected"):
        where.append("reject=1")
    if filters.get("rating_min"):
        where.append("rating >= ?")
        args.append(max(1, min(5, int(filters["rating_min"]))))
    if filters.get("dup"):
        where.append("norm_key IN (SELECT norm_key FROM media WHERE missing=0 AND norm_key!='' "
                     "GROUP BY norm_key HAVING COUNT(*) > 1)")
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    sort = str(filters.get("sort") or "added_desc")
    order = {
        "added_desc": "added_at DESC, title COLLATE NOCASE",
        "added_asc": "added_at ASC, title COLLATE NOCASE",
        "name_asc": "title COLLATE NOCASE, name COLLATE NOCASE",
        "name_desc": "title COLLATE NOCASE DESC, name COLLATE NOCASE DESC",
        "size_desc": "size DESC",
        "duration_desc": "duration DESC",
        "rating_desc": "rating DESC, added_at DESC",
        "mtime_desc": "mtime DESC",
    }.get(sort, "added_at DESC, title COLLATE NOCASE")

    limit = max(1, min(300, int(filters.get("limit") or 90)))
    offset = max(0, int(filters.get("offset") or 0))

    with _connect(username) as conn:
        total = int(conn.execute(f"SELECT COUNT(*) FROM media{clause}", args).fetchone()[0])
        rows = conn.execute(
            f"SELECT * FROM media{clause} ORDER BY {order} LIMIT ? OFFSET ?",
            [*args, limit, offset],
        ).fetchall()
    return {"items": [_dict(row) for row in rows], "total": total,
            "limit": limit, "offset": offset}


def summary(username: str) -> dict:
    with _connect(username) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS files, COALESCE(SUM(size),0) AS size, "
            "COALESCE(SUM(duration),0) AS duration FROM media WHERE missing=0"
        ).fetchone()
        rejected = conn.execute(
            "SELECT COUNT(*) AS files, COALESCE(SUM(size),0) AS size FROM media "
            "WHERE missing=0 AND reject=1"
        ).fetchone()
    groups = duplicate_groups(username)
    dup_files = sum(group["count"] for group in groups)
    dup_size = sum(group["size"] for group in groups)
    reclaimable = 0
    for group in groups:
        reclaimable += max(0, group["size"] - group["keep_bytes"])
    return {
        "files": int(row["files"]),
        "size": int(row["size"]),
        "duration": float(row["duration"]),
        "missing": missing_count(username),
        "rejected": {"files": int(rejected["files"]), "size": int(rejected["size"])},
        "duplicates": {
            "groups": len(groups),
            "files": dup_files,
            "size": dup_size,
            "reclaimable": reclaimable,
        },
    }


def facets(username: str) -> dict:
    with _connect(username) as conn:
        studios = conn.execute(
            "SELECT studio AS value, COUNT(*) AS count FROM media "
            "WHERE missing=0 AND studio!='' GROUP BY studio ORDER BY count DESC, studio"
        ).fetchall()
        projections = conn.execute(
            "SELECT projection AS value, COUNT(*) AS count FROM media "
            "WHERE missing=0 AND projection!='' GROUP BY projection ORDER BY count DESC"
        ).fetchall()
        resolutions = conn.execute(
            "SELECT res_label AS value, COUNT(*) AS count FROM media "
            "WHERE missing=0 AND res_label!='' GROUP BY res_label ORDER BY count DESC"
        ).fetchall()
    return {
        "studios": [_dict(row) for row in studios],
        "projections": [_dict(row) for row in projections],
        "resolutions": [_dict(row) for row in resolutions],
        "tags": all_tags(username),
    }


def duplicate_groups(username: str) -> list[dict]:
    """Groups with the same cleaned title and a comparable duration."""
    with _connect(username) as conn:
        rows = conn.execute(
            "SELECT * FROM media WHERE missing=0 AND norm_key!='' "
            "ORDER BY norm_key, duration"
        ).fetchall()
    groups: list[dict] = []
    for _key, chunk in groupby(rows, key=lambda r: r["norm_key"]):
        clusters: list[list] = []
        for row in chunk:
            placed = False
            for cluster in clusters:
                base = float(cluster[0]["duration"] or 0)
                current = float(row["duration"] or 0)
                tolerance = max(3.0, 0.03 * max(base, current))
                if base <= 0 or current <= 0 or abs(current - base) <= tolerance:
                    cluster.append(row)
                    placed = True
                    break
            if not placed:
                clusters.append([row])
        for cluster in clusters:
            if len(cluster) < 2:
                continue
            items = [_dict(row) for row in sorted(cluster, key=lambda r: r["mtime"], reverse=True)]
            keep = max(items, key=lambda item: int(item["size"] or 0))
            groups.append({
                "key": cluster[0]["norm_key"],
                "title": items[0]["title"] or items[0]["name"],
                "count": len(items),
                "size": sum(int(item["size"] or 0) for item in items),
                "keep_bytes": int(keep["size"] or 0),
                "items": items,
            })
    groups.sort(key=lambda group: group["size"] - group["keep_bytes"], reverse=True)
    return groups


# ── Resume / settings ───────────────────────────────────────────────────────


def get_resume(username: str, path: str) -> float:
    with _connect(username) as conn:
        row = conn.execute("SELECT t FROM resume WHERE path=?", (path,)).fetchone()
    return float(row["t"]) if row else 0.0


def set_resume(username: str, path: str, seconds: float) -> float:
    value = max(0.0, float(seconds or 0))
    with _connect(username) as conn:
        conn.execute(
            "INSERT INTO resume(path, t, updated_at) VALUES(?,?,?) "
            "ON CONFLICT(path) DO UPDATE SET t=excluded.t, updated_at=excluded.updated_at",
            (path, value, _now()),
        )
    return value


def get_settings(username: str) -> dict:
    with _connect(username) as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    merged = dict(SETTINGS_DEFAULTS)
    for row in rows:
        try:
            merged[row["key"]] = json.loads(row["value"])
        except (TypeError, ValueError):
            continue
    return merged


def set_settings(username: str, patch: dict) -> dict:
    current = get_settings(username)
    updates: dict = {}
    for key, value in (patch or {}).items():
        if key not in SETTINGS_DEFAULTS:
            continue
        if key in SETTINGS_ENUMS:
            if value not in SETTINGS_ENUMS[key]:
                raise ValueError(f"Unsupported value for {key}")
        elif key == "auto_scan":
            value = bool(value)
        elif key == "page_size":
            value = max(24, min(300, int(value)))
        updates[key] = value
    with _connect(username) as conn:
        conn.executemany(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [(key, json.dumps(value)) for key, value in updates.items()],
        )
    current.update(updates)
    return current
