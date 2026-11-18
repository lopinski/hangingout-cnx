#!/usr/bin/env python3
"""HangingOut CNX aggregation pipeline.

    python scraper_engine/pipeline.py            # scrape, normalise, write the feed
    python scraper_engine/pipeline.py --dry-run  # print what would be written

Steps: fetch every source -> normalise to the site schema -> drop duplicates ->
write events.json, events.js and sitemap.xml atomically.

Safety rules:
  * One failing source never stops the run. Its still-upcoming events from the
    previous feed are carried over instead of vanishing.
  * If nothing at all could be produced, the existing feed is left untouched.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

if __package__ in (None, ""):                       # allow `python scraper_engine/pipeline.py`
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scraper_engine import config, sources          # noqa: E402
from scraper_engine.dedupe import dedupe            # noqa: E402
from scraper_engine.fetch import Fetcher            # noqa: E402
from scraper_engine.normalize import expand, normalize  # noqa: E402


def collect(today: date, fetcher: Fetcher) -> tuple[list[dict], dict]:
    """Run every source. Returns (normalised events, per-source report)."""
    events: list[dict] = []
    report: dict[str, dict] = {}
    for source in sources.ALL:
        try:
            raw = source.fetch(fetcher, today)
            listed = [event for item in raw for day_item in expand(item, today)
                      if (event := normalize(day_item, today))]
            events.extend(listed)
            report[source.NAME] = {"ok": True, "found": len(raw), "listed": len(listed)}
        except Exception as error:                  # noqa: BLE001 - a source must never sink the run
            report[source.NAME] = {"ok": False, "error": f"{type(error).__name__}: {error}"[:200]}
    return events, report


def carry_over(report: dict, today: date) -> list[dict]:
    """Upcoming events from the last feed, for sources that failed this time."""
    failed = {name for name, result in report.items() if not result["ok"]}
    if not failed or not config.EVENTS_JSON.exists():
        return []
    try:
        previous = json.loads(config.EVENTS_JSON.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    kept = [event for event in previous
            if isinstance(event, dict) and event.get("source") in failed
            and str(event.get("date", "")) >= today.isoformat()]
    for name in failed:
        report[name]["carried_over"] = sum(1 for event in kept if event["source"] == name)
    return kept


def sort_key(event: dict) -> tuple:
    try:
        clock = datetime.strptime(event["time"].split(" - ")[0], "%I:%M %p").time().isoformat()
    except ValueError:
        clock = "00:00:00"                           # all-day listings lead the day
    return (event["date"], clock, event["title"].lower())


def write_atomic(path: Path, text: str) -> None:
    """Write to a temp file in the same folder, then swap it into place."""
    handle, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temp:
            temp.write(text)
        os.replace(temp_name, path)
    except BaseException:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
        raise


def sitemap(today: date) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url>\n    <loc>{config.SITE_URL}</loc>\n    <lastmod>{today.isoformat()}</lastmod>\n"
        "    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n"
        "</urlset>\n"
    )


def run(dry_run: bool = False, today: date | None = None) -> int:
    now = datetime.now(config.BANGKOK)
    today = today or now.date()

    events, report = collect(today, Fetcher())
    events.extend(carry_over(report, today))
    events = sorted(dedupe(events), key=sort_key)

    print(f"HangingOut CNX pipeline, {today.isoformat()} (Chiang Mai time)")
    for name, result in report.items():
        if result["ok"]:
            print(f"  {name:<11} ok      found {result['found']:>3}, listed {result['listed']:>3}")
        else:
            print(f"  {name:<11} FAILED  {result['error']} (carried over {result.get('carried_over', 0)})")
    live = sum(1 for event in events if event["source"] != "recurring")
    print(f"  total after de-duplication: {len(events)} ({live} from live sources)")

    if not events:
        print("Nothing to publish; the existing feed was left untouched.")
        return 1
    if dry_run:
        print(json.dumps(events[:3], indent=2, ensure_ascii=False))
        return 0

    meta = {
        "updated": now.isoformat(timespec="minutes"),
        "count": len(events),
        "sources": {name: (result.get("listed", 0) if result["ok"] else result.get("carried_over", 0))
                    for name, result in report.items()},
    }
    payload = json.dumps(events, indent=4, ensure_ascii=False)
    write_atomic(config.EVENTS_JSON, payload + "\n")
    write_atomic(config.EVENTS_JS,
                 f"window.eventsData = {payload};\n"
                 f"window.eventsMeta = {json.dumps(meta, ensure_ascii=False)};\n")
    write_atomic(config.SITEMAP, sitemap(today))
    print(f"Wrote {config.EVENTS_JSON.name}, {config.EVENTS_JS.name} and {config.SITEMAP.name}.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="show the result without writing files")
    sys.exit(run(dry_run=parser.parse_args().dry_run))
