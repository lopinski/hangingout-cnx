"""Collapse the same event posted on several platforms into one listing."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from . import config

_NOISE = re.compile(r"\b(the|a|an|at|in|of|and|chiang ?mai|cnx|free|event|2026|2027)\b")


def _key(text: str) -> str:
    text = re.sub(r"[^a-z0-9ก-๙ ]+", " ", text.lower())
    return re.sub(r"\s+", " ", _NOISE.sub(" ", text)).strip()


def similarity(a: str, b: str) -> float:
    """Fuzzy match that also survives reordered words ("Jazz Night at X" vs "X Jazz Night")."""
    key_a, key_b = _key(a), _key(b)
    if not key_a or not key_b:
        return 0.0
    in_order = SequenceMatcher(None, key_a, key_b).ratio()
    sorted_words = SequenceMatcher(None, " ".join(sorted(key_a.split())), " ".join(sorted(key_b.split()))).ratio()
    return max(in_order, sorted_words)


def _start_minutes(event: dict) -> int | None:
    match = re.match(r"(\d{1,2}):(\d{2}) (AM|PM)", event.get("time", ""))
    if not match:
        return None
    hour = int(match.group(1)) % 12 + (12 if match.group(3) == "PM" else 0)
    return hour * 60 + int(match.group(2))


def same_event(a: dict, b: dict) -> bool:
    if a["date"] != b["date"]:
        return False
    if a["link"] and a["link"] == b["link"]:
        return True
    titles = similarity(a["title"], b["title"])
    if titles >= 0.86:
        return True
    # One source posting two stories about the same festival day.
    shared_festival = {t for t in a["tags"] if t.startswith("festival:")} & set(b["tags"])
    if shared_festival and a.get("source") == b.get("source") and a["time"] == b["time"] == "All day":
        return True
    # Looser title match is enough when the place and start time also agree.
    venues = similarity(a["venue"], b["venue"])
    start_a, start_b = _start_minutes(a), _start_minutes(b)
    close_in_time = start_a is not None and start_b is not None and abs(start_a - start_b) <= 60
    return titles >= 0.6 and venues >= 0.8 and close_in_time


def _rank(event: dict) -> tuple:
    """Lower is better: trusted source first, then the more complete record."""
    source = event.get("source", "")
    priority = config.SOURCE_PRIORITY.index(source) if source in config.SOURCE_PRIORITY else 99
    completeness = (event["time"] != "All day") + bool(event["link"]) + (event["neighborhood"] != "Chiang Mai")
    return (priority, -completeness)


def dedupe(events: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for event in sorted(events, key=_rank):
        if not any(same_event(event, other) for other in kept):
            kept.append(event)
    return kept
