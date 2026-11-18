"""Offline tests for the normaliser and de-duplicator.

    python -m unittest discover -s scraper_engine/tests -t .
"""
import unittest
from datetime import date, datetime

from scraper_engine import config
from scraper_engine.dedupe import dedupe
from scraper_engine.extract import json_ld_events, parse_when
from scraper_engine.models import RawEvent
from scraper_engine.normalize import classify, clean_title, expand, festival_tags, normalize

TODAY = date(2026, 11, 18)


def raw(**overrides):
    base = dict(source="meetup", title="Jazz Night", day=date(2026, 11, 20),
                start=datetime(2026, 11, 20, 20, 30, tzinfo=config.BANGKOK),
                venue="North Gate Jazz Co-Op", url="https://example.org/e/1")
    base.update(overrides)
    return RawEvent(**base)


class NormalizeTests(unittest.TestCase):
    def test_schema_fields(self):
        event = normalize(raw(is_free=True), TODAY)
        for key in ("id", "title", "venue", "neighborhood", "date", "time", "category", "type",
                    "is_free", "timeStatus", "description", "link", "mapsUrl", "tags", "imageUrl"):
            self.assertIn(key, event)
        self.assertEqual(event["date"], "2026-11-20")
        self.assertEqual(event["time"], "8:30 PM")
        self.assertEqual((event["type"], event["category"]), ("music", "Live Music"))
        self.assertEqual(event["neighborhood"], "Old City")
        self.assertTrue(event["id"].endswith("-2026-11-20"))
        self.assertTrue(event["mapsUrl"].startswith("https://maps.google.com/?q=North+Gate"))

    def test_source_text_is_never_published(self):
        secret = "PROPRIETARY ORGANISER COPY that must not be republished"
        event = normalize(raw(source_text=secret), TODAY)
        self.assertNotIn("PROPRIETARY", event["description"])

    def test_window_and_filters(self):
        self.assertIsNone(normalize(raw(day=date(2026, 11, 17)), TODAY))          # past
        self.assertIsNone(normalize(raw(day=date(2027, 3, 1)), TODAY))            # too far ahead
        self.assertIsNone(normalize(raw(online=True), TODAY))
        self.assertIsNone(normalize(raw(title="Forex Traders Show"), TODAY))
        self.assertIsNone(normalize(raw(title="Doi Inthanon 6D/5N trip"), TODAY))

    def test_title_cleaning(self):
        self.assertEqual(clean_title("🍽️ Saturday Social Dinner (every day)"), "Saturday Social Dinner")
        self.assertEqual(clean_title("JAZZ NIGHT AT THE CNX CLUB"), "Jazz Night at the CNX Club")

    def test_classification(self):
        self.assertEqual(classify("Salsa & Bachata Social")[0], "dance")
        self.assertEqual(classify("Sunday Walking Street Market")[0], "markets")
        self.assertEqual(classify("AI Engineers Weekly")[0], "courses")
        self.assertEqual(classify("Maintain your bike")[0], "culture")           # "ai" must not match inside words
        self.assertEqual(classify("Something Unclear", default_social=True), ("language", ["meetup"], True))

    def test_festival_tag(self):
        self.assertEqual(festival_tags("Loy Krathong x Kad Mua"), ["festival:loy-krathong"])
        self.assertIn("festival:loy-krathong", normalize(raw(title="Yi Peng lantern release"), TODAY)["tags"])

    def test_free_flag(self):
        self.assertTrue(normalize(raw(is_free=True), TODAY)["is_free"])
        self.assertFalse(normalize(raw(is_free=None), TODAY)["is_free"])
        self.assertTrue(normalize(raw(title="Free Jazz Night", is_free=None), TODAY)["is_free"])

    def test_multi_day_runs(self):
        festival = raw(day=date(2026, 11, 27), until=date(2026, 11, 30), start=None)
        self.assertEqual([e.day.day for e in expand(festival, TODAY)], [27, 28, 29, 30])
        exhibition = raw(day=date(2026, 10, 3), until=date(2027, 1, 10), start=None)
        self.assertEqual(len(expand(exhibition, TODAY)), 1)
        self.assertEqual(normalize(exhibition, TODAY)["date"], "2026-11-18")      # pinned to today


class DedupeTests(unittest.TestCase):
    def test_cross_posted_event_is_merged(self):
        a = normalize(raw(source="meetup", title="Jazz Night at North Gate", url="https://meetup.example/1"), TODAY)
        b = normalize(raw(source="eventbrite", title="North Gate Jazz Night!", url="https://eb.example/2"), TODAY)
        merged = dedupe([a, b])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["source"], "eventbrite")                       # higher-priority source wins

    def test_different_events_are_kept(self):
        a = normalize(raw(title="Jazz Night"), TODAY)
        b = normalize(raw(title="Salsa Social", venue="One Nimman", url="https://example.org/e/2"), TODAY)
        c = normalize(raw(title="Jazz Night", day=date(2026, 11, 21), url="https://example.org/e/3",
                          start=datetime(2026, 11, 21, 20, 30, tzinfo=config.BANGKOK)), TODAY)
        self.assertEqual(len(dedupe([a, b, c])), 3)


class ExtractTests(unittest.TestCase):
    def test_json_ld_and_timezones(self):
        page = ('<script type="application/ld+json">[{"@type":"Event","name":"A",'
                '"startDate":"2026-11-19T11:00:00.000Z"},{"@type":"Organization"}]</script>')
        events = json_ld_events(page)
        self.assertEqual(len(events), 1)
        day, start = parse_when(events[0]["startDate"])
        self.assertEqual((day, start.hour), (date(2026, 11, 19), 18))            # 11:00 UTC = 18:00 in Chiang Mai
        self.assertEqual(parse_when("2026-11-22"), (date(2026, 11, 22), None))


if __name__ == "__main__":
    unittest.main()
