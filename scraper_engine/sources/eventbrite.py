"""Eventbrite: public "free events in Chiang Mai" listing (schema.org JSON-LD).

The listing only carries dates, so each event page is read once for its start time.
"""
from datetime import timedelta

from .. import config
from ..extract import clean_text, coordinates, json_ld_events, parse_when, place
from ..fetch import FetchError
from ..models import RawEvent

NAME = "eventbrite"
URL = "https://www.eventbrite.com/d/thailand--chiang-mai/free--events/"
MAX_DETAIL_PAGES = 12


def fetch(fetcher, today):
    events = []
    horizon = today + timedelta(days=config.WINDOW_DAYS)
    detail_budget = MAX_DETAIL_PAGES
    for item in json_ld_events(fetcher.get(URL)):
        day, start = parse_when(item.get("startDate"))
        if not day or not (today <= day <= horizon):
            continue
        url = str(item.get("url") or "")
        _, end = parse_when(item.get("endDate"))
        if start is None and url and detail_budget > 0:
            detail_budget -= 1
            try:
                for detail in json_ld_events(fetcher.get(url)):
                    detail_day, detail_start = parse_when(detail.get("startDate"))
                    if detail_start and detail_day == day:
                        start = detail_start
                        _, end = parse_when(detail.get("endDate"))
                        break
            except FetchError:
                pass                              # keep the date-only listing
        venue, address, online = place(item.get("location"))
        lat, lng = coordinates(item.get("location"))
        events.append(RawEvent(
            source=NAME,
            title=clean_text(item.get("name")),
            day=day, start=start, end=end if start else None,
            venue=venue, address=address, lat=lat, lng=lng, online=online,
            url=url,
            is_free=True,                         # this is Eventbrite's free-events listing
            source_text=clean_text(item.get("description")),
        ))
    return events
