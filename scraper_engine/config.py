"""Settings shared by the whole engine."""
from datetime import timedelta, timezone
from pathlib import Path

# Thailand is UTC+7 all year (no daylight saving), so a fixed offset is exact.
BANGKOK = timezone(timedelta(hours=7), "ICT")

REPO_ROOT = Path(__file__).resolve().parent.parent
EVENTS_JSON = REPO_ROOT / "events.json"
EVENTS_JS = REPO_ROOT / "events.js"
SITEMAP = REPO_ROOT / "sitemap.xml"
RECURRING_FILE = Path(__file__).resolve().parent / "data" / "recurring.json"

SITE_URL = "https://hangingoutasia.netlify.app/"

# How far ahead listings are kept. Past events are dropped on every run.
WINDOW_DAYS = 21

# A generic, honest client name. Requests are rate-limited and obey robots.txt.
USER_AGENT = "Mozilla/5.0 (compatible; community-events-aggregator/1.0)"
REQUEST_DELAY_SECONDS = 1.5
REQUEST_TIMEOUT_SECONDS = 25

# The only values the site understands.
CATEGORIES = {
    "music": "Live Music", "workout": "Workouts", "culture": "Culture", "soul": "Soul",
    "dance": "Dance", "markets": "Markets", "courses": "Courses", "language": "Language",
}
NEIGHBORHOODS = ["Old City", "Nimman", "Riverside", "Santitham", "Hang Dong"]

# When two sources list the same event, the earlier source in this list wins.
SOURCE_PRIORITY = ["luma", "eventbrite", "meetup", "citylife", "recurring"]
