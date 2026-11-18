"""Source adapters. Each exposes NAME and fetch(fetcher, today) -> list[RawEvent].

To add a source: create a module here with those two names and add it to ALL.
"""
from . import citylife, eventbrite, luma, meetup, recurring

ALL = [luma, eventbrite, meetup, citylife, recurring]
