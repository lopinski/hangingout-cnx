"""Weekly fixtures that venues only announce on social media.

These come from data/recurring.json, a hand-maintained schedule. Every listing
generated from it is tagged "weekly" and tells readers to confirm with the venue.
"""
import json
from datetime import timedelta

from .. import config
from ..models import RawEvent

NAME = "recurring"


def fetch(fetcher, today):
    schedule = json.loads(config.RECURRING_FILE.read_text(encoding="utf-8"))
    events = []
    for offset in range(config.WINDOW_DAYS + 1):
        day = today + timedelta(days=offset)
        for entry in schedule["events"]:
            if not entry.get("enabled", True) or day.weekday() not in entry["weekdays"]:
                continue
            events.append(RawEvent(
                source=NAME,
                title=entry["title"],
                day=day,
                venue=entry["venue"],
                neighborhood=entry.get("neighborhood", ""),
                url=entry.get("link", ""),
                is_free=entry.get("is_free", True),
                type=entry["type"],
                tags=[*entry.get("tags", []), "weekly"],
                blurb=entry.get("blurb", ""),
                time_label=entry["time"],
                lat=entry.get("lat"), lng=entry.get("lng"),
            ))
    return events
