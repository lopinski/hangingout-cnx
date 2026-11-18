/* ==========================================================================
   HangingOut CNX — gazette front page
   Reads window.eventsData (events.js) and t()/currentLang (i18n.js).
   All preferences stay in localStorage: savedEvents, theme, appLang.
   ========================================================================== */
(() => {
    'use strict';

    // ---- Constants -------------------------------------------------------
    const TZ = 'Asia/Bangkok';
    const TZ_OFFSET_MIN = 7 * 60;          // Thailand is UTC+7 all year (no DST)
    const DEFAULT_DURATION_MIN = 120;      // used when a listing has no end time
    const STRIP_DAYS = 14;
    const IMG_DIR = 'assets/images/opt/';

    // Feed section -> translation key for its name.
    const TYPE_FILTER = {
        music: 'filter_music', workout: 'filter_workouts', language: 'filter_language', culture: 'filter_art',
        soul: 'filter_soul', dance: 'filter_dance', markets: 'filter_markets', courses: 'filter_courses'
    };

    // The "Vibe" pills: moods people search by, each covering one or two feed sections.
    const VIBES = [
        { key: 'social', label: 'vibe_social', types: ['language'] },
        { key: 'dance', label: 'vibe_dance', types: ['dance'] },
        { key: 'music', label: 'vibe_music', types: ['music'] },
        { key: 'wellness', label: 'vibe_wellness', types: ['workout', 'soul'] },
        { key: 'markets', label: 'vibe_markets', types: ['markets'] },
        { key: 'culture', label: 'vibe_culture', types: ['culture', 'courses'] }
    ];
    const AREAS = ['Old City', 'Nimman', 'Riverside', 'Santitham', 'Hang Dong'];

    // Every picture is a local file chosen by the pipeline's matcher (imageUrl);
    // anything else, including a remote URL, falls back to the section picture.
    const SECTION_IMAGES = ['music', 'workout', 'language', 'culture', 'soul', 'dance', 'markets', 'courses'];

    const LOCALES = { en: 'en-GB', es: 'es', zh: 'zh-CN', yue: 'zh-HK', th: 'th', it: 'it', pt: 'pt', ko: 'ko' };
    const KEEP_UPPER = new Set(['CNX', 'JJ', 'DJ', 'CM', 'BBQ', 'NYE', 'LGBTQ', 'TBA', 'TBD']);
    const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

    const ICONS = {
        gcal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5h5"/>',
        ical: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M12 12.5v5.5M9.5 15.5L12 18l2.5-2.5"/>',
        map: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
        share: '<path d="M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
        out: '<path d="M7 17L17 7M9 7h8v8"/>',
        link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
        chat: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5z"/>',
        send: '<path d="M21 4L3 11l6 2.5M21 4l-3.5 15-5.5-5M21 4L9 13.5V19l3-5"/>'
    };
    const icon = (name, extra = '') =>
        `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

    // ---- Small helpers ---------------------------------------------------
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tf = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    const countLabel = n => (n === 1 ? t('events_one') : tf('events_other', { n }));

    const storage = {
        get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } }
    };

    function hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    // ---- Dates (plain YYYY-MM-DD strings, formatted in UTC to stay DST-proof) ----
    const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    const toUTC = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const fmt = (s, opts) => new Intl.DateTimeFormat(LOCALES[currentLang] || 'en-GB', { timeZone: 'UTC', ...opts }).format(toUTC(s));
    const fmtLong = s => fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
    const fmtShort = s => fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });

    // "9:00 PM", "10:00 AM - 5:00 PM", "19:30", "5:00 - 7:00 PM" -> minutes from midnight
    function parseTime(label) {
        const found = [];
        // A number only counts as a time with a colon ("19:30") or am/pm ("7 pm"),
        // so labels like "Until 10 Jan" are not mistaken for 10 o'clock.
        const re = /(\d{1,2})[:.](\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)/gi;
        let m;
        while ((m = re.exec(label || '')) && found.length < 2) {
            found.push(m[1] !== undefined
                ? { h: +m[1], min: +m[2], ap: (m[3] || '').toLowerCase() }
                : { h: +m[4], min: 0, ap: m[5].toLowerCase() });
        }
        if (found.length === 2 && !found[0].ap && found[1].ap) found[0].ap = found[1].ap;
        const toMin = f => {
            let h = f.h;
            if (f.ap === 'pm' && h < 12) h += 12;
            if (f.ap === 'am' && h === 12) h = 0;
            return (h > 23 || f.min > 59) ? null : h * 60 + f.min;
        };
        return {
            start: found[0] ? toMin(found[0]) : null,
            end: found[1] ? toMin(found[1]) : null
        };
    }

    function prettyTitle(raw) {
        const title = String(raw || '').trim();
        if (!/[A-Z]/.test(title) || /[a-z]/.test(title)) return title;   // only tame ALL-CAPS titles
        return title.toLowerCase().split(/(\s+|-|\(|\))/).map((word, i) => {
            if (KEEP_UPPER.has(word.toUpperCase())) return word.toUpperCase();
            if (i > 0 && SMALL_WORDS.has(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join('');
    }

    const titleCase = s => String(s).replace(/(^|\s)\S/g, c => c.toUpperCase());

    function safeLink(url) {
        try {
            const u = new URL(String(url || ''));
            return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
        } catch (e) { return ''; }
    }

    function imageKey(raw, type) {
        const src = String(raw.imageUrl || '');
        const local = src.match(/^(?:\.\/)?assets\/images\/opt\/([a-z_-]+)-960\.jpg$/);
        if (local) return local[1];                                // chosen by the pipeline's matcher
        return SECTION_IMAGES.includes(type) ? type : 'night-out';
    }

    // ---- Data ------------------------------------------------------------
    const usedUids = new Set();

    function safeMapsUrl(url) {
        return /^https:\/\/(maps\.google\.com|www\.google\.com\/maps)[/?]/.test(String(url || '')) ? String(url) : '';
    }

    function normalise(raw) {
        const type = String(raw.type || '').toLowerCase();
        const allTags = Array.isArray(raw.tags) ? raw.tags.map(x => String(x).trim()).filter(Boolean) : [];
        const festival = (allTags.find(x => x.startsWith('festival:')) || '').slice(9);
        // The feed's own slug ids are stable and readable; older feeds repeat ids,
        // so anything else (or a clash) falls back to a content hash.
        let uid = typeof raw.id === 'string' && /^[a-z0-9-]{8,}$/.test(raw.id) ? raw.id : '';
        if (!uid || usedUids.has(uid)) uid = 'e' + hash([raw.id, raw.date, raw.title, raw.venue].join('|'));
        usedUids.add(uid);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') && !isNaN(toUTC(raw.date)) ? raw.date : null;
        const time = parseTime(raw.time);
        const price = String(raw.price || '').trim();
        return {
            uid,
            id: raw.id,
            title: prettyTitle(raw.title) || 'Untitled event',
            venue: String(raw.venue || '').trim(),
            date,
            timeLabel: String(raw.time || '').trim(),
            start: time.start,
            end: time.end,
            type,
            category: String(raw.category || '').trim(),
            desc: String(raw.description || '').trim(),
            link: safeLink(raw.link),
            tags: allTags.filter(x => !x.startsWith('festival:')).map(x => x.replace(/-/g, ' ')),
            festival,
            weekly: allTags.includes('weekly'),
            neighborhood: AREAS.includes(raw.neighborhood) ? raw.neighborhood : '',
            mapsUrl: safeMapsUrl(raw.mapsUrl),
            source: String(raw.source || '').toLowerCase(),
            lat: Number.isFinite(raw.lat) && Number.isFinite(raw.lng) ? raw.lat : null,
            lng: Number.isFinite(raw.lat) && Number.isFinite(raw.lng) ? raw.lng : null,
            price,
            // New feeds state is_free outright; older ones only had an optional price.
            isFree: typeof raw.is_free === 'boolean' ? raw.is_free : (!price || /^(free|gratis|0)\b/i.test(price)),
            featured: raw.featured === true,
            img: imageKey(raw, type)
        };
    }

    /** Lower-case, accent-free text for matching ("Café" finds "cafe"). */
    const fold = text => String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const byWhen = (a, b) =>
        (a.date || '9999').localeCompare(b.date || '9999') ||
        ((a.start == null ? -1 : a.start) - (b.start == null ? -1 : b.start)) ||
        a.title.localeCompare(b.title);

    const events = (Array.isArray(window.eventsData) ? window.eventsData : []).map(normalise).sort(byWhen);
    events.forEach(e => {                                              // what the search box looks through
        e.haystack = fold([e.title, e.venue, e.neighborhood, e.category, e.tags.join(' '),
            e.festival.replace(/-/g, ' '), e.source].join(' '));
    });
    const byUid = new Map(events.map(e => [e.uid, e]));
    const datedEvents = events.filter(e => e.date);

    // ---- State -----------------------------------------------------------
    const today = todayStr();
    const firstDate = datedEvents.length ? datedEvents[0].date : today;
    const lastDate = datedEvents.length ? datedEvents[datedEvents.length - 1].date : today;
    const isBackIssue = datedEvents.length > 0 && lastDate < today;   // feed has nothing upcoming

    const stripMin = isBackIssue ? firstDate : today;
    const stripMax = (() => {                                          // latest allowed first cell
        const end = lastDate > addDays(stripMin, STRIP_DAYS - 1) ? lastDate : addDays(stripMin, STRIP_DAYS - 1);
        return addDays(end, -(STRIP_DAYS - 1));
    })();

    // One object holds every choice in the discovery panel.
    //   when: 'today' | 'tomorrow' | 'weekend' | 'date' (uses state.date) | 'all'
    //   vibe: 'all' | a VIBES key | 'festival:<slug>' | 'saved'
    const hasToday = datedEvents.some(e => e.date === stripMin);
    const initialState = () => ({
        q: '',
        when: isBackIssue ? 'all' : hasToday ? 'today' : 'date',
        date: (datedEvents.find(e => e.date >= stripMin) || { date: stripMin }).date,
        vibe: 'all',
        freeOnly: false,
        area: '',
        stripStart: stripMin,
        stripOpen: false,
        filtersOpen: false
    });
    const state = initialState();

    let saved = loadSaved();
    let ready = false;

    function loadSaved() {
        let stored = [];
        try { stored = JSON.parse(storage.get('savedEvents') || '[]'); } catch (e) { stored = []; }
        if (!Array.isArray(stored)) stored = [];
        if (!events.length) return stored.map(String);
        // Keep current uids; migrate ids saved by the previous version when unambiguous.
        const out = new Set();
        stored.forEach(s => {
            if (byUid.has(s)) return out.add(s);
            const matches = events.filter(e => String(e.id) === String(s));
            if (matches.length === 1) out.add(matches[0].uid);
        });
        return [...out];
    }
    const isSaved = uid => saved.includes(uid);

    // ---- Filtering -------------------------------------------------------
    /** Friday to Sunday of the current week, never earlier than today. */
    function weekendDates() {
        const weekday = toUTC(stripMin).getUTCDay();                   // 0 = Sunday ... 6 = Saturday
        const toFriday = weekday === 0 ? -2 : 5 - weekday;
        return [0, 1, 2].map(i => addDays(stripMin, toFriday + i)).filter(d => d >= stripMin);
    }

    /** The dates the "When" choice stands for, or null for all dates. */
    function activeDates() {
        if (state.when === 'today') return [stripMin];
        if (state.when === 'tomorrow') return [addDays(stripMin, 1)];
        if (state.when === 'weekend') return weekendDates();
        if (state.when === 'date') return [state.date];
        return null;
    }

    const queryWords = () => fold(state.q).split(/\s+/).filter(Boolean);

    const tests = {
        q: e => queryWords().every(word => e.haystack.includes(word)),
        vibe: e => {
            if (state.vibe === 'all') return true;
            if (state.vibe === 'saved') return isSaved(e.uid);
            if (state.vibe.startsWith('festival:')) return e.festival === state.vibe.slice(9);
            const vibe = VIBES.find(v => v.key === state.vibe);
            return !!vibe && vibe.types.includes(e.type);
        },
        price: e => !state.freeOnly || e.isFree,
        area: e => !state.area || e.neighborhood === state.area,
        when: e => { const dates = activeDates(); return !dates || dates.includes(e.date); }
    };

    /** Events passing every filter except the ones named in `skip`. */
    function matching(...skip) {
        const active = Object.keys(tests).filter(name => !skip.includes(name)).map(name => tests[name]);
        return events.filter(e => active.every(test => test(e)));
    }

    /** Everything matching search, vibe, price and area, on any date. */
    const pool = () => matching('when');

    function dayCounts(list) {
        const counts = new Map();
        list.forEach(e => { if (e.date) counts.set(e.date, (counts.get(e.date) || 0) + 1); });
        return counts;
    }

    const isFiltered = () => state.q.trim() !== '' || state.vibe !== 'all' || state.freeOnly || state.area !== '';

    function showDay(day) {
        const end = addDays(state.stripStart, STRIP_DAYS - 1);
        if (day < state.stripStart || day > end) {
            let start = day < stripMin ? stripMin : day;
            if (start > stripMax) start = stripMax;
            state.stripStart = start;
        }
    }

    // ---- Links & calendar files -----------------------------------------
    const pageUrl = () => location.origin + location.pathname;
    const shareUrl = e => `${pageUrl()}#e=${e.uid}`;
    const mapsUrl = e => e.mapsUrl || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${e.venue}, Chiang Mai`);
    const REPO_ISSUES = 'https://github.com/lopinski/hangingout-cnx/issues/new';
    const issueUrl = (title, body) => `${REPO_ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    const submitUrl = () => issueUrl('Submit an event: ', 'Event name:\nDate and time:\nVenue:\nFree entry? (yes/no):\nLink:\nAnything else:');
    const reportUrl = e => issueUrl(
        e ? `Report a listing: ${e.title}` : 'Report a listing: ',
        (e ? `Listing: ${e.title}\nDate: ${e.date || ''}\nVenue: ${e.venue}\nId: ${e.id}\n\n` : '') + 'What is wrong with it?\n');

    /** Start/end of an event as UTC milliseconds. */
    function span(e) {
        const [y, m, d] = e.date.split('-').map(Number);
        if (e.start == null) return { allDay: true, from: Date.UTC(y, m - 1, d), to: Date.UTC(y, m - 1, d + 1) };
        let end = e.end != null ? e.end : e.start + DEFAULT_DURATION_MIN;
        if (end <= e.start) end += 24 * 60;                            // runs past midnight
        return {
            allDay: false,
            from: Date.UTC(y, m - 1, d, 0, e.start - TZ_OFFSET_MIN),
            to: Date.UTC(y, m - 1, d, 0, end - TZ_OFFSET_MIN)
        };
    }
    const stamp = (ms, allDay) => {
        const s = new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
        return allDay ? s.slice(0, 8) : s;
    };

    function gcalUrl(e) {
        const s = span(e);
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: e.title,
            dates: `${stamp(s.from, s.allDay)}/${stamp(s.to, s.allDay)}`,
            location: `${e.venue}, Chiang Mai, Thailand`,
            details: [e.desc, e.link, shareUrl(e)].filter(Boolean).join('\n\n'),
            ctz: TZ
        });
        return 'https://calendar.google.com/calendar/render?' + params.toString();
    }

    function icsFile(e) {
        const s = span(e);
        const text = v => String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
        const encoder = new TextEncoder();
        const fold = line => {                                         // RFC 5545: max 75 octets per line
            let out = '', width = 0;
            for (const ch of line) {
                const size = encoder.encode(ch).length;
                if (width + size > 73) { out += '\r\n '; width = 1; }
                out += ch; width += size;
            }
            return out;
        };
        const lines = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HangingOut CNX//Events//EN',
            'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
            `UID:${e.uid}-${e.date}@hangingout-cnx`,
            `DTSTAMP:${stamp(Date.now(), false)}`,
            s.allDay ? `DTSTART;VALUE=DATE:${stamp(s.from, true)}` : `DTSTART:${stamp(s.from, false)}`,
            s.allDay ? `DTEND;VALUE=DATE:${stamp(s.to, true)}` : `DTEND:${stamp(s.to, false)}`,
            `SUMMARY:${text(e.title)}`,
            `LOCATION:${text(`${e.venue}, Chiang Mai, Thailand`)}`,
            `DESCRIPTION:${text([e.desc, e.link, shareUrl(e)].filter(Boolean).join('\n\n'))}`,
            `URL:${e.link || shareUrl(e)}`,
            'END:VEVENT', 'END:VCALENDAR'
        ];
        return lines.map(fold).join('\r\n') + '\r\n';
    }

    function downloadIcs(e) {
        const url = URL.createObjectURL(new Blob([icsFile(e)], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = (e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event') + '.ics';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ---- Markup pieces ---------------------------------------------------
    const sectionLabel = e => (TYPE_FILTER[e.type] ? t(TYPE_FILTER[e.type]) : e.category);
    const priceLabel = e => (e.isFree ? t('free') : (e.price || t('see_listing')));
    const timeText = e => (!e.timeLabel || /^all day$/i.test(e.timeLabel) ? t('all_day') : e.timeLabel);
    const placeText = e => (e.neighborhood && !e.venue.includes(e.neighborhood) ? `${e.venue}, ${e.neighborhood}` : e.venue);
    const festivalLabel = slug => titleCase(slug.replace(/-/g, ' '));

    /** Escape text and wrap whatever matches the search words in <mark>. */
    function hl(text) {
        const words = state.q.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (!words.length) return esc(text);
        return String(text).split(new RegExp(`(${words.join('|')})`, 'gi'))
            .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
    }
    const SOURCE_NAMES = { meetup: 'Meetup', eventbrite: 'Eventbrite', luma: 'Luma', citylife: 'Chiang Mai Citylife' };
    const priceClass = e => (e.isFree ? 'free' : 'paid');
    const whenText = e => (e.date ? `${fmtLong(e.date)} · ${timeText(e)}` : t('date_tbc'));

    /**
     * Pictures are 3:2 files at 480, 720 and 960px. Cards never need the largest;
     * the cover and the detail sheet (`large`) may. Fixed width/height plus the
     * CSS aspect-ratio boxes mean nothing shifts while a picture loads.
     */
    function picture(e, sizes, large) {
        const base = IMG_DIR + e.img;
        const widths = large ? [480, 720, 960] : [480, 720];
        return `<img src="${base}-480.jpg" srcset="${widths.map(w => `${base}-${w}.jpg ${w}w`).join(', ')}" sizes="${sizes}"
            alt="" width="960" height="640" decoding="async" ${large ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
    }

    /** Minutes since midnight in Chiang Mai, right now. */
    function nowMinutes() {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(new Date());
        const get = type => +parts.find(p => p.type === type).value;
        return get('hour') * 60 + get('minute');
    }

    /** 'now' while an event is running, 'soon' in the two hours before it starts, else ''. */
    function liveState(e) {
        if (e.date !== todayStr() || e.start == null) return '';
        const now = nowMinutes();
        let end = e.end != null ? e.end : e.start + DEFAULT_DURATION_MIN;
        if (end <= e.start) end += 24 * 60;
        if (now >= e.start && now < end) return 'now';
        return now < e.start && e.start - now <= 120 ? 'soon' : '';
    }

    function liveBadge(e) {
        const live = liveState(e);
        if (!live) return '';
        return `<span class="live live--${live}"><span class="live__dot" aria-hidden="true"></span>${esc(t(live === 'now' ? 'live_now' : 'starting_soon'))}</span>`;
    }

    function kicker(e, lead) {
        const tag = e.tags[0] ? `<span class="kicker__tag">${esc(titleCase(e.tags[0]))}</span>` : '';
        const section = e.festival ? `${festivalLabel(e.festival)} · ${sectionLabel(e)}` : sectionLabel(e);
        const label = lead ? `${esc(t('editors_pick'))} · ${esc(section)}` : esc(section);
        return `<p class="kicker">${liveBadge(e)}<span>${label}</span>${tag}</p>`;
    }

    function facts(e, withTags) {
        const where = e.venue
            ? `<a href="${esc(mapsUrl(e))}" target="_blank" rel="noopener noreferrer" title="${esc(t('open_map'))}">${esc(placeText(e))}</a>` : '—';
        const origin = !withTags ? '' : e.weekly ? esc(t('weekly_note'))
            : SOURCE_NAMES[e.source] ? (e.link
                ? `<a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${esc(SOURCE_NAMES[e.source])}</a>`
                : esc(SOURCE_NAMES[e.source])) : '';
        const tags = withTags && e.tags.length
            ? `<div><dt>${esc(t('sections'))}</dt><dd class="tags">${e.tags.map(x => `<span class="tag">${esc(titleCase(x))}</span>`).join('')}</dd></div>` : '';
        return `<dl class="facts">
            <div><dt>${esc(t('when'))}</dt><dd>${e.date ? `<time datetime="${e.date}">${esc(whenText(e))}</time>` : esc(whenText(e))}</dd></div>
            <div><dt>${esc(t('where'))}</dt><dd>${where}</dd></div>
            <div><dt>${esc(t('entry'))}</dt><dd><span class="${priceClass(e)}">${esc(priceLabel(e))}</span></dd></div>
            ${tags}
            ${origin ? `<div><dt>${esc(t('source'))}</dt><dd>${origin}</dd></div>` : ''}
        </dl>`;
    }

    /** Labelled buttons for the cover story and the detail sheet. */
    function ctaRow(e, withShare = true) {
        const on = isSaved(e.uid);
        const cal = e.date ? `
            <a class="btn btn--primary" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer">${icon('gcal')}${esc(t('add_gcal'))}</a>
            <button type="button" class="btn" data-act="ics" data-uid="${e.uid}">${icon('ical')}${esc(t('add_ical'))}</button>` : '';
        const more = e.link
            ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${icon('out')}${esc(t('btn_learn_more'))}</a>` : '';
        return `<div class="cta">${cal}
            <a class="btn" href="${esc(mapsUrl(e))}" target="_blank" rel="noopener noreferrer">${icon('map')}${esc(t('act_map'))}</a>
            <button type="button" class="btn" data-act="save" data-uid="${e.uid}" aria-pressed="${on}">${icon('heart', 'icon--heart')}<span data-save-label>${esc(t(on ? 'act_saved' : 'act_save'))}</span></button>
            ${withShare ? `<button type="button" class="btn" data-act="share" data-uid="${e.uid}">${icon('share')}${esc(t('act_share'))}</button>` : ''}
            ${more}
        </div>`;
    }

    /** Compact one-tap action bar under every card. */
    function actionBar(e) {
        const on = isSaved(e.uid);
        const name = esc(e.title);
        const cal = e.date ? `
            <a class="act" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('add_gcal'))}: ${name}" title="${esc(t('add_gcal'))}">${icon('gcal')}<span>${esc(t('gcal_short'))}</span></a>
            <button type="button" class="act" data-act="ics" data-uid="${e.uid}" aria-label="${esc(t('add_ical'))}: ${name}" title="${esc(t('add_ical'))}">${icon('ical')}<span>${esc(t('ical_short'))}</span></button>` : '';
        return `<div class="actions">${cal}
            <a class="act" href="${esc(mapsUrl(e))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('open_map'))}: ${esc(e.venue)}" title="${esc(t('open_map'))}">${icon('map')}<span>${esc(t('act_map'))}</span></a>
            <button type="button" class="act" data-act="save" data-uid="${e.uid}" aria-pressed="${on}" aria-label="${esc(t('act_save'))}: ${name}">${icon('heart', 'icon--heart')}<span data-save-label>${esc(t(on ? 'act_saved' : 'act_save'))}</span></button>
            <button type="button" class="act" data-act="share" data-uid="${e.uid}" aria-label="${esc(t('act_share'))}: ${name}">${icon('share')}<span>${esc(t('act_share'))}</span></button>
        </div>`;
    }

    function card(e, showDate) {
        const when = showDate && e.date ? `${fmtShort(e.date)} · ${timeText(e)}` : timeText(e);
        return `<article class="card" data-uid="${e.uid}">
            <a class="media card__media" href="#e=${e.uid}" data-open="${e.uid}" tabindex="-1" aria-hidden="true">
                ${picture(e, '(max-width: 640px) 92px, (max-width: 960px) 46vw, 360px')}
            </a>
            <div class="card__body">
                ${kicker(e)}
                <h3 class="card__title"><a href="#e=${e.uid}" data-open="${e.uid}">${hl(e.title)}</a></h3>
                <p class="card__meta"><strong>${esc(when)}</strong> · ${hl(placeText(e))} · <span class="${priceClass(e)}">${esc(priceLabel(e))}</span></p>
            </div>
            ${actionBar(e)}
        </article>`;
    }

    // ---- Render: discovery panel ----------------------------------------
    const pill = (set, label, { active = false, count = null, quiet = false, extra = '' } = {}) =>
        `<button type="button" class="pill${active ? ' is-active' : ''}${quiet ? ' is-quiet' : ''}${extra}" data-set="${esc(set)}" aria-pressed="${active}">${label}${count == null ? '' : `<span class="pill__n">${count}</span>`}</button>`;

    function whenLabel() {
        if (state.when === 'today') return t('today');
        if (state.when === 'tomorrow') return t('tomorrow');
        if (state.when === 'weekend') return t('this_weekend');
        if (state.when === 'date') return fmtShort(state.date);
        return t('all_dates');
    }

    function vibeLabel() {
        if (state.vibe === 'saved') return t('filter_saved');
        if (state.vibe.startsWith('festival:')) return festivalLabel(state.vibe.slice(9));
        const vibe = VIBES.find(v => v.key === state.vibe);
        return vibe ? t(vibe.label) : '';
    }

    function renderDiscover() {
        // When
        const relative = isBackIssue ? [] : [['today', t('today')], ['tomorrow', t('tomorrow')], ['weekend', t('this_weekend')]];
        const chosen = state.when === 'date' ? fmtShort(state.date) : t('choose_date');
        $('when-row').innerHTML = relative.map(([key, label]) => pill(`when:${key}`, esc(label), { active: state.when === key })).join('') +
            pill('when:all', esc(t('all_dates')), { active: state.when === 'all' }) +
            `<button type="button" class="pill pill--date${state.when === 'date' ? ' is-active' : ''}" id="date-toggle" aria-expanded="${state.stripOpen}" aria-controls="daystrip">${esc(chosen)} <span aria-hidden="true">${state.stripOpen ? '▴' : '▾'}</span></button>`;
        $('daystrip').hidden = !state.stripOpen;

        // Vibe: counts respect the other choices, so a pill never promises more than it shows.
        const others = matching('vibe');
        const festivals = new Map();
        events.forEach(e => { if (e.festival && e.date >= stripMin) festivals.set(e.festival, (festivals.get(e.festival) || 0) + 1); });
        const festivalPills = [...festivals].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([slug]) =>
            pill(`vibe:festival:${slug}`, `<span aria-hidden="true">★</span> ${esc(festivalLabel(slug))}`,
                { active: state.vibe === `festival:${slug}`, extra: ' pill--festival' })).join('');
        const vibePills = VIBES.map(vibe => {
            const n = others.filter(e => vibe.types.includes(e.type)).length;
            return pill(`vibe:${vibe.key}`, esc(t(vibe.label)), { active: state.vibe === vibe.key, count: n, quiet: !n });
        }).join('');
        $('vibe-row').innerHTML = pill('vibe:all', esc(t('filter_all')), { active: state.vibe === 'all' }) + festivalPills + vibePills +
            pill('vibe:saved', `${icon('heart', 'icon--heart')} ${esc(t('filter_saved'))}`, { active: state.vibe === 'saved', count: saved.length, extra: ' pill--saved' });

        // Price and area
        $('price-row').innerHTML = pill('price:all', esc(t('all_listings')), { active: !state.freeOnly }) +
            pill('price:free', esc(t('free_only')), { active: state.freeOnly });
        const byArea = matching('area');
        $('area-row').innerHTML = pill('area:', esc(t('all_cnx')), { active: !state.area }) +
            AREAS.filter(area => events.some(e => e.neighborhood === area)).map(area => {
                const n = byArea.filter(e => e.neighborhood === area).length;
                return pill(`area:${area}`, esc(area), { active: state.area === area, count: n, quiet: !n });
            }).join('');

        // Phone-only "Filters" toggle with a count of what is switched on
        const on = (state.vibe !== 'all') + state.freeOnly + (state.area !== '');
        $('filters-count').hidden = !on;
        $('filters-count').textContent = on;
        $('filters-toggle').setAttribute('aria-expanded', state.filtersOpen);
        $('more-filters').classList.toggle('is-open', state.filtersOpen);
    }

    /** "Showing 4 events · Today · Old City · Free only" plus a way to undo it all. */
    function renderResults(count) {
        const parts = [whenLabel(), vibeLabel(), state.area, state.freeOnly ? t('free_only') : '',
            state.q.trim() ? `“${state.q.trim()}”` : ''].filter(Boolean);
        $('results-line').innerHTML = `${esc(t('showing'))} <strong>${esc(countLabel(count))}</strong>` +
            parts.map(part => ` <span class="results__sep" aria-hidden="true">·</span> ${esc(part)}`).join('');
        $('clear-filters').hidden = !isFiltered();
    }

    // ---- Render: day strip ("Choose date") ------------------------------
    function renderStrip() {
        if (!state.stripOpen) return;
        const counts = dayCounts(pool());
        const cells = [];
        for (let i = 0; i < STRIP_DAYS; i++) {
            const date = addDays(state.stripStart, i);
            const n = counts.get(date) || 0;
            const active = state.when === 'date' && state.date === date;
            const isToday = date === today;
            const showMonth = i === 0 || date.endsWith('-01');
            const dow = isToday ? t('today') : fmt(date, { weekday: 'short' });
            const cls = ['day', active && 'is-active', isToday && 'is-today', !n && 'is-empty'].filter(Boolean).join(' ');
            cells.push(`<button type="button" class="${cls}" data-day="${date}" aria-pressed="${active}"${isToday ? ' aria-current="date"' : ''}
                aria-label="${esc(fmtLong(date))}, ${esc(countLabel(n))}">
                <span class="day__dow">${esc(dow)}</span>
                <span class="day__num">${toUTC(date).getUTCDate()}</span>
                <span class="day__count">${showMonth ? esc(fmt(date, { month: 'short' })) + ' · ' : ''}${n || '–'}</span>
            </button>`);
        }
        const box = $('day-list');
        box.innerHTML = cells.join('');
        $('days-prev').disabled = state.stripStart <= stripMin;
        $('days-next').disabled = state.stripStart >= stripMax;

        const activeCell = box.querySelector('.is-active');
        if (activeCell && box.scrollWidth > box.clientWidth) {
            box.scrollLeft = activeCell.offsetLeft - (box.clientWidth - activeCell.offsetWidth) / 2;
        }
    }

    // ---- Render: cover + dossier ----------------------------------------
    function pickLead(list) {
        if (!list.length) return null;
        const firstDay = list.filter(e => e.date === list[0].date);
        // "Most exciting" in order: hand-picked, festival, a one-off rather than a weekly
        // fixture, free entry, an evening start. Ties go to the earliest.
        const score = e => (e.featured ? 32 : 0) + (e.festival ? 8 : 0) + (e.weekly ? 0 : 4) +
            (e.isFree ? 2 : 0) + (e.start != null && e.start >= 17 * 60 ? 1 : 0);
        return firstDay.reduce((best, e) => (score(e) > score(best) ? e : best));
    }

    function renderCover(lead) {
        const box = $('cover');
        if (!lead) { box.innerHTML = ''; return; }
        box.innerHTML = `<article class="cover__grid" data-uid="${lead.uid}">
            <a class="media cover__media" href="#e=${lead.uid}" data-open="${lead.uid}" tabindex="-1" aria-hidden="true">
                ${picture(lead, '(max-width: 640px) 100vw, (max-width: 960px) 50vw, 660px', true)}
                <span class="badge">${esc(sectionLabel(lead))}</span>
            </a>
            <div class="cover__body">
                ${kicker(lead, true)}
                <h2 class="cover__title"><a href="#e=${lead.uid}" data-open="${lead.uid}">${hl(lead.title)}</a></h2>
                ${lead.desc ? `<p class="standfirst">${esc(lead.desc)}</p>` : ''}
                ${facts(lead)}
                ${ctaRow(lead)}
            </div>
        </article>`;
    }

    function pager(counts, day) {
        const dates = [...counts.keys()].filter(d => d >= stripMin).sort();
        const prev = dates.filter(d => d < day).pop();
        const next = dates.find(d => d > day);
        const link = (date, label, arrowFirst) => `<button type="button" class="btn" data-day="${date}">
            ${arrowFirst ? '<span aria-hidden="true">←</span>' : ''}
            <span><span class="pager__label">${esc(label)}</span><br>${esc(fmtLong(date))} · ${esc(countLabel(counts.get(date)))}</span>
            ${arrowFirst ? '' : '<span aria-hidden="true">→</span>'}</button>`;
        if (!prev && !next) return '';
        return `<nav class="pager">${prev ? link(prev, t('earlier'), true) : ''}${next ? link(next, t('next_up'), false) : ''}</nav>`;
    }

    function emptyState() {
        const message = state.vibe === 'saved' && !saved.length ? t('empty_saved') : t('empty_events');
        return `<div class="empty"><p>${esc(message)}</p><div class="cta">
            <button type="button" class="btn btn--primary" data-reset>${esc(t('clear_filters'))}</button></div></div>`;
    }

    function renderListings() {
        const all = pool();
        const counts = dayCounts(all);
        let dates = activeDates();
        let list = dates ? all.filter(e => dates.includes(e.date)) : all;
        const wanted = list.length;

        // Never a dead end: if the chosen day(s) have no match but another day does, show that day.
        let notice = '';
        if (!list.length && all.length) {
            const next = [...counts.keys()].filter(d => d >= stripMin).sort()[0] || [...counts.keys()].sort()[0];
            dates = [next];
            list = all.filter(e => e.date === next);
            notice = `<p class="notice">${esc(tf('no_match_when', { when: whenLabel() }))}</p>`;
        }

        renderResults(wanted);
        const lead = pickLead(list);
        const rest = list.filter(e => e !== lead);
        renderCover(lead);
        $('fallback-note').innerHTML = notice;

        let html = '';
        if (!list.length) {
            html = emptyState();
        } else if (!dates || dates.length > 1) {
            const groups = new Map();
            rest.forEach(e => {
                const key = e.date || 'tbc';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(e);
            });
            html = [...groups].map(([date, items]) => `<section class="daygroup">
                <header class="section-head">
                    <h2>${date === 'tbc' ? esc(t('date_tbc')) : `<time datetime="${date}">${esc(fmtLong(date))}</time>`}</h2>
                    <p>${esc(countLabel(items.length))}</p>
                </header>
                <div class="grid grid--compact">${items.map(e => card(e, false)).join('')}</div>
            </section>`).join('');
        } else {
            if (rest.length) {
                html = `<header class="section-head">
                    <h2>${esc(tf('also_on', { date: fmtLong(dates[0]) }))}</h2>
                    <p>${esc(countLabel(rest.length))}</p>
                </header>
                <div class="grid">${rest.map(e => card(e, false)).join('')}</div>`;
            }
            html += pager(counts, dates[0]);
        }
        $('dossier').innerHTML = html;
    }

    function renderChrome() {
        $('today-line').textContent = fmt(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        $('today-line').dateTime = today;
        const meta = window.eventsMeta;
        const stamp = meta && /^\d{4}-\d{2}-\d{2}/.test(meta.updated || '') ? meta.updated.slice(0, 10) : '';
        $('updated-line').textContent = stamp ? tf('updated', { date: fmt(stamp, { day: 'numeric', month: 'long', year: 'numeric' }) }) : '';
        $('submit-link').href = submitUrl();
        $('q').placeholder = t('search_placeholder');
        $('q').setAttribute('aria-label', t('search_label'));
        const notice = $('back-issue');
        notice.hidden = !isBackIssue;
        if (isBackIssue) {
            const range = { day: 'numeric', month: 'long', year: 'numeric' };
            notice.textContent = tf('back_issue', { from: fmt(firstDate, range), to: fmt(lastDate, range) });
        }
    }

    function renderAll(flash) {
        renderChrome();
        renderDiscover();
        renderStrip();
        renderListings();
        updateDock();
        if (flash) {
            [$('cover'), $('dossier')].forEach(el => {
                el.classList.remove('is-fresh');
                void el.offsetWidth;                                   // restart the animation
                el.classList.add('is-fresh');
            });
        }
    }

    /** After a filter change, bring the results back into view if the reader had scrolled past them. */
    function settleScroll() {
        const top = $('listings').getBoundingClientRect().top + window.scrollY - $('results').offsetHeight - 8;
        if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
    }

    // ---- Search suggestions ----------------------------------------------
    // Vocabulary = the feed's own tags, areas, venues and festivals, so a suggestion always has results.
    const vocabulary = (() => {
        const terms = new Map();
        const add = term => { const key = fold(term).trim(); if (key.length > 2 && !terms.has(key)) terms.set(key, term); };
        events.forEach(e => {
            e.tags.forEach(tag => { if (!['weekly', 'meetup'].includes(tag)) add(tag); });
            if (e.festival) add(e.festival.replace(/-/g, ' '));
            if (e.neighborhood) add(e.neighborhood);
            if (e.venue && !/see listing/.test(e.venue)) add(e.venue);
        });
        ['salsa', 'jazz', 'yoga', 'market', 'coworking', 'meetup', 'free'].forEach(add);
        return [...terms].map(([key, label]) => ({ key, label, n: events.filter(e => e.haystack.includes(key)).length }))
            .filter(term => term.n > 0);
    })();

    let suggestIndex = -1;

    function suggestions() {
        const typed = fold(state.q).trim();
        const ranked = vocabulary.filter(term => (typed ? term.key.includes(typed) && term.key !== typed : term.label.length < 14))
            .sort((a, b) => (typed ? (b.key.startsWith(typed) - a.key.startsWith(typed)) : 0) || b.n - a.n);
        return ranked.slice(0, 6);
    }

    function renderSuggestions(open) {
        const list = $('suggestions');
        const items = open ? suggestions() : [];
        list.hidden = !items.length;
        $('q').setAttribute('aria-expanded', !!items.length);
        suggestIndex = Math.min(suggestIndex, items.length - 1);
        list.innerHTML = (items.length && !state.q.trim() ? `<li class="search__hint" role="presentation">${esc(t('popular'))}</li>` : '') +
            items.map((term, i) => `<li class="search__option${i === suggestIndex ? ' is-active' : ''}" id="suggestion-${i}" role="option" aria-selected="${i === suggestIndex}" data-suggest="${esc(term.label)}">
                <span>${hl(titleCase(term.label))}</span><span class="pill__n">${term.n}</span></li>`).join('');
        if (suggestIndex >= 0) $('q').setAttribute('aria-activedescendant', `suggestion-${suggestIndex}`);
        else $('q').removeAttribute('aria-activedescendant');
    }

    function setQuery(text) {
        state.q = text;
        if ($('q').value !== text) $('q').value = text;
        renderDiscover();
        renderStrip();
        renderListings();
        updateDock();
    }

    // ---- Jump dock (phones) -----------------------------------------------
    /** Section starts the down-arrow steps through: cover, each day or "also on" heading, the footer. */
    const jumpTargets = () => [$('cover'), ...document.querySelectorAll('#dossier .section-head, #dossier .pager'), document.querySelector('.footer')]
        .filter(el => el && el.offsetParent !== null);
    const stickyOffset = () => $('results').offsetHeight + 8;

    function nextTarget() {
        const line = window.scrollY + stickyOffset() + 4;
        return jumpTargets().find(el => el.getBoundingClientRect().top + window.scrollY > line + 1);
    }

    function updateDock() {
        $('dock-up').hidden = window.scrollY < 400;
        $('dock-down').hidden = !nextTarget() ||
            window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40;
    }

    // ---- Actions ---------------------------------------------------------
    let toastTimer;
    function toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
    }

    function toggleSave(uid) {
        const on = !isSaved(uid);
        saved = on ? [...saved, uid] : saved.filter(id => id !== uid);
        storage.set('savedEvents', JSON.stringify(saved));
        toast(t(on ? 'toast_saved' : 'toast_removed'));

        if (state.vibe === 'saved') renderAll(false);
        else renderDiscover();
        document.querySelectorAll(`[data-act="save"][data-uid="${uid}"]`).forEach(btn => {
            btn.setAttribute('aria-pressed', on);
            const label = btn.querySelector('[data-save-label]');
            if (label) label.textContent = t(on ? 'act_saved' : 'act_save');
        });
    }

    const shareText = e => `${e.title} — ${whenText(e)}, ${e.venue}`;

    /** Copy / WhatsApp / Telegram, shown in the detail sheet. Plain links: nothing loads until tapped. */
    function shareRow(e) {
        const url = encodeURIComponent(shareUrl(e));
        const text = encodeURIComponent(shareText(e));
        return `<div class="share" role="group" aria-label="${esc(t('act_share'))}">
            <span class="share__label">${esc(t('act_share'))}</span>
            <button type="button" class="share__btn" data-act="copy" data-uid="${e.uid}">${icon('link')}<span data-copy-label>${esc(t('copy_link'))}</span></button>
            <a class="share__btn" href="https://wa.me/?text=${text}%20${url}" target="_blank" rel="noopener noreferrer">${icon('chat')}WhatsApp</a>
            <a class="share__btn" href="https://t.me/share/url?url=${url}&amp;text=${text}" target="_blank" rel="noopener noreferrer">${icon('send')}Telegram</a>
        </div>`;
    }

    async function share(e) {
        if (navigator.share) {
            try { await navigator.share({ title: e.title, text: shareText(e), url: shareUrl(e) }); } catch (err) { /* dismissed */ }
            return;
        }
        copyLink(e);
    }

    async function copyLink(e, button) {
        const url = shareUrl(e);
        try {
            await navigator.clipboard.writeText(url);
        } catch (err) {
            const field = document.createElement('textarea');
            field.value = url;
            field.setAttribute('readonly', '');
            field.className = 'visually-hidden';
            (document.querySelector('dialog[open]') || document.body).appendChild(field);
            field.select();
            try { document.execCommand('copy'); } catch (e2) { /* nothing else to try */ }
            field.remove();
        }
        toast(t('link_copied'));
        const label = button && button.querySelector('[data-copy-label]');
        if (label) {                                               // brief "Copied" confirmation on the button itself
            label.textContent = t('copied');
            button.classList.add('is-done');
            setTimeout(() => { label.textContent = t('copy_link'); button.classList.remove('is-done'); }, 2000);
        }
    }

    // ---- Detail sheet ----------------------------------------------------
    const eventDialog = $('event-dialog');
    const pageDialog = $('page-dialog');
    let openUid = null;
    let openPage = null;

    function fillEventDialog(e) {
        $('event-dialog-body').innerHTML = `
            <div class="media sheet__media">
                ${picture(e, '(max-width: 720px) 100vw, 720px', true)}
                <span class="badge">${esc(sectionLabel(e))}</span>
            </div>
            <div class="sheet__content">
                ${kicker(e)}
                <h2 class="sheet__title" id="sheet-title">${esc(e.title)}</h2>
                <p class="standfirst">${esc(e.desc || t('no_desc'))}</p>
                ${facts(e, true)}
                ${ctaRow(e, false)}
                ${shareRow(e)}
                <p class="sheet__report"><a class="text-link" href="${esc(reportUrl(e))}" target="_blank" rel="noopener noreferrer">${esc(t('report_listing'))}</a></p>
            </div>`;
    }

    function openEvent(uid, fromHash) {
        const e = byUid.get(uid);
        if (!e) return;
        openUid = uid;
        fillEventDialog(e);
        if (pageDialog.open) pageDialog.close();
        if (!eventDialog.open) eventDialog.showModal();
        $('event-dialog-body').scrollTop = 0;
        if (!fromHash) history.replaceState(null, '', `#e=${uid}`);
    }

    function fillPageDialog(page) {
        const copy = {
            about: ['about_title', 'about_desc'],
            terms: ['directory_title', 'legal_terms'],
            privacy: ['privacy', 'legal_privacy']
        }[page];
        if (!copy) return false;
        const isTerms = page === 'terms';
        $('page-title').textContent = t(copy[0]);
        $('page-notice').hidden = !isTerms;
        $('page-notice').textContent = t('directory_notice');
        $('page-text').textContent = t(copy[1]);
        $('page-actions').hidden = !isTerms;
        $('page-actions').innerHTML = isTerms ? `
            <a class="btn btn--primary" href="${esc(submitUrl())}" target="_blank" rel="noopener noreferrer">${esc(t('submit_event'))}</a>
            <a class="btn" href="${esc(reportUrl(null))}" target="_blank" rel="noopener noreferrer">${esc(t('report_listing'))}</a>` : '';
        return true;
    }

    function openFromHash() {
        const m = location.hash.match(/^#e=([\w-]+)$/);
        if (m && byUid.has(m[1])) openEvent(m[1], true);
    }

    eventDialog.addEventListener('close', () => {
        openUid = null;
        if (location.hash.startsWith('#e=')) history.replaceState(null, '', location.pathname + location.search);
    });
    pageDialog.addEventListener('close', () => { openPage = null; });
    [eventDialog, pageDialog].forEach(dialog => dialog.addEventListener('click', ev => {
        if (ev.target === dialog || ev.target.closest('[data-close]')) dialog.close();   // backdrop or ✕
    }));

    // ---- Theme -----------------------------------------------------------
    function effectiveTheme() {
        return document.documentElement.getAttribute('data-theme') ||
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    function toggleTheme() {
        const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        storage.set('theme', next);
        document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
            meta.content = next === 'dark' ? '#101114' : '#FAF8F5';
        });
    }

    // ---- Structured data (schema.org Event + Place) ---------------------
    function injectStructuredData() {
        const canonical = document.querySelector('link[rel="canonical"]');
        const base = canonical ? canonical.href : pageUrl();
        const iso = (date, minutes) => {
            const day = addDays(date, Math.floor(minutes / 1440));
            const m = ((minutes % 1440) + 1440) % 1440;
            return `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+07:00`;
        };
        // The coming week is what searchers ask about ("today", "tonight", "this weekend").
        const horizon = addDays(stripMin, 7);
        const graph = datedEvents.filter(e => e.date >= stripMin && e.date <= horizon).slice(0, 150).map(e => {
            const url = `${base}#e=${e.uid}`;
            const online = /online/i.test(e.venue);
            const item = {
                '@type': 'Event',
                '@id': url,
                name: e.title,
                startDate: e.start != null ? iso(e.date, e.start) : e.date,
                eventStatus: 'https://schema.org/EventScheduled',
                eventAttendanceMode: `https://schema.org/${online ? 'Online' : 'Offline'}EventAttendanceMode`,
                location: online
                    ? { '@type': 'VirtualLocation', url: e.link || url }
                    : {
                        '@type': 'Place',
                        name: (e.venue || 'Chiang Mai').replace(/\s*\(see listing\)$/, ''),
                        address: { '@type': 'PostalAddress', addressLocality: 'Chiang Mai', addressCountry: 'TH' }
                    },
                image: [new URL(`${IMG_DIR}${e.img}-960.jpg`, base).href],
                description: e.desc || `${e.title} at ${e.venue}, Chiang Mai.`,
                inLanguage: 'en',
                isAccessibleForFree: e.isFree,
                url: e.link || url
            };
            if (e.start != null && e.end != null) item.endDate = iso(e.date, e.end <= e.start ? e.end + 1440 : e.end);
            if (e.lat != null && !online) {
                item.location.geo = { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lng };
            }
            if (!e.isFree && e.link) {                                 // price unknown: point at the booking page
                item.offers = { '@type': 'Offer', url: e.link, availability: 'https://schema.org/InStock' };
            }
            if (e.isFree) {
                item.offers = {
                    '@type': 'Offer', price: '0', priceCurrency: 'THB',
                    availability: 'https://schema.org/InStock', url: e.link || url
                };
            }
            return item;
        });
        if (!graph.length) return;
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'ld-events';
        script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
        document.head.appendChild(script);
    }

    // ---- Wiring ----------------------------------------------------------
    /** Apply one discovery choice, e.g. "when:today", "vibe:dance", "price:free", "area:Nimman". */
    function applyChoice(choice) {
        const cut = choice.indexOf(':');
        const dimension = choice.slice(0, cut);
        const value = choice.slice(cut + 1);
        if (dimension === 'when') {
            state.when = value;
            state.stripOpen = false;
        } else if (dimension === 'vibe') {
            state.vibe = state.vibe === value ? 'all' : value;         // tapping the active pill clears it
            // Saved events and festivals span many days, so look across all of them.
            if (state.vibe === 'saved' || state.vibe.startsWith('festival:')) state.when = 'all';
        } else if (dimension === 'price') {
            state.freeOnly = value === 'free';
        } else if (dimension === 'area') {
            state.area = state.area === value ? '' : value;
        }
    }

    function resetFilters() {
        Object.assign(state, initialState(), { filtersOpen: state.filtersOpen });
        $('q').value = '';
        suggestIndex = -1;
        renderSuggestions(false);
    }

    document.addEventListener('click', ev => {
        const el = ev.target.closest('[data-open], [data-act], [data-day], [data-set], [data-suggest], [data-reset], [data-page]');
        if (!el) return;

        if (el.dataset.open) {
            if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;        // let "open in new tab" work
            ev.preventDefault();
            openEvent(el.dataset.open);
        } else if (el.dataset.act) {
            const e = byUid.get(el.dataset.uid);
            if (!e) return;
            if (el.dataset.act === 'save') toggleSave(e.uid);
            else if (el.dataset.act === 'ics') downloadIcs(e);
            else if (el.dataset.act === 'share') share(e);
            else if (el.dataset.act === 'copy') copyLink(e, el);
        } else if (el.dataset.day) {
            state.when = 'date';
            state.date = el.dataset.day;
            showDay(state.date);
            renderAll(true);
            settleScroll();
        } else if (el.dataset.set !== undefined) {
            applyChoice(el.dataset.set);
            renderAll(true);
            settleScroll();
        } else if (el.dataset.suggest !== undefined) {
            suggestIndex = -1;
            setQuery(el.dataset.suggest);
            renderSuggestions(false);
        } else if (el.dataset.reset !== undefined) {
            resetFilters();
            renderAll(true);
        } else if (el.dataset.page) {
            if (fillPageDialog(el.dataset.page)) { openPage = el.dataset.page; pageDialog.showModal(); }
        }
    });

    /** Left/Right (and Home/End) move focus along a row of buttons, like a toolbar. */
    function arrowKeys(container, selector) {
        container.addEventListener('keydown', ev => {
            const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[ev.key];
            if (!step) return;
            const items = [...container.querySelectorAll(selector)].filter(el => !el.hidden && !el.disabled);
            const index = items.indexOf(document.activeElement);
            if (index < 0) return;
            ev.preventDefault();
            items[Math.max(0, Math.min(items.length - 1, index + step))].focus();
        });
    }

    function shiftStrip(days) {
        let start = addDays(state.stripStart, days);
        if (start < stripMin) start = stripMin;
        if (start > stripMax) start = stripMax;
        state.stripStart = start;
        renderStrip();
    }

    // i18n.js calls this after every language switch
    window.onLanguageChange = () => {
        if (!ready) return;
        renderAll(false);
        if (openUid && byUid.has(openUid)) fillEventDialog(byUid.get(openUid));
        if (openPage) fillPageDialog(openPage);
    };

    document.addEventListener('DOMContentLoaded', () => {
        $('days-prev').addEventListener('click', () => shiftStrip(-7));
        $('days-next').addEventListener('click', () => shiftStrip(7));
        $('theme-toggle').addEventListener('click', toggleTheme);
        arrowKeys($('day-list'), '.day');
        ['when-row', 'vibe-row', 'price-row', 'area-row'].forEach(id => arrowKeys($(id), '.pill'));

        // "Choose date" opens the day strip; the phone-only toggle opens vibe, price and area.
        $('when-row').addEventListener('click', ev => {
            if (!ev.target.closest('#date-toggle')) return;
            state.stripOpen = !state.stripOpen;
            if (state.stripOpen && state.when === 'date') showDay(state.date);
            renderDiscover();
            renderStrip();
        });
        $('filters-toggle').addEventListener('click', () => { state.filtersOpen = !state.filtersOpen; renderDiscover(); });
        $('clear-filters').addEventListener('click', () => { resetFilters(); renderAll(true); });

        // Search: filter on every keystroke; suggestions follow the arrow keys.
        const search = $('q');
        search.addEventListener('input', () => { suggestIndex = -1; setQuery(search.value); renderSuggestions(true); });
        search.addEventListener('focus', () => renderSuggestions(true));
        search.addEventListener('blur', () => setTimeout(() => renderSuggestions(false), 150));
        search.addEventListener('keydown', ev => {
            const items = $('suggestions').hidden ? [] : suggestions();
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                if (!items.length) return;
                ev.preventDefault();
                // Cycle through "nothing selected" (-1) and each suggestion.
                const slots = items.length + 1;
                suggestIndex = (suggestIndex + 1 + (ev.key === 'ArrowDown' ? 1 : -1) + slots) % slots - 1;
                renderSuggestions(true);
            } else if (ev.key === 'Enter') {
                ev.preventDefault();
                if (suggestIndex >= 0 && items[suggestIndex]) setQuery(items[suggestIndex].label);
                suggestIndex = -1;
                renderSuggestions(false);
                search.blur();                                          // drop the phone keyboard to reveal results
            } else if (ev.key === 'Escape') {
                if (!$('suggestions').hidden) { ev.preventDefault(); renderSuggestions(false); }
                else if (state.q) { ev.preventDefault(); setQuery(''); }
            }
        });

        // Jump dock
        $('dock-up').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        $('dock-down').addEventListener('click', () => {
            const target = nextTarget();
            if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - stickyOffset(), behavior: 'smooth' });
        });
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => { ticking = false; updateDock(); });
        }, { passive: true });

        $('home-link').addEventListener('click', ev => {
            ev.preventDefault();
            resetFilters();
            renderAll(false);
            window.scrollTo({ top: 0 });
        });
        window.addEventListener('hashchange', openFromHash);

        if (events.length) storage.set('savedEvents', JSON.stringify(saved));   // persist any id migration
        ready = true;
        renderAll(false);
        injectStructuredData();
        openFromHash();
    });

    // ---- Offline support -------------------------------------------------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
        });
    }
})();
