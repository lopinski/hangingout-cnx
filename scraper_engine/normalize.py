"""Turn a RawEvent into the site's event schema.

Everything published here is either a plain fact (title, time, place, link)
or wording written by this module. Source descriptions are read only to pick
a category and tags; they are never copied into the output.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import date, timedelta
from urllib.parse import quote_plus, urlsplit

from . import config
from .models import RawEvent

# -- Taxonomy -----------------------------------------------------------------
# Checked in order; the first type with a matching keyword wins.
# Each keyword doubles as a tag (spaces become hyphens).
TYPE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("dance", ["salsa", "bachata", "kizomba", "tango", "swing dance", "zouk", "ecstatic dance",
               "afro-latin", "afro latin", "dance"]),
    ("language", ["language exchange", "thai lesson", "learn thai", "english class",
                  "conversation club", "speak thai"]),
    ("markets", ["night market", "walking street", "farmers market", "farmers' market", "flea market",
                 "thrift", "bazaar", "kad mua", "market"]),
    ("soul", ["meditation", "breathwork", "sound bath", "sound healing", "mindful", "dhamma",
              "buddhis", "monk chat", "cacao", "reiki", "tantra", "spiritual", "kirtan"]),
    ("workout", ["yoga", "acro", "muay thai", "running", "run club", "hike", "hiking", "fitness",
                 "pilates", "climbing", "skate", "football", "badminton", "cycling", "tubing",
                 "workout", "volleyball", "circuit training", "hiit", "walk", "trek"]),
    ("music", ["jazz", "blues", "open mic", "jam session", "live music", "concert", "live band",
               "acoustic", "reggae", "dj set", "gig", "karaoke", "handpan"]),
    ("culture", ["exhibition", "gallery", "museum", "craft", "film", "cinema", "theatre", "theater",
                 "poetry", "book club", "reading club", "sketch", "weaving", "lanna", "temple",
                 "festival", "loy krathong", "yi peng", "art"]),
    ("courses", ["workshop", "masterclass", "bootcamp", "course", "lecture", "seminar", "talk",
                 "pechakucha", "crypto", "coding", "startup", "business", "robotics", "ai", "class"]),
    # Social meetups have no section of their own; the site files them with exchanges.
    ("language", ["new in town", "networking", "social", "meetup", "hangout", "dinner", "brunch",
                  "solo traveller", "solo traveler", "nomad", "board game", "game night"]),
]
SOCIAL_KEYWORDS = {"new in town", "networking", "social", "meetup", "hangout", "dinner", "brunch",
                   "solo traveller", "solo traveler", "nomad", "board game", "game night"}
# Community platforms whose uncategorised listings are, in practice, social meet-ups.
SOCIAL_SOURCES = {"meetup", "luma"}

# Seasonal festivals. A match adds a "festival:<slug>" tag, which the site
# promotes to a top-level filter chip while the festival is on.
FESTIVALS: dict[str, list[str]] = {
    "loy-krathong": ["loy krathong", "loi krathong", "yi peng", "yee peng", "lantern festival"],
    "songkran": ["songkran"],
    "design-week": ["design week"],
    "jazz-festival": ["jazz festival", "jazz fest"],
    "flower-festival": ["flower festival"],
    "afro-latin-festival": ["afro-latin festival", "afro latin festival"],
    "chiang-yai-fest": ["chiang yai fest"],
    "museart-festival": ["museart"],
}

# Listings that are adverts rather than community events.
BLOCKLIST = ["forex", "traders show", "trading signals", "investment seminar", "mlm",
             "webinar", "real estate seminar", "timeshare", "tour package", "pai, thailand"]
# Multi-day tour packages such as "6D/5N".
_TOUR_PACKAGE = re.compile(r"\b\d+\s?d\s?/\s?\d*\s?n?\b", re.I)
# Place names too vague to be a venue.
VAGUE_VENUES = {"chiang mai", "chiang mai city", "thailand", "chiangmai", "online"}

# Neighbourhood gazetteer: first match wins.
NEIGHBORHOOD_HINTS: list[tuple[str, list[str]]] = [
    ("Hang Dong", ["hang dong", "baan tawai", "rajapruek", "mae hia", "หางดง"]),
    ("Santitham", ["santitham", "jing jai", "chang phueak", "chang puak", "ช้างเผือก", "สันติธรรม"]),
    ("Nimman", ["nimman", "huay kaew", "huaykaew", "maya", "suthep", "wat suan dok", "cmu",
                "นิมมาน", "สุเทพ"]),
    ("Riverside", ["riverside", "charoenrat", "charoen rat", "wat ket", "วัดเกต", "ping river",
                   "pingriver", "night bazaar", "kalare", "chang klan", "railway station",
                   "tha phae road", "thapae east", "warorot", "ช้างคลาน"]),
    ("Old City", ["old city", "tha phae gate", "thapae gate", "three kings", "ratchadamnoen",
                  "rachadamnoen", "moon muang", "chedi luang", "north gate", "nong buak",
                  "wua lai", "phra singh", "sri phum", "si phum", "ศรีภูมิ", "พระสิงห์"]),
]

IMAGE_BY_TYPE = {key: key for key in config.CATEGORIES}

KIND_PHRASE = {
    "music": ["a live music night", "an evening of live sets"],
    "dance": ["a social dance night", "an evening of social dancing"],
    "markets": ["a market of stalls, street food and local makers", "a browse-and-graze market"],
    "workout": ["a get-moving session", "an active meet-up"],
    "soul": ["a slower-paced gathering for mind and spirit", "a quiet, reflective session"],
    "language": ["a language and conversation meet-up", "a chance to practise languages with locals and travellers"],
    "courses": ["a hands-on session for learning something new", "a talk-and-learn session"],
    "culture": ["an arts and culture outing", "a cultural event"],
    "social": ["a relaxed social meet-up", "an easy way to meet people in town"],
}

SMALL_WORDS = {"a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "to", "with", "x"}
KEEP_UPPER = {"CNX", "DJ", "AI", "DTV", "CMU", "JJ", "NYE", "BBQ"}


# -- Small text helpers ------------------------------------------------------
def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def clean_title(raw: str) -> str:
    title = "".join(ch for ch in raw if unicodedata.category(ch) not in ("So", "Sk", "Cs", "Co"))
    title = title.replace("️", "").replace("‍", "")
    title = re.sub(r"【[^】]*】", "", title)
    title = re.sub(r"\((?:every ?day|daily|\d{1,2}(?::\d{2})?\s*(?:am|pm))\)", "", title, flags=re.I)
    title = re.sub(r"^(?:get ready for|join us for|don't miss)\s+(?:the\s+)?", "", title, flags=re.I)
    title = re.sub(r"\s+", " ", title).strip(" -–—:|·")
    letters = [ch for ch in title if ch.isalpha() and ch.isascii()]
    if letters and all(ch.isupper() for ch in letters):         # tame ALL CAPS
        words = []
        for index, word in enumerate(title.lower().split(" ")):
            if word.upper() in KEEP_UPPER:
                words.append(word.upper())
            elif index and word in SMALL_WORDS:
                words.append(word)
            else:
                words.append(word[:1].upper() + word[1:])
        title = " ".join(words)
    elif title and title[0].islower():
        title = title[0].upper() + title[1:]
    if len(title) > 90:
        title = title[:87].rsplit(" ", 1)[0] + "…"
    return title


def _contains(haystack: str, keyword: str) -> bool:
    """Whole-word match for short keywords, substring match for longer phrases."""
    if len(keyword) <= 5 and keyword.isascii():
        return re.search(rf"(?<![a-z]){re.escape(keyword)}(?![a-z])", haystack) is not None
    return keyword in haystack


def classify(title: str, default_social: bool = False) -> tuple[str, list[str], bool]:
    """Title -> (type, tags, is_social).

    Only the title is used: source descriptions mention too many unrelated words
    to classify reliably.
    """
    lowered = title.lower()
    for kind, keywords in TYPE_KEYWORDS:
        hits = [k for k in keywords if _contains(lowered, k)]
        if hits:
            social = bool(set(hits) & SOCIAL_KEYWORDS)
            return kind, (["meetup"] if social else [slugify(k) for k in hits[:2]]), social
    if default_social:
        return "language", ["meetup"], True
    return "culture", [], False


def festival_tags(text: str) -> list[str]:
    lowered = text.lower()
    return [f"festival:{slug}" for slug, names in FESTIVALS.items() if any(n in lowered for n in names)]


def neighborhood_for(*texts: str) -> str:
    lowered = " ".join(texts).lower()
    for name, hints in NEIGHBORHOOD_HINTS:
        if any(hint in lowered for hint in hints):
            return name
    return "Chiang Mai"


def format_time(moment) -> str:
    return moment.strftime("%I:%M %p").lstrip("0")


def time_status(day: date, today: date) -> str:
    if day <= today:
        return "Tonight"
    if day == today + timedelta(days=1):
        return "Tomorrow"
    days_to_sunday = 6 - today.weekday()
    if day.weekday() >= 4 and day <= today + timedelta(days=days_to_sunday):
        return "This Weekend"
    return "Upcoming"


def safe_link(url: str) -> str:
    parts = urlsplit(url or "")
    return url if parts.scheme in ("http", "https") and parts.netloc else ""


def _pick(options: list[str], seed: str) -> str:
    """Deterministic variety: the same event always gets the same phrasing."""
    return options[int(hashlib.sha1(seed.encode()).hexdigest(), 16) % len(options)]


def describe(raw: RawEvent, title: str, venue: str, hood: str, kind: str, social: bool,
             time_label: str, is_free: bool) -> str:
    """Write a short original summary from the facts alone."""
    if venue.endswith("(see listing)"):
        place = "in Chiang Mai"
    else:
        place = "at " + venue + (f" in {hood}" if hood in config.NEIGHBORHOODS and hood.lower() not in venue.lower() else "")
    if raw.blurb:                                               # our own wording, from the recurring schedule
        opener = raw.blurb.rstrip(".") + "."
    else:
        phrase = _pick(KIND_PHRASE["social" if social else kind], title)
        opener = f"{title.rstrip('.!?…')} is {phrase} {place}."

    day_name = raw.day.strftime("%A %-d %B")
    if raw.until and raw.until > raw.day:
        timing = f"It runs until {raw.until.strftime('%-d %B')}."
    elif time_label and time_label.lower() != "all day":
        timing = f"It starts at {time_label.split(' - ')[0]} on {day_name}."
    else:
        timing = f"It takes place on {day_name}."

    if raw.source == "recurring":
        closer = ("Free to join. " if is_free else "") + "A regular fixture, so confirm times with the venue before you go."
    else:
        host = f"Hosted by {raw.organizer}. " if raw.organizer and raw.organizer.lower() not in title.lower() else ""
        closer = host + ("Entry is free." if is_free else "Check the listing for cost and booking.")
    return " ".join([opener, timing, closer])


# -- The normaliser ----------------------------------------------------------
def normalize(raw: RawEvent, today: date) -> dict | None:
    """RawEvent -> schema dict, or None when the event should not be listed."""
    title = clean_title(raw.title)
    if not title or raw.online:
        return None
    haystack = f"{raw.title} {raw.source_text}".lower()
    if any(term in haystack for term in BLOCKLIST) or _TOUR_PACKAGE.search(raw.title):
        return None

    # A multi-day run that has already started is shown on today's page.
    day = raw.day
    if raw.until and day < today <= raw.until:
        day = today
    if not (today <= day <= today + timedelta(days=config.WINDOW_DAYS)):
        return None

    kind, tags, social = classify(title, default_social=raw.source in SOCIAL_SOURCES)
    if raw.type in config.CATEGORIES:                           # the source already knows the section
        kind, social = raw.type, False
        tags = [] if raw.tags else [tag for tag in tags if tag != "meetup"]
    tags = list(dict.fromkeys([*raw.tags, *tags, *festival_tags(raw.title)]))[:5]

    has_venue = bool(raw.venue) and raw.venue.strip().lower() not in VAGUE_VENUES
    venue = raw.venue if has_venue else "Chiang Mai (see listing)"
    hood = raw.neighborhood or neighborhood_for(raw.venue, raw.address)

    if raw.time_label:
        time_label = raw.time_label
    elif raw.start:
        time_label = format_time(raw.start)
        if raw.end and raw.end.date() == raw.start.date() and raw.end > raw.start:
            time_label += f" - {format_time(raw.end)}"
    else:
        time_label = "All day"

    is_free = bool(raw.is_free) or (raw.is_free is None and re.search(r"\bfree\b", raw.title, re.I) is not None)
    digest = hashlib.sha1(f"{title}|{venue}|{day}|{time_label}".lower().encode()).hexdigest()[:6]
    image = "community" if social else IMAGE_BY_TYPE[kind]

    return {
        "id": f"{slugify(title)[:40].strip('-') or 'event'}-{digest}-{day.isoformat()}",
        "title": title,
        "venue": venue,
        "neighborhood": hood,
        "date": day.isoformat(),
        "time": time_label,
        "category": config.CATEGORIES[kind],
        "type": kind,
        "is_free": is_free,
        "timeStatus": time_status(day, today),
        "description": describe(raw, title, venue, hood, kind, social, time_label, is_free),
        "link": safe_link(raw.url),
        "mapsUrl": "https://maps.google.com/?q=" + quote_plus(f"{venue} Chiang Mai" if has_venue else "Chiang Mai"),
        "tags": tags,
        "imageUrl": f"./assets/images/opt/{image}-960.jpg",
        # Extra to the core schema: lets the site credit the listing and lets the
        # pipeline keep a source's events if that source is down on the next run.
        "source": raw.source,
    }


def expand(raw: RawEvent, today: date, max_days: int = 10) -> list[RawEvent]:
    """A short multi-day run (a festival weekend) becomes one listing per day.

    Longer runs, such as a three-month exhibition, stay a single listing that
    normalize() pins to today while the run is on.
    """
    if not raw.until or raw.until <= raw.day or (raw.until - raw.day).days >= max_days:
        return [raw]
    from dataclasses import replace
    return [replace(raw, day=raw.day + timedelta(days=offset))
            for offset in range((raw.until - raw.day).days + 1)]
