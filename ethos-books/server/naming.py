"""Release / folder name parsing for the Books package (stdlib only).

The NAS library is full of scene and store naming conventions, so a folder name
is often the richest metadata available offline:

    "Nesbø Jo - Cykl Harry Hole Tom 14 Cięcie (czyta Mariusz Bonaszewski)"
    "Mróz Remigiusz - Konfrontacja (czyta Krzysztof Gosztyła, Filip Kosior)"
    "Andrzej.Krajewski.Ropa.Krew.cywilizacji.2023"
    "eryk-zdobywca-swiatow-podloga-to-lawa-piotr-borlik-ebookpoint"

`parse_name()` turns those into title / author / narrator / series / index /
year without any network call. It is intentionally conservative: a field is
only returned when the name clearly contains it, and `confidence` lets callers
decide whether to trust the result over an online provider.
"""

import re
import unicodedata

# Folded (ASCII, lowercase) first names used to decide the order of the two
# leading tokens in" Surname Given" vs "Given Surname" names.
FIRST_NAMES = frozenset("""
adam adrian agata agnieszka ala aleksander aleksandra alicja andrzej aneta anna
antoni artur barbara bartek bartosz beata bogdan bozena cezary dariusz dawid
dominik dorota ewa filip franciszek gabriela grazyna grzegorz hanna hubert ignacy
iwona izabela jacek jakub jan janina jaroslaw jerzy joanna julia justyna kacper
kamila karol karolina katarzyna kazimierz kinga konrad krystian krystyna
krzysztof leszek lukasz maciej magdalena malgorzata marcin marek maria marian
mariusz marta mateusz michal mikolaj milena monika natalia pawel piotr rafal
remigiusz
robert roman ryszard sebastian stanislaw sylwia szymon tadeusz tomasz urszula
waldemar wieslaw witold wladyslaw wojciech zbigniew zofia zuzanna
aaron alan albert andrew arthur austin benjamin billy bobby bradley brandon
brian bruce bryan carl charles christian christopher daniel david dennis douglas
dylan edward eric ethan eugene frank gabriel gary gerald gregory harold harry
henry hiroko ivan jack james jason jeff jeremy jerry jesse jo joe john johnny
jordan jose joseph juan justin keith kevin kyle larry lawrence logan louis mark
matthew michael nathan noah patrick paul peter philip ralph randy raymond
richard robert roger roy russell samuel scott sean stephen steven terry thomas
timothy tyler vincent walter wayne william willie zachary
anders boris dmitri erik jens lars nils olga sven
""".split())

AUTHOR_STOPWORDS = frozenset("""
saga cykl seria tom ksiega ksiazka zbior opowiadania powiesc audiobook
sluchowisko dubbing lektor czyta wersja wydanie polish polski
""".split())

VENDORS = frozenset("""
ebookpoint empik audioteka lubimyczyta lubimyczytac storytel legimi nexto publio
pl com net org
""".split())

_NARRATOR_PAREN = re.compile(r"\(\s*(?:czyta|czyta:)\s*([^)]+)\)", re.I)
_NARRATOR_TAIL = re.compile(r"\b(?:czyta|lektor)\s*:?\s*([^()\[\]]+?)(?=\s+\d{2,4}\s*(?:kbps|vbr|p)\b|\s*$)", re.I)
_BITRATE = re.compile(r"\b\d{2,4}\s*(?:kbps|kb/s|kbit|vbrp|vbr|abr|cbr|p)\b", re.I)
_FORMAT_TAGS = re.compile(
    r"\b(?:mp3|m4a|m4b|flac|ogg|opus|aac|audiobook|ebook|e-?book|retail|proper|webrip|em|pl|polish|polski)\b",
    re.I,
)
_YEAR = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
_INITIAL = re.compile(r"^[A-ZĄĆĘŁŃÓŚŹŻ]\.?$")

_SERIES_PATTERNS = (
    re.compile(
        r"\bCykl\s+(?P<series>.+?)\s+(?:Tom|T|Vol\.?|Ksi[ęe]ga|Cz[ęe][śs][ćc])\s*(?P<idx>\d{1,3})\b",
        re.I,
    ),
    re.compile(
        r"\b(?P<series>[A-ZĄĆĘŁŃÓŚŹŻ][\w\s.'’-]{1,60}?)\s+"
        r"(?:Tom|Vol\.?|Ksi[ęe]ga|Cz[ęe][śs][ćc])\s*(?P<idx>\d{1,3})\b",
    ),
    re.compile(r"\(\s*(?P<series>[^()]+?)\s*[,;]\s*(?:tom|t\.?)\s*(?P<idx>\d{1,3})\s*\)", re.I),
)


_FIRST_NAME_SET = frozenset(name.replace(" ", "") for name in FIRST_NAMES)


def fold(value) -> str:
    """Lowercase ASCII form used for comparisons ('Mróz' == 'mroz')."""
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return " ".join(text.split())


def _blank() -> dict:
    return {
        "title": "",
        "author": "",
        "narrator": "",
        "series": "",
        "series_index": 0.0,
        "year": 0,
        "confidence": 0.0,
    }


def _is_first_name(token: str) -> bool:
    return fold(token).replace(" ", "") in _FIRST_NAME_SET


def _tidy_narrator(value: str) -> str:
    text = _BITRATE.sub(" ", value or "")
    text = _FORMAT_TAGS.sub(" ", text)
    text = _YEAR.sub(" ", text)
    text = re.sub(r"\s+\bi\b\s+", ", ", text)
    text = re.sub(r"\s*[,;]\s*", ", ", text)
    text = re.sub(r"\s+", " ", text).strip(" ,;.-–—")
    return text[:200]


def _take_narrator(text: str) -> tuple:
    narrator = ""
    match = _NARRATOR_PAREN.search(text)
    if match:
        narrator = match.group(1)
        text = (text[: match.start()] + " " + text[match.end():]).strip()
    else:
        match = _NARRATOR_TAIL.search(text)
        if match:
            narrator = match.group(1)
            text = text[: match.start()].strip(" -–—,;:")
    return text, _tidy_narrator(narrator)


def _take_series(text: str) -> tuple:
    for pattern in _SERIES_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        series = match.group("series").strip(" -–—,;:.")
        if len(series) < 2 or fold(series) in AUTHOR_STOPWORDS:
            continue
        try:
            index = float(match.group("idx"))
        except (TypeError, ValueError):
            continue
        rest = (text[: match.start()] + " " + text[match.end():]).strip(" -–—,;:")
        return rest, series[:200], index
    return text, "", 0.0


def _take_year(text: str) -> tuple:
    for match in reversed(list(_YEAR.finditer(text))):
        tail = text[match.end():].strip(" ()[]-–—,;:.")
        if tail:
            continue
        return text[: match.start()].rstrip(" ()[]-–—,;:."), int(match.group(1))
    return text, 0


def _strip_noise(text: str) -> str:
    text = _BITRATE.sub(" ", text)
    text = _FORMAT_TAGS.sub(" ", text)
    text = re.sub(r"[\(\[]\s*[\)\]]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -–—,;:.")


def _tidy_title(text: str) -> str:
    # "Ropa.Krew" -> "Ropa. Krew" but leave ellipses and initials alone.
    text = re.sub(r"(?<=[a-ząćęłńóśźż])\.(?=[A-ZĄĆĘŁŃÓŚŹŻ])", ". ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip(" -–—,;:.")
    if text:
        text = text[0].upper() + text[1:]
    return text[:300]


def _clean_author(value: str) -> str:
    text = _BITRATE.sub(" ", value or "")
    text = _FORMAT_TAGS.sub(" ", text)
    # Keep trailing dots: "Mist A. P." uses them for initials.
    text = re.sub(r"\s+", " ", text).strip(" -–—,;:")
    return text[:200]


def _author_from_pair(left: str) -> str:
    left = _clean_author(left)
    tokens = [token for token in left.split() if token]
    if not tokens or len(tokens) > 4:
        return ""
    if any(re.search(r"\d", token) for token in tokens):
        return ""
    if any(fold(token) in AUTHOR_STOPWORDS for token in tokens):
        return ""
    if len(tokens) == 1:
        return tokens[0]
    if len(tokens) >= 3 and all(_INITIAL.match(token) for token in tokens[1:]):
        return " ".join(tokens[1:]) + " " + tokens[0]
    first, second = tokens[0], tokens[1]
    if _is_first_name(second) and not _is_first_name(first):
        return f"{second} {first}"
    if _is_first_name(first):
        return f"{first} {second}"
    return left


def _title_from_tokens(tokens: list) -> str:
    return _tidy_title(_strip_noise(" ".join(token for token in tokens if token)))


def _parse_pair(text: str, result: dict) -> None:
    match = re.search(r"\s+[-–—]\s+", text)
    left, right = (text[: match.start()], text[match.end():]) if match else ("", text)
    author = _author_from_pair(left)
    if author:
        result["author"] = author
        known_name = any(_is_first_name(token) for token in left.split()[:2])
        result["confidence"] = 0.9 if known_name else 0.78
    right, narrator = _take_narrator(right)
    right, year = _take_year(right)
    right, series, index = _take_series(right)
    result["title"] = _tidy_title(_strip_noise(right))
    result["narrator"] = narrator
    result["series"] = series
    result["series_index"] = index
    result["year"] = year


def _parse_dotted(text: str, result: dict) -> None:
    tokens = [token for token in re.split(r"[._]+", text) if token]
    year = 0
    if tokens and re.fullmatch(r"(?:19|20)\d{2}", tokens[-1]):
        year = int(tokens.pop())
    cleaned = []
    for token in tokens:
        low = token.lower()
        if _BITRATE.fullmatch(token) or low in {
            "em", "pl", "polish", "polski", "audiobook", "ebook", "mp3", "m4a", "m4b",
            "flac", "ogg", "opus", "vbr", "vbrp", "p",
        }:
            continue
        cleaned.append(token)
    tokens = cleaned
    narrator = ""
    if any(token.lower() == "czyta" for token in tokens):
        position = next(i for i, token in enumerate(tokens) if token.lower() == "czyta")
        narrator = _tidy_narrator(" ".join(tokens[position + 1:]))
        tokens = tokens[:position]
    if len(tokens) < 2:
        return
    author = ""
    rest = tokens
    if len(tokens) >= 3:
        if _is_first_name(tokens[0]):
            author = f"{tokens[0]} {tokens[1]}"
            rest = tokens[2:]
        elif _is_first_name(tokens[1]):
            author = f"{tokens[1]} {tokens[0]}"
            rest = tokens[2:]
    if author:
        result["author"] = _clean_author(author)
        result["confidence"] = 0.85
    title = _title_from_tokens(rest)
    title, series, index = _take_series(title)
    result["title"] = _tidy_title(title)
    result["series"] = series
    result["series_index"] = index
    result["narrator"] = narrator
    result["year"] = year


def _parse_slug(text: str, result: dict) -> None:
    tokens = [token for token in re.split(r"-+", text) if token]
    while tokens and token_is_vendor(tokens[-1]):
        tokens.pop()
    author = ""
    if len(tokens) >= 4 and _is_first_name(tokens[-2]) and not _is_first_name(tokens[-1]):
        author = f"{tokens[-2].capitalize()} {tokens[-1].capitalize()}"
        tokens = tokens[:-2]
    if author:
        result["author"] = author
    result["title"] = _tidy_title(" ".join(tokens))
    result["confidence"] = 0.6 if author else 0.45


def token_is_vendor(token: str) -> bool:
    return token.lower().strip(".") in VENDORS


def parse_name(name: str) -> dict:
    """Parse one folder or file stem into metadata fields (never raises)."""
    result = _blank()
    raw = str(name or "").strip()
    if not raw:
        return result
    text = re.sub(r"\s+", " ", raw.replace("_", " ")).strip()
    try:
        if re.search(r"\s+[-–—]\s+", text):
            _parse_pair(text, result)
        elif "." in text and " " not in text:
            _parse_dotted(text, result)
        elif "-" in text and " " not in text:
            _parse_slug(text, result)
        else:
            cleaned, narrator = _take_narrator(text)
            cleaned, year = _take_year(cleaned)
            cleaned, series, index = _take_series(cleaned)
            result["title"] = _tidy_title(_strip_noise(cleaned))
            result["narrator"] = narrator
            result["series"] = series
            result["series_index"] = index
            result["year"] = year
            result["confidence"] = 0.4
    except (ValueError, TypeError, IndexError):  # pragma: no cover - defensive
        return _blank()
    if not result["title"]:
        result["title"] = _tidy_title(_strip_noise(text))
    return result


def looks_like_release(name: str) -> bool:
    """True for scene/release folder names that must never become an author."""
    text = str(name or "")
    if not text:
        return False
    if _BITRATE.search(text) or re.search(r"\b(?:vbr|kbps|webrip|retail|audiobook|em)\b", text, re.I):
        return True
    if text.count(".") >= 3 and " " not in text:
        return True
    return False
