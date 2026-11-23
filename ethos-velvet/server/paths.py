"""Velvet — identity normalisation and filesystem rules.

The service runs on the host as the EthOS service user, outside the core's
`path_scope`. It therefore re-implements the same user-visible rule: admins may
index anything, every other account only its own home plus `/mnt` and `/media`.
The core data directory (and the package's own store) are never indexable, and
symlinks are resolved before the prefix check so they cannot escape a root.

This module has no third-party imports: the package venv ships no wheels.
"""

import os
import re

MAX_USERNAME = 64
HOME_PREFIX = "/home"
SHARED_ROOTS = ("/mnt", "/media")

VIDEO_EXTS = (".mp4", ".m4v", ".mkv", ".mov", ".webm", ".avi", ".wmv")

# One media file may be large (VR masters run 10–30 GB), but not unbounded.
MAX_FILE_BYTES = 50 * 1024 * 1024 * 1024


def normalize_username(raw: str) -> str:
    """Same normalisation the core proxy applies before stamping X-Ethos-User."""
    return re.sub(r"[^a-z0-9._-]", "", str(raw or "").strip().lower())[:MAX_USERNAME]


def state_dir() -> str:
    return os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()


def users_root() -> str:
    return os.path.join(state_dir(), "users")


def user_dir(username: str) -> str:
    return os.path.join(users_root(), username)


def thumbs_dir(username: str) -> str:
    return os.path.join(user_dir(username), "thumbs")


def db_path(username: str) -> str:
    return os.path.join(user_dir(username), "library.db")


def core_data_dir() -> str:
    raw = os.environ.get("ETHOS_CORE_DATA_DIR") or ""
    return os.path.realpath(raw) if raw else ""


def _within(path: str, root: str) -> bool:
    if root == "/":
        return path.startswith("/")
    return path == root or path.startswith(root + os.sep)


def allowed_roots(username: str, role: str) -> tuple[str, ...]:
    if role == "admin":
        return ("/",)
    roots = []
    if username:
        roots.append(os.path.join(HOME_PREFIX, username))
    roots.extend(SHARED_ROOTS)
    return tuple(roots)


def check_path(
    username: str,
    role: str,
    raw: str,
    *,
    must_exist: bool = False,
    must_be_dir: bool = False,
) -> str:
    """Resolve and authorise one path for this caller.

    Raises ValueError (bad input), PermissionError (outside the caller's roots)
    or FileNotFoundError (missing). Returns the real absolute path.
    """
    text = str(raw or "").strip()
    if not text or not text.startswith("/"):
        raise ValueError("An absolute path is required")
    if any(ch in text for ch in ("\x00", "\n", "\r")):
        raise ValueError("The path contains invalid characters")
    real = os.path.realpath(text)

    core = core_data_dir()
    if core and _within(real, core):
        raise PermissionError("The EthOS data directory is not available to apps")
    if _within(real, os.path.realpath(state_dir())):
        raise PermissionError("The package data directory is not available")

    if not any(_within(real, root) for root in allowed_roots(username, role)):
        raise PermissionError(
            "This folder is outside your allowed locations (your home, /mnt and /media)"
        )

    if must_exist and not os.path.exists(real):
        raise FileNotFoundError("The folder does not exist")
    if must_be_dir and not os.path.isdir(real):
        raise ValueError("The selected path is not a folder")
    return real


def is_video_name(name: str) -> bool:
    return name.lower().endswith(VIDEO_EXTS)
