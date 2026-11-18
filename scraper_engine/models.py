"""The loosely-structured record every source hands to the pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class RawEvent:
    source: str                       # "meetup", "eventbrite", ...
    title: str
    day: date                         # local (Chiang Mai) calendar day
    start: datetime | None = None     # timezone-aware; None when only the day is known
    end: datetime | None = None
    venue: str = ""
    address: str = ""
    url: str = ""
    organizer: str = ""
    is_free: bool | None = None       # None = the source does not say
    online: bool = False
    until: date | None = None         # last day of a multi-day run
    lat: float | None = None          # venue coordinates, when the source publishes them
    lng: float | None = None
    # Source wording is used ONLY to classify the event. It is never published.
    source_text: str = ""
    # Optional overrides, used by the hand-curated recurring schedule.
    type: str = ""
    neighborhood: str = ""
    tags: list[str] = field(default_factory=list)
    blurb: str = ""                   # our own wording
    time_label: str = ""
