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


class TitleTests(unittest.TestCase):
    def test_press_release_headlines(self):
        cases = {
            "Chiang Yai Fest 20+ Unveils New Experiences Ahead of Ticket Sales": "Chiang Yai Fest 20+",
            "Get Ready for the 5th Edition of Chiangmai Afro-Latin Festival 2026": "Chiangmai Afro-Latin Festival 2026",
            "MuseArt Chiang Mai Festival 2026 Brings Four Days of Music, Art and Culture to Chiang Mai":
                "MuseArt Chiang Mai Festival 2026",
            "Celebrate Loy Krathong Under the Moonlight at Shangri-La Chiang Mai":
                "Loy Krathong Under the Moonlight at Shangri-La Chiang Mai",
        }
        for raw_title, expected in cases.items():
            self.assertEqual(clean_title(raw_title, headline=True), expected)

    def test_news_verbs_only_trimmed_for_headline_sources(self):
        self.assertEqual(clean_title("Alt Coliving Brings Board Games"), "Alt Coliving Brings Board Games")

    def test_long_subtitles_and_shouted_words(self):
        self.assertEqual(clean_title("Carl Jung and Artificial Intelligence: Shadows and Golems in the machine age"),
                         "Carl Jung and Artificial Intelligence")
        self.assertEqual(clean_title("New In Town Meetup: Welcome to Chiang Mai!"),
                         "New In Town Meetup: Welcome to Chiang Mai!")
        self.assertEqual(clean_title("Team1 FRIDAY SOCIAL @attika studio"), "Team1 Friday Social @attika studio")
        self.assertEqual(clean_title("AI Engineers Weekly"), "AI Engineers Weekly")

    def test_two_stories_about_one_festival_merge(self):
        a = normalize(raw(source="citylife", start=None, url="https://c.example/1",
                          title="Chiang Mai Afro-Latin Festival 2026: The 5th International Afro-Latin Dance Festival"), TODAY)
        b = normalize(raw(source="citylife", start=None, url="https://c.example/2",
                          title="Get Ready for the 5th Edition of Chiangmai Afro-Latin Festival 2026"), TODAY)
        self.assertEqual(len(dedupe([a, b])), 1)


class ImageTests(unittest.TestCase):
    def test_every_rule_resolves_to_a_file_that_exists(self):
        from scraper_engine.normalize import IMAGE_DIR, IMAGE_RULES
        for keys, _ in IMAGE_RULES:
            self.assertTrue((IMAGE_DIR / f"{keys[-1]}-960.jpg").exists(), keys)       # last key is the safe fallback
        for kind in config.CATEGORIES:
            self.assertTrue((IMAGE_DIR / f"{kind}-960.jpg").exists(), kind)

    def test_picture_follows_the_subject_not_just_the_section(self):
        from scraper_engine.normalize import pick_image
        self.assertNotEqual(pick_image("Sunset Tubing Social for Solo Travellers", "workout"), "workout")
        self.assertEqual(pick_image("Free Yoga in the Park", "workout"), "workout")
        self.assertEqual(pick_image("Saturday Social Dinner & Karaoke", "language"), "music")
        self.assertEqual(pick_image("Thai Cooking Class", "courses"), "courses")
        self.assertEqual(pick_image("Something Unclear", "language", social=True), "community")

    def test_image_url_points_at_a_local_file(self):
        event = normalize(raw(title="Sunday Walking Street Market"), TODAY)
        self.assertEqual(event["imageUrl"], "./assets/images/opt/markets-960.jpg")


class GeoTests(unittest.TestCase):
    def test_coordinates_are_kept_only_near_chiang_mai(self):
        from scraper_engine.extract import coordinates
        here = {"geo": {"latitude": "18.7902317", "longitude": "98.9873528"}}
        self.assertEqual(coordinates(here), (18.79023, 98.98735))
        self.assertEqual(coordinates({"geo": {"latitude": "13.75", "longitude": "100.5"}}), (None, None))  # Bangkok
        self.assertEqual(coordinates({"name": "No geo"}), (None, None))
        event = normalize(raw(lat=18.79, lng=98.98), TODAY)
        self.assertEqual((event["lat"], event["lng"]), (18.79, 98.98))
        self.assertNotIn("lat", normalize(raw(), TODAY))


class SourceTests(unittest.TestCase):
    class FakeFetcher:
        def __init__(self, pages):
            self.pages = pages

        def get(self, url):
            for prefix, body in self.pages.items():
                if url.startswith(prefix):
                    return body
            from scraper_engine.fetch import FetchError
            raise FetchError(url)

    def test_meetup_adapter(self):
        from scraper_engine.sources import meetup
        page = ('<script type="application/ld+json">[{"@type":"Event","name":"Board Games Night",'
                '"startDate":"2026-11-19T12:00:00.000Z","endDate":"2026-11-19T14:00:00.000Z",'
                '"url":"https://www.meetup.com/g/events/1/","description":"Long organiser text",'
                '"eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",'
                '"location":{"@type":"Place","name":"Game Tree Cafe","address":{"streetAddress":"Nimman Soi 1"}},'
                '"organizer":{"@type":"Organization","name":"CNX Gamers"}},'
                '{"@type":"Event","name":"Online class","startDate":"2026-11-19T12:00:00.000Z",'
                '"eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode"}]</script>')
        found = meetup.fetch(self.FakeFetcher({"https://www.meetup.com": page}), TODAY)
        self.assertEqual(len(found), 2)
        listed = [e for e in (normalize(item, TODAY) for item in found) if e]
        self.assertEqual(len(listed), 1)                                           # the online class is dropped
        self.assertEqual((listed[0]["time"], listed[0]["neighborhood"]), ("7:00 PM - 9:00 PM", "Nimman"))
        self.assertIn("Hosted by CNX Gamers", listed[0]["description"])

    def test_citylife_adapter(self):
        from scraper_engine.sources import citylife
        base = "https://www.chiangmaicitylife.com/citynow/whats-on/"
        item = ('<h5 class="city-post-title"><a href="{base}festivals/lantern-fest/">Celebrate the Lantern '
                'Festival at Tha Phae Gate November 24, 2026</a></h5> <h6 class="city-post-meta">'
                'November 24, 2026 &#8211; November 25, 2026</h6>').format(base=base)
        found = citylife.fetch(self.FakeFetcher({base + "festivals/": item}), TODAY)
        self.assertEqual(len(found), 1)
        self.assertEqual((found[0].venue, found[0].until), ("Tha Phae Gate", date(2026, 11, 25)))
        days = [normalize(day, TODAY) for day in expand(found[0], TODAY)]
        self.assertEqual([d["date"] for d in days], ["2026-11-24", "2026-11-25"])
        self.assertEqual(days[0]["title"], "Lantern Festival at Tha Phae Gate")
        self.assertIn("festival:loy-krathong", days[0]["tags"])

    def test_recurring_schedule_is_valid(self):
        import json
        from scraper_engine.sources import recurring
        schedule = json.loads(config.RECURRING_FILE.read_text(encoding="utf-8"))["events"]
        for entry in schedule:
            self.assertIn(entry["type"], config.CATEGORIES, entry["title"])
            self.assertTrue(all(0 <= d <= 6 for d in entry["weekdays"]), entry["title"])
            self.assertRegex(entry["time"], r"^\d{1,2}:\d{2} [AP]M( - \d{1,2}:\d{2} [AP]M)?$", entry["title"])
        found = recurring.fetch(None, TODAY)
        self.assertTrue(all(normalize(item, TODAY) for item in found))
        sundays = [e for e in found if e.title == "Sunday Walking Street Market"]
        self.assertTrue(sundays and all(e.day.weekday() == 6 for e in sundays))


class PipelineTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        self.dir = Path(tempfile.mkdtemp())
        self.saved = (config.EVENTS_JSON, config.EVENTS_JS, config.SITEMAP)
        config.EVENTS_JSON, config.EVENTS_JS, config.SITEMAP = (
            self.dir / "events.json", self.dir / "events.js", self.dir / "sitemap.xml")

    def tearDown(self):
        import shutil
        config.EVENTS_JSON, config.EVENTS_JS, config.SITEMAP = self.saved
        shutil.rmtree(self.dir, ignore_errors=True)

    @staticmethod
    def source(name, events=None, fail=False):
        class Source:
            NAME = name

            @staticmethod
            def fetch(fetcher, today):
                if fail:
                    raise RuntimeError("blocked")
                return events or []
        return Source

    def run_quietly(self, sources, today=TODAY):
        import contextlib
        import io
        from scraper_engine import pipeline
        with contextlib.redirect_stdout(io.StringIO()):
            return pipeline.run(today=today, source_list=sources)

    def test_writes_sorted_feed_and_companion_files(self):
        import json
        late = raw(source="meetup", title="Late Show", url="https://x.example/late",
                   start=datetime(2026, 11, 20, 22, 0, tzinfo=config.BANGKOK))
        early = raw(source="meetup", title="Morning Run", url="https://x.example/early",
                    start=datetime(2026, 11, 20, 7, 0, tzinfo=config.BANGKOK))
        self.assertEqual(self.run_quietly([self.source("meetup", [late, early])]), 0)
        feed = json.loads(config.EVENTS_JSON.read_text(encoding="utf-8"))
        self.assertEqual([e["title"] for e in feed], ["Morning Run", "Late Show"])
        script = config.EVENTS_JS.read_text(encoding="utf-8")
        self.assertTrue(script.startswith("window.eventsData = [{"))
        self.assertIn("window.eventsMeta = ", script)
        self.assertIn("<lastmod>2026-11-18</lastmod>", config.SITEMAP.read_text(encoding="utf-8"))

    def test_failed_source_keeps_its_upcoming_events(self):
        import json
        self.run_quietly([self.source("eventbrite", [raw(source="eventbrite", title="Kirtan Circle")]),
                          self.source("meetup", [raw(source="meetup", title="Board Games",
                                                     url="https://x.example/2")])])
        # Next day: eventbrite is blocked, meetup has nothing new.
        code = self.run_quietly([self.source("eventbrite", fail=True),
                                 self.source("meetup", [raw(source="meetup", title="Board Games",
                                                            url="https://x.example/2")])],
                                today=date(2026, 11, 19))
        self.assertEqual(code, 0)
        feed = json.loads(config.EVENTS_JSON.read_text(encoding="utf-8"))
        self.assertEqual(sorted(e["source"] for e in feed), ["eventbrite", "meetup"])
        self.assertIn('"failed": ["eventbrite"]', config.EVENTS_JS.read_text(encoding="utf-8"))

    def test_nothing_found_leaves_the_feed_untouched(self):
        config.EVENTS_JSON.write_text("[]", encoding="utf-8")
        self.assertEqual(self.run_quietly([self.source("meetup", fail=True)]), 1)
        self.assertEqual(config.EVENTS_JSON.read_text(encoding="utf-8"), "[]")


class FetcherTests(unittest.TestCase):
    def test_robots_rules_are_respected(self):
        from scraper_engine.fetch import Fetcher, FetchError
        fetcher = Fetcher(delay=0)
        fetcher._open = lambda url: "User-agent: *\nDisallow: /private/\n" if url.endswith("/robots.txt") else "page"
        self.assertEqual(fetcher.get("https://example.org/public/page"), "page")
        with self.assertRaises(FetchError):
            fetcher.get("https://example.org/private/page")

    def test_one_honest_user_agent(self):
        from scraper_engine.fetch import Fetcher
        self.assertEqual(Fetcher().user_agent, config.USER_AGENT)
        self.assertIn("compatible;", config.USER_AGENT)


if __name__ == "__main__":
    unittest.main()
