"""Luma: the public Chiang Mai calendar (lu.ma/chiangmai).

The page embeds the calendar id; upcoming events come from the same public
endpoint the Luma website itself calls.
"""
import json
import re

from ..extract import clean_text, parse_when
from ..models import RawEvent

NAME = "luma"
PAGE = "https://lu.ma/chiangmai"
ITEMS = "https://api.lu.ma/calendar/get-items?calendar_api_id={calendar}&period=future&pagination_limit=40"


def fetch(fetcher, today):
    page = fetcher.get(PAGE)
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not match:
        return []
    data = json.loads(match.group(1))
    calendar = (data.get("props", {}).get("pageProps", {}).get("initialData", {})
                .get("data", {}).get("calendar", {}).get("api_id"))
    if not calendar:
        return []

    events = []
    for entry in fetcher.get_json(ITEMS.format(calendar=calendar)).get("entries", []):
        event = entry.get("event") or {}
        day, start = parse_when(event.get("start_at"))
        if not day or not event.get("name"):
            continue
        _, end = parse_when(event.get("end_at"))
        geo = event.get("geo_address_info") or {}
        ticket = entry.get("ticket_info") or {}
        events.append(RawEvent(
            source=NAME,
            title=clean_text(event.get("name")),
            day=day, start=start, end=end,
            venue=clean_text(geo.get("address") or geo.get("short_address")),
            address=clean_text(geo.get("full_address") or geo.get("city_state")),
            online=event.get("location_type") == "online",
            url=f"https://lu.ma/{event['url']}" if event.get("url") else "",
            organizer=clean_text((entry.get("calendar") or {}).get("name")),
            is_free=ticket.get("is_free"),
        ))
    return events
