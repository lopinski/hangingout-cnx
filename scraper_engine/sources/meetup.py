"""Meetup: the public Chiang Mai city page (schema.org JSON-LD).

Meetup's robots.txt disallows its search URLs (?source=, ?keywords= ...), so only
the canonical city page is read.
"""
from ..extract import clean_text, json_ld_events, parse_when, place
from ..models import RawEvent

NAME = "meetup"
URL = "https://www.meetup.com/find/th--chiang-mai/"


def fetch(fetcher, today):
    events = []
    for item in json_ld_events(fetcher.get(URL)):
        day, start = parse_when(item.get("startDate"))
        if not day:
            continue
        _, end = parse_when(item.get("endDate"))
        venue, address, online = place(item.get("location"))
        organizer = item.get("organizer") or {}
        events.append(RawEvent(
            source=NAME,
            title=clean_text(item.get("name")),
            day=day, start=start, end=end,
            venue=venue, address=address,
            online=online or "Online" in str(item.get("eventAttendanceMode", "")),
            url=str(item.get("url") or ""),
            organizer=clean_text(organizer.get("name")) if isinstance(organizer, dict) else "",
            is_free=None,                       # Meetup's listing does not state a price
            source_text=clean_text(item.get("description")),
        ))
    return events
