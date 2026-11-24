"""Metadata providers for the Books package (stdlib only).

Three keyless-capable sources, tried in order:

* **Apple Books** (`itunes.apple.com/search`, `media=ebook`) — by far the best
  Polish coverage; returns author, description, release date, genres and a
  cover that can be requested at 600 px.
* **Google Books** (`googleapis.com/books/v1/volumes`) — ISBN, publisher, page
  count; the keyless per-IP quota is small, so an optional API key is supported
  and a 429 blocks the provider for a while instead of failing the title.
* **Open Library** — kept as the last fallback (weak Polish audiobook coverage).

Every outbound call goes through one helper with an HTTPS host allowlist, a
redirect guard, a timeout, a response size cap and a per-provider rate limit.
`ETHOS_BOOKS_ENRICH_BASE` rewrites the host for offline tests only.
"""

import difflib
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from naming import fold

APPLE_SEARCH = "https://itunes.apple.com/search"
GOOGLE_SEARCH = "https://www.googleapis.com/books/v1/volumes"
OPENLIB_SEARCH = "https://openlibrary.org/search.json"
OPENLIB_COVER = "https://covers.openlibrary.org/b/id/{cover}-L.jpg"

APPLE_COUNTRY = os.environ.get("ETHOS_BOOKS_APPLE_COUNTRY", "PL")
TIMEOUT = 8
MAX_JSON = 2 * 1024 * 1024
MAX_IMAGE = 512 * 1024
GAP = 0.35
BLOCK_SECONDS = 15 * 60
MAX_PER_PROVIDER = 10

USER_AGENT = "EthOS-Books/2.0 (+https://github.com/SyncHot/ethos-packages)"

HOSTS = {
    "apple": ("itunes.apple.com", "mzstatic.com"),
    "google": ("googleapis.com", "books.google.com", "googleusercontent.com"),
    "openlibrary": ("openlibrary.org", "archive.org"),
}

OPENLIB_LANGUAGES = {
    "pol": "pl", "eng": "en", "ger": "de", "deu": "de", "fre": "fr", "fra": "fr",
    "spa": "es", "ita": "it", "rus": "ru", "ukr": "uk", "cze": "cs", "ces": "cs",
    "swe": "sv", "nor": "no", "dut": "nl", "nld": "nl", "por": "pt", "jpn": "ja",
    "chi": "zh", "zho": "zh",
}

_LOCK = threading.Lock()
_LAST = {}
_BLOCKED = {}


class ProviderError(Exception):
    pass


def _override(url: str) -> str:
    base = os.environ.get("ETHOS_BOOKS_ENRICH_BASE", "").strip().rstrip("/")
    if not base:
        return url
    parsed = urllib.parse.urlparse(base)
    target = urllib.parse.urlparse(url)
    return parsed._replace(path=target.path, query=target.query).geturl()


def _allowed(provider: str, url: str) -> bool:
    if os.environ.get("ETHOS_BOOKS_ENRICH_BASE", "").strip():
        return True  # offline test fixture
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.port not in (None, 443):
        return False
    host = (parsed.hostname or "").lower()
    return any(host == allowed or host.endswith("." + allowed) for allowed in HOSTS[provider])


class _Redirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, provider: str):
        self.provider = provider

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _allowed(self.provider, _override(newurl)):
            raise urllib.error.HTTPError(newurl, code, "redirect outside the allowlist", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _request(url: str):
    return urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json,image/*;q=0.8",
    })


def _throttle(provider: str) -> None:
    with _LOCK:
        wait = GAP - (time.time() - _LAST.get(provider, 0.0))
        if wait > 0:
            time.sleep(wait)
        _LAST[provider] = time.time()


def _blocked(provider: str) -> bool:
    with _LOCK:
        return _BLOCKED.get(provider, 0.0) > time.time()


def _block(provider: str) -> None:
    with _LOCK:
        _BLOCKED[provider] = time.time() + BLOCK_SECONDS


def reset() -> None:
    """Test helper: clear throttle/block state."""
    with _LOCK:
        _LAST.clear()
        _BLOCKED.clear()


def _open(provider: str, url: str, limit: int):
    if _blocked(provider):
        raise ProviderError(f"{provider} is cooling down after a rate limit")
    target = _override(url)
    if not _allowed(provider, target):
        raise ProviderError(f"{provider} URL is not allowed")
    _throttle(provider)
    opener = urllib.request.build_opener(_Redirect(provider))
    try:
        with opener.open(_request(target), timeout=TIMEOUT) as response:
            if response.status >= 500:
                _block(provider)
                raise ProviderError(f"{provider} answered {response.status}")
            if response.status in (403, 429):
                _block(provider)
                raise ProviderError(f"{provider} rate-limited ({response.status})")
            if response.status != 200:
                raise ProviderError(f"{provider} answered {response.status}")
            return response.read(limit + 1)
    except ProviderError:
        raise
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429):
            _block(provider)
        raise ProviderError(f"{provider} answered {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ProviderError(f"{provider} unreachable: {exc}") from None


def _get_json(provider: str, url: str):
    raw = _open(provider, url, MAX_JSON)
    if len(raw) > MAX_JSON:
        raise ProviderError(f"{provider} response is too large")
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        raise ProviderError(f"{provider} returned invalid JSON") from None


def get_image(provider: str, url: str):
    """Download a cover; returns (bytes, ext) or None. Magic bytes decide the type."""
    try:
        blob = _open(provider, url, MAX_IMAGE)
    except ProviderError:
        return None
    if not blob or len(blob) > MAX_IMAGE:
        return None
    if blob[:3] == b"\xff\xd8\xff":
        return blob, "jpg"
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return blob, "png"
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return blob, "webp"
    return None


def strip_html(value) -> str:
    text = re.sub(r"<br\s*/?>", "\n", str(value or ""), flags=re.I)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " "))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:4000]


def _year(value) -> int:
    match = re.search(r"(?:19|20)\d{2}", str(value or ""))
    return int(match.group(0)) if match else 0


def _clean_title(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:300]


def _candidate(provider: str, **fields) -> dict:
    base = {
        "source": provider, "source_id": "", "title": "", "author": "", "narrator": "",
        "series": "", "series_index": 0.0, "year": 0, "language": "", "description": "",
        "publisher": "", "isbn": "", "pages": 0, "genres": [], "rating": 0.0,
        "cover_url": "", "source_url": "",
    }
    base.update({key: value for key, value in fields.items() if value not in (None, "")})
    base["title"] = _clean_title(base["title"])
    return base


def apple_search(title: str, author: str) -> list:
    term = " ".join(part for part in (title, author) if part).strip()
    if not term:
        return []
    params = {"term": term, "media": "ebook", "country": APPLE_COUNTRY,
              "limit": str(MAX_PER_PROVIDER)}
    data = _get_json("apple", APPLE_SEARCH + "?" + urllib.parse.urlencode(params))
    results = data.get("results") if isinstance(data, dict) else None
    out = []
    for item in (results or [])[:MAX_PER_PROVIDER]:
        if not isinstance(item, dict):
            continue
        artwork = str(item.get("artworkUrl100") or "")
        cover = artwork.replace("100x100bb", "600x600bb") if artwork else ""
        genres = [genre for genre in (item.get("genres") or [])
                  if isinstance(genre, str) and genre.lower() != "books"]
        out.append(_candidate(
            "apple",
            source_id=str(item.get("trackId") or ""),
            title=item.get("trackCensoredName") or item.get("trackName") or "",
            author=item.get("artistName") or "",
            year=_year(item.get("releaseDate")),
            description=strip_html(item.get("description")),
            genres=genres[:6],
            rating=float(item.get("averageUserRating") or 0),
            cover_url=cover,
            source_url=item.get("trackViewUrl") or "",
        ))
    return out


def google_search(title: str, author: str, key: str = "") -> list:
    query = f'intitle:"{title}"' if title else ""
    if author:
        query += ("+" if query else "") + f'inauthor:"{author}"'
    if not query:
        return []
    params = {"q": query, "country": "PL", "maxResults": str(MAX_PER_PROVIDER),
              "printType": "books"}
    if key:
        params["key"] = key
    data = _get_json("google", GOOGLE_SEARCH + "?" + urllib.parse.urlencode(params))
    items = data.get("items") if isinstance(data, dict) else None
    out = []
    for item in (items or [])[:MAX_PER_PROVIDER]:
        info = item.get("volumeInfo") if isinstance(item, dict) else None
        if not isinstance(info, dict):
            continue
        links = info.get("imageLinks") if isinstance(info.get("imageLinks"), dict) else {}
        cover = str(links.get("large") or links.get("medium") or links.get("thumbnail") or "")
        cover = cover.replace("&edge=curl", "").replace("zoom=1", "zoom=3")
        if cover.startswith("http://"):
            cover = "https://" + cover[len("http://"):]
        isbn = ""
        for ident in info.get("industryIdentifiers") or []:
            if isinstance(ident, dict) and ident.get("type") in ("ISBN_13", "ISBN_10"):
                isbn = str(ident.get("identifier") or "")
                break
        out.append(_candidate(
            "google",
            source_id=str(item.get("id") or ""),
            title=(info.get("title") or "") + (
                f" {info['subtitle']}" if info.get("subtitle") else ""),
            author=", ".join(str(name) for name in (info.get("authors") or [])[:3]),
            year=_year(info.get("publishedDate")),
            description=strip_html(info.get("description")),
            publisher=str(info.get("publisher") or ""),
            isbn=isbn,
            pages=int(info.get("pageCount") or 0),
            genres=[str(genre) for genre in (info.get("categories") or [])[:6]],
            rating=float(info.get("averageRating") or 0),
            cover_url=cover,
            source_url=info.get("canonicalVolumeLink") or info.get("infoLink") or "",
        ))
    return out


def openlibrary_search(title: str, author: str) -> list:
    params = {"title": title, "limit": "5",
              "fields": "key,title,author_name,first_publish_year,cover_i,language,series"}
    if author:
        params["author"] = author
    data = _get_json("openlibrary", OPENLIB_SEARCH + "?" + urllib.parse.urlencode(params))
    docs = data.get("docs") if isinstance(data, dict) else None
    out = []
    for doc in (docs or [])[:8]:
        if not isinstance(doc, dict):
            continue
        cover_id = doc.get("cover_i")
        series = doc.get("series")
        if isinstance(series, list):
            series = series[0] if series else ""
        languages = [str(code).lower() for code in (doc.get("language") or [])
                     if isinstance(code, str)]
        language = OPENLIB_LANGUAGES.get(languages[0], languages[0]) if len(set(languages)) == 1 else ""
        out.append(_candidate(
            "openlibrary",
            source_id=str(doc.get("key") or ""),
            title=doc.get("title") or "",
            author=", ".join(str(name) for name in (doc.get("author_name") or [])[:3]),
            year=int(doc.get("first_publish_year") or 0),
            language=language,
            series=series or "",
            cover_url=OPENLIB_COVER.format(cover=cover_id)
            if isinstance(cover_id, int) and cover_id > 0 else "",
            source_url=f"https://openlibrary.org{str(doc.get('key') or '')}",
        ))
    return out


def provider_order(provider: str) -> list:
    if provider == "apple":
        return ["apple"]
    if provider == "google":
        return ["google"]
    if provider == "openlibrary":
        return ["openlibrary"]
    return ["apple", "google", "openlibrary"]


def search(title: str, author: str, provider: str = "auto", google_key: str = "") -> tuple:
    """Query providers in order; returns (candidates, tried, errors)."""
    candidates, tried, errors = [], [], []
    for name in provider_order(provider):
        if name == "google" and not title:
            continue
        try:
            if name == "apple":
                found = apple_search(title, author)
            elif name == "google":
                found = google_search(title, author, google_key)
            else:
                found = openlibrary_search(title, author)
            tried.append(name)
            candidates.extend(found)
        except ProviderError as exc:
            errors.append(str(exc))
    return candidates, tried, errors


# ── scoring ────────────────────────────────────────────────────────────────


def similarity(left, right) -> float:
    a, b = fold(left), fold(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        short, long_ = (len(a), len(b)) if len(a) <= len(b) else (len(b), len(a))
        return 0.72 + 0.24 * (short / max(1, long_))
    return difflib.SequenceMatcher(None, a, b).ratio()


def author_match(wanted: str, candidate: str) -> float:
    wanted_fold = fold(wanted)
    if not wanted_fold or not candidate:
        return 0.0
    best = 0.0
    for name in str(candidate).split(",")[:4]:
        value = fold(name)
        if not value:
            continue
        if value == wanted_fold:
            return 1.0
        if wanted_fold in value or value in wanted_fold:
            best = max(best, 0.85)
        elif set(wanted_fold.split()) & set(value.split()):
            best = max(best, 0.6)
    return best


def score(book: dict, candidate: dict, titles=None) -> float:
    wanted_titles = titles or [book.get("title") or ""]
    title = max((similarity(candidate.get("title"), value) for value in wanted_titles), default=0.0)
    author = author_match(book.get("author") or "", candidate.get("author") or "")
    if not book.get("author"):
        return title
    # An exact title with the wrong author is usually a different edition of
    # something else — keep the author's weight high enough to reject it.
    return 0.65 * title + 0.35 * author
