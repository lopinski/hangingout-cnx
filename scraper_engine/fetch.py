"""A polite HTTP client: obeys robots.txt, rate-limits per host, never retries hard."""
from __future__ import annotations

import gzip
import json
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from . import config


class FetchError(Exception):
    """The page could not be fetched, or robots.txt does not allow it."""


class Fetcher:
    def __init__(self, delay: float = config.REQUEST_DELAY_SECONDS,
                 timeout: float = config.REQUEST_TIMEOUT_SECONDS,
                 user_agent: str = config.USER_AGENT):
        self.delay = delay
        self.timeout = timeout
        self.user_agent = user_agent
        self._robots: dict[str, RobotFileParser | None] = {}
        self._last_hit: dict[str, float] = {}

    # -- internals ---------------------------------------------------------
    def _open(self, url: str) -> str:
        request = urllib.request.Request(url, headers={
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.5",
            "Accept-Language": "en",
            "Accept-Encoding": "gzip",
        })
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return body.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            raise FetchError(f"{url}: {error}") from error

    def _robots_for(self, url: str) -> RobotFileParser | None:
        parts = urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self._robots:
            parser = RobotFileParser()
            try:
                parser.parse(self._open(host + "/robots.txt").splitlines())
                self._robots[host] = parser
            except FetchError:
                self._robots[host] = None        # no readable robots.txt: nothing is disallowed
        return self._robots[host]

    def _wait(self, url: str) -> None:
        host = urlsplit(url).netloc
        elapsed = time.monotonic() - self._last_hit.get(host, 0.0)
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_hit[host] = time.monotonic()

    # -- public API --------------------------------------------------------
    def allowed(self, url: str) -> bool:
        robots = self._robots_for(url)
        return robots is None or robots.can_fetch(self.user_agent, url)

    def get(self, url: str) -> str:
        if not self.allowed(url):
            raise FetchError(f"{url}: disallowed by robots.txt")
        self._wait(url)
        return self._open(url)

    def get_json(self, url: str):
        try:
            return json.loads(self.get(url))
        except json.JSONDecodeError as error:
            raise FetchError(f"{url}: not JSON ({error})") from error
