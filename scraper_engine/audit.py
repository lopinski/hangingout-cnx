#!/usr/bin/env python3
"""Accuracy audit for the published feed.

    python scraper_engine/audit.py           # offline checks on events.json
    python scraper_engine/audit.py --links   # also request every source link (slow, polite)

Checks every listing for: required fields, a valid date and time, calendar times
that make sense (the same arithmetic the site uses for Google Calendar and .ics),
a clean title, a usable Google Maps link, plausible coordinates, a well-formed
source link and pictures that exist on disk. Exits 1 if anything is wrong.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scraper_engine import config          # noqa: E402
from scraper_engine.fetch import FetchError, Fetcher   # noqa: E402

REQUIRED = ("id", "title", "venue", "neighborhood", "date", "time", "category", "type", "is_free",
            "timeStatus", "description", "link", "mapsUrl", "tags", "imageUrl")
TIME = re.compile(r"^(\d{1,2}):(\d{2}) (AM|PM)(?: - (\d{1,2}):(\d{2}) (AM|PM))?$")
DEFAULT_DURATION = timedelta(hours=2)


def _clock(hour: str, minute: str, half: str) -> timedelta:
    return timedelta(hours=int(hour) % 12 + (12 if half == "PM" else 0), minutes=int(minute))


def calendar_span(event: dict) -> tuple[str, str]:
    """The UTC start/end stamps the site puts in Google Calendar links and .ics files."""
    day = datetime.fromisoformat(event["date"]).replace(tzinfo=config.BANGKOK)
    match = TIME.match(event["time"])
    if not match:                                              # all-day
        return day.strftime("%Y%m%d"), (day + timedelta(days=1)).strftime("%Y%m%d")
    start = day + _clock(*match.group(1, 2, 3))
    end = day + _clock(*match.group(4, 5, 6)) if match.group(4) else start + DEFAULT_DURATION
    if end <= start:
        end += timedelta(days=1)                               # runs past midnight
    stamp = "%Y%m%dT%H%M%SZ"
    return start.astimezone(timezone.utc).strftime(stamp), end.astimezone(timezone.utc).strftime(stamp)


def check_event(event: dict, today: date) -> list[str]:
    problems = [f"missing field: {key}" for key in REQUIRED if key not in event]
    if problems:
        return problems

    # Identity and schedule
    if not re.fullmatch(r"[a-z0-9-]+-\d{4}-\d{2}-\d{2}", event["id"]):
        problems.append("id is not slug-hash-date")
    try:
        day = date.fromisoformat(event["date"])
        if not (today <= day <= today + timedelta(days=config.WINDOW_DAYS)):
            problems.append("date outside the listing window")
    except ValueError:
        return problems + ["date is not YYYY-MM-DD"]
    if event["time"] != "All day" and not TIME.match(event["time"]):
        problems.append(f"time not understood: {event['time']!r}")
    else:
        start, end = calendar_span(event)
        if not (start < end and len(start) == len(end) and len(start) in (8, 16)):
            problems.append(f"calendar span invalid: {start}/{end}")

    # Text that ends up in calendar entries and share messages
    title = event["title"]
    if not title.strip() or len(title) > 90:
        problems.append("title empty or longer than 90 characters")
    if any(unicodedata.category(ch) in ("Cc", "Cf", "So", "Co", "Cs") for ch in title):
        problems.append("title contains control characters or symbols")
    if "�" in title + event["venue"] + event["description"]:
        problems.append("broken character (U+FFFD) in text")
    letters = [ch for ch in title if ch.isalpha() and ch.isascii()]
    if len(letters) > 8 and all(ch.isupper() for ch in letters):
        problems.append("title is all capitals")
    if len(event["description"]) < 40:
        problems.append("description too short")

    # Taxonomy
    if config.CATEGORIES.get(event["type"]) != event["category"]:
        problems.append(f"type/category mismatch: {event['type']}/{event['category']}")
    if event["neighborhood"] not in (*config.NEIGHBORHOODS, "Chiang Mai"):
        problems.append(f"unknown neighbourhood: {event['neighborhood']}")
    if not isinstance(event["is_free"], bool) or not isinstance(event["tags"], list):
        problems.append("is_free must be a boolean and tags a list")

    # Links
    maps = urlsplit(event["mapsUrl"])
    query = parse_qs(maps.query).get("q", [""])[0].strip()
    if (maps.scheme, maps.netloc) != ("https", "maps.google.com") or len(query) < 6:
        problems.append("mapsUrl is not a Google Maps search")
    if event["link"]:
        link = urlsplit(event["link"])
        if link.scheme not in ("http", "https") or "." not in link.netloc or " " in event["link"]:
            problems.append("source link is malformed")
    if ("lat" in event) != ("lng" in event):
        problems.append("lat and lng must come together")
    elif "lat" in event and not (17.5 <= event["lat"] <= 20.5 and 97.5 <= event["lng"] <= 100.5):
        problems.append("coordinates are not in northern Thailand")

    # Pictures
    picture = re.fullmatch(r"\./assets/images/opt/([a-z_-]+)-960\.jpg", event["imageUrl"])
    if not picture:
        problems.append("imageUrl is not a local picture")
    else:
        for size in (480, 720, 960):
            if not (config.REPO_ROOT / "assets" / "images" / "opt" / f"{picture.group(1)}-{size}.jpg").exists():
                problems.append(f"picture file missing: {picture.group(1)}-{size}.jpg")
    return problems


def check_feed(events: list[dict], today: date) -> dict[str, list[str]]:
    report: dict[str, list[str]] = {}
    seen: set[str] = set()
    for index, event in enumerate(events):
        label = event.get("id") or f"#{index}"
        problems = check_event(event, today)
        if event.get("id") in seen:
            problems.append("duplicate id")
        seen.add(event.get("id"))
        if problems:
            report[label] = problems
    return report


def check_links(events: list[dict], fetcher: Fetcher | None = None) -> dict[str, str]:
    """Request each distinct source link once. Returns {link: problem} for those that fail."""
    fetcher = fetcher or Fetcher(retries=1)
    failures: dict[str, str] = {}
    links = sorted({event["link"] for event in events if event.get("link")})
    for position, link in enumerate(links, 1):
        if not fetcher.allowed(link):
            print(f"  [{position}/{len(links)}] skipped (robots.txt): {link}")
            continue
        try:
            fetcher.get(link)
        except FetchError as error:
            failures[link] = str(error).split(": ", 1)[-1]
            print(f"  [{position}/{len(links)}] FAILED {failures[link]}: {link}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--links", action="store_true", help="also request every source link")
    args = parser.parse_args()

    events = json.loads(config.EVENTS_JSON.read_text(encoding="utf-8"))
    today = datetime.now(config.BANGKOK).date()
    report = check_feed(events, today)
    for label, problems in report.items():
        for problem in problems:
            print(f"  {label}: {problem}")
    print(f"Audit: {len(events)} listings checked, {len(report)} with problems.")

    failed_links = {}
    if args.links:
        failed_links = check_links(events)
        total = len({event['link'] for event in events if event.get('link')})
        print(f"Links: {total} distinct source links requested, {len(failed_links)} failed.")
    return 1 if report or failed_links else 0


if __name__ == "__main__":
    sys.exit(main())
