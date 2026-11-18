"""Helpers for pulling schema.org Event objects and dates out of web pages."""
from __future__ import annotations

import html
import json
import re
from datetime import date, datetime

from . import config

_LD_BLOCK = re.compile(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", re.S | re.I)


def json_ld_events(page: str) -> list[dict]:
    """Every schema.org object in the page whose @type ends in 'Event'."""
    found: list[dict] = []

    def walk(node):
        if isinstance(node, dict):
            kind = node.get("@type")
            kinds = kind if isinstance(kind, list) else [kind]
            if any(isinstance(k, str) and k.endswith("Event") for k in kinds):
                found.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for match in _LD_BLOCK.finditer(page):
        try:
            walk(json.loads(match.group(1)))
        except json.JSONDecodeError:
            continue
    return found


def parse_when(value) -> tuple[date | None, datetime | None]:
    """ISO date or datetime -> (Chiang Mai calendar day, aware datetime or None)."""
    text = str(value or "").strip()
    if not text:
        return None, None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return date.fromisoformat(text), None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None, None
    if moment.tzinfo is None:                 # naive times are taken as local
        moment = moment.replace(tzinfo=config.BANGKOK)
    moment = moment.astimezone(config.BANGKOK)
    return moment.date(), moment


def place(location) -> tuple[str, str, bool]:
    """schema.org location -> (venue name, address text, is_online)."""
    if isinstance(location, list):
        location = location[0] if location else None
    if isinstance(location, str):
        return clean_text(location), "", False
    if not isinstance(location, dict):
        return "", "", False
    if location.get("@type") == "VirtualLocation":
        return "", "", True
    address = location.get("address")
    if isinstance(address, dict):
        address = " ".join(str(address.get(k) or "") for k in
                           ("streetAddress", "addressLocality", "addressRegion"))
    return clean_text(location.get("name")), clean_text(address), False


def clean_text(value) -> str:
    """Unescape entities, strip tags and collapse whitespace."""
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()
