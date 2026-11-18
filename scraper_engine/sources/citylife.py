"""Chiang Mai Citylife "What's On": headline, date range and section per listing.

Only the cultural sections are read; restaurant promotions and parties are skipped.
"""
import re
from datetime import datetime

from ..extract import clean_text
from ..fetch import FetchError
from ..models import RawEvent

NAME = "citylife"
BASE = "https://www.chiangmaicitylife.com/citynow/whats-on/"
# Section slug -> site type ("" = decide from the headline). Restaurant
# promotions, parties and competitions are deliberately not read.
SECTIONS = {
    "festivals": "culture", "arts-and-exhibitions": "culture", "performing-arts": "culture",
    "film-screening": "culture", "live-music": "music", "fairs": "markets",
    "classes-courses-workshops": "courses", "talks-and-conferences": "courses",
    "sports": "workout", "volunteering": "",
}
_ITEM = re.compile(
    r'<h5 class="city-post-title"><a\s+href="(?P<url>[^"]+)">(?P<title>.*?)</a></h5>\s*'
    r'<h6 class="city-post-meta">(?P<dates>.*?)</h6>', re.S)
_DATE = re.compile(r"([A-Z][a-z]+ \d{1,2}, \d{4})")
_MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
# Headlines often end with their own date range, e.g. "... October 3, 2026 – January 10, 2027".
_TRAILING_DATES = re.compile(rf"\s+(?:(?:{_MONTHS}) \d{{1,2}}, \d{{4}}|\d{{1,2}}(?:\s*-\s*\d{{1,2}})? [A-Z][a-z]{{2}} \d{{4}}).*$")


def fetch(fetcher, today):
    events, seen = [], set()
    for section, kind in SECTIONS.items():
        try:
            page = fetcher.get(f"{BASE}{section}/")
        except FetchError:
            continue                              # one missing section is not fatal
        for match in _ITEM.finditer(page):
            url = match.group("url")
            if url in seen or f"/{section}/" not in url:
                continue
            seen.add(url)
            days = [datetime.strptime(d, "%B %d, %Y").date()
                    for d in _DATE.findall(clean_text(match.group("dates")))]
            if not days:
                continue
            title = _TRAILING_DATES.sub("", clean_text(match.group("title"))).strip(" -–:")
            venue = re.search(r"\bat (?!the\b)([A-Z][^:,–-]{3,60})$", title)
            events.append(RawEvent(
                source=NAME,
                title=title,
                day=days[0],
                until=days[-1] if len(days) > 1 else None,
                venue=venue.group(1).strip() if venue else "",
                url=url,
                is_free=None,
                type=kind,
            ))
    if not seen:
        raise FetchError("Citylife: no listings could be read")
    return events
