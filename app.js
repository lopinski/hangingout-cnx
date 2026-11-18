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

    const FILTER_TYPE = {
        filter_music: 'music', filter_workouts: 'workout', filter_language: 'language',
        filter_art: 'culture', filter_soul: 'soul', filter_dance: 'dance',
        filter_markets: 'markets', filter_courses: 'courses'
    };
    const TYPE_FILTER = Object.fromEntries(Object.entries(FILTER_TYPE).map(([k, v]) => [v, k]));

    // Every picture is served from this site. A listing's imageUrl is only used as a
    // hint: known files map to their optimised local copy, anything else (including
    // remote URLs from the scraper) falls back to the section picture.
    const KNOWN_IMAGES = {
        yoga_class: 'workout', lanna_art: 'culture', language_exchange: 'language',
        salsa_dance: 'dance', meditation_buddha: 'soul', generic_event: 'night-out',
        '1511192336575': 'music', '1533900298318': 'markets',
        '1556910103': 'courses', '1517486808906': 'community'
    };
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
        out: '<path d="M7 17L17 7M9 7h8v8"/>'
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
        for (const hint in KNOWN_IMAGES) if (src.includes(hint)) return KNOWN_IMAGES[hint];
        return SECTION_IMAGES.includes(type) ? type : 'night-out';
    }

    // ---- Data ------------------------------------------------------------
    const NEIGHBORHOODS = ['Old City', 'Nimman', 'Riverside', 'Santitham', 'Hang Dong'];
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
            neighborhood: NEIGHBORHOODS.includes(raw.neighborhood) ? raw.neighborhood : '',
            mapsUrl: safeMapsUrl(raw.mapsUrl),
            source: String(raw.source || '').toLowerCase(),
            price,
            // New feeds state is_free outright; older ones only had an optional price.
            isFree: typeof raw.is_free === 'boolean' ? raw.is_free : (!price || /^(free|gratis|0)\b/i.test(price)),
            featured: raw.featured === true,
            img: imageKey(raw, type)
        };
    }

    const byWhen = (a, b) =>
        (a.date || '9999').localeCompare(b.date || '9999') ||
        ((a.start == null ? -1 : a.start) - (b.start == null ? -1 : b.start)) ||
        a.title.localeCompare(b.title);

    const events = (Array.isArray(window.eventsData) ? window.eventsData : []).map(normalise).sort(byWhen);
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

    const state = {
        filter: 'filter_all',
        sub: null,
        day: (datedEvents.find(e => e.date >= stripMin) || { date: stripMin }).date,   // 'YYYY-MM-DD' or 'all'
        stripStart: stripMin
    };

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
    function matchesSection(e) {
        if (state.filter === 'filter_all') return true;
        if (state.filter === 'filter_saved') return isSaved(e.uid);
        if (state.filter.startsWith('festival:')) return e.festival === state.filter.slice(9);
        const type = FILTER_TYPE[state.filter];
        return e.type === type || e.category.toLowerCase().includes(type);
    }
    const matchesSub = e => !state.sub || e.tags.some(tag => tag.toLowerCase() === state.sub);

    /** Events for the current section + tag, across all days. */
    const pool = () => events.filter(e => matchesSection(e) && matchesSub(e));

    function dayCounts(list) {
        const counts = new Map();
        list.forEach(e => { if (e.date) counts.set(e.date, (counts.get(e.date) || 0) + 1); });
        return counts;
    }

    /** If the chosen day has nothing in this section, move to the nearest day that does. */
    function settleDay() {
        if (state.filter === 'filter_saved') { state.day = 'all'; return; }
        if (state.day === 'all') return;
        const dates = [...dayCounts(pool()).keys()].sort();
        if (!dates.length || dates.includes(state.day)) return;
        const visible = dates.filter(d => d >= stripMin);
        state.day = visible.find(d => d >= state.day) || visible[visible.length - 1] || state.day;
        showDay(state.day);
    }

    function showDay(day) {
        if (day === 'all') return;
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
    const SOURCE_NAMES = { meetup: 'Meetup', eventbrite: 'Eventbrite', luma: 'Luma', citylife: 'Chiang Mai Citylife' };
    const priceClass = e => (e.isFree ? 'free' : 'paid');
    const whenText = e => (e.date ? `${fmtLong(e.date)} · ${timeText(e)}` : t('date_tbc'));

    function picture(e, cls, sizes, eager) {
        const base = IMG_DIR + e.img;
        return `<img src="${base}-480.jpg" srcset="${base}-480.jpg 480w, ${base}-960.jpg 960w" sizes="${sizes}"
            alt="" width="960" height="640" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
    }

    function kicker(e, lead) {
        const tag = e.tags[0] ? `<span class="kicker__tag">${esc(titleCase(e.tags[0]))}</span>` : '';
        const section = e.festival ? `${festivalLabel(e.festival)} · ${sectionLabel(e)}` : sectionLabel(e);
        const label = lead ? `${esc(t('editors_pick'))} · ${esc(section)}` : esc(section);
        return `<p class="kicker"><span>${label}</span>${tag}</p>`;
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
    function ctaRow(e) {
        const on = isSaved(e.uid);
        const cal = e.date ? `
            <a class="btn btn--primary" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer">${icon('gcal')}${esc(t('add_gcal'))}</a>
            <button type="button" class="btn" data-act="ics" data-uid="${e.uid}">${icon('ical')}${esc(t('add_ical'))}</button>` : '';
        const more = e.link
            ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${icon('out')}${esc(t('btn_learn_more'))}</a>` : '';
        return `<div class="cta">${cal}
            <a class="btn" href="${esc(mapsUrl(e))}" target="_blank" rel="noopener noreferrer">${icon('map')}${esc(t('act_map'))}</a>
            <button type="button" class="btn" data-act="save" data-uid="${e.uid}" aria-pressed="${on}">${icon('heart', 'icon--heart')}<span data-save-label>${esc(t(on ? 'act_saved' : 'act_save'))}</span></button>
            <button type="button" class="btn" data-act="share" data-uid="${e.uid}">${icon('share')}${esc(t('act_share'))}</button>
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
                ${picture(e, '', '(max-width: 640px) 92px, (max-width: 960px) 46vw, 360px')}
            </a>
            <div class="card__body">
                ${kicker(e)}
                <h3 class="card__title"><a href="#e=${e.uid}" data-open="${e.uid}">${esc(e.title)}</a></h3>
                <p class="card__meta"><strong>${esc(when)}</strong> · ${esc(placeText(e))} · <span class="${priceClass(e)}">${esc(priceLabel(e))}</span></p>
            </div>
            ${actionBar(e)}
        </article>`;
    }

    // ---- Render: sections nav -------------------------------------------
    function renderNav() {
        // A festival with at least two upcoming listings gets its own chip, first in line (two at most).
        const festivals = new Map();
        events.forEach(e => { if (e.festival && e.date >= stripMin) festivals.set(e.festival, (festivals.get(e.festival) || 0) + 1); });
        $('festival-chips').innerHTML = [...festivals].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([slug]) =>
            `<button type="button" class="section-link section-link--festival" data-filter="festival:${esc(slug)}" aria-pressed="false"><span aria-hidden="true">★</span> <span>${esc(festivalLabel(slug))}</span></button>`
        ).join('');

        // Sections with nothing in the feed are hidden; sections with nothing on the chosen day are quietened.
        const inFeed = new Set(events.map(e => e.type));
        const onDay = new Set(events.filter(e => state.day === 'all' || e.date === state.day).map(e => e.type));
        document.querySelectorAll('[data-filter]').forEach(btn => {
            const active = btn.dataset.filter === state.filter;
            const type = FILTER_TYPE[btn.dataset.filter];
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active);
            if (type) {
                btn.hidden = !inFeed.has(type) && !active;
                btn.classList.toggle('is-quiet', !onDay.has(type));
            }
        });
        $('saved-count').textContent = saved.length;

        // Tag chips come from the listings themselves, so there are no dead ends.
        const box = $('sub-filters');
        const tags = new Map();
        if (FILTER_TYPE[state.filter]) {
            events.filter(matchesSection).forEach(e => e.tags.forEach(tag => {
                const key = tag.toLowerCase();
                if (key === 'weekly') return;                           // a schedule note, not a genre
                tags.set(key, (tags.get(key) || 0) + 1);
            }));
        }
        box.hidden = tags.size < 2;
        box.innerHTML = [...tags.keys()].sort().map(tag =>
            `<button type="button" class="chip${state.sub === tag ? ' is-active' : ''}" data-sub="${esc(tag)}" aria-pressed="${state.sub === tag}">${esc(titleCase(tag))} <span aria-hidden="true">· ${tags.get(tag)}</span></button>`
        ).join('');
    }

    // ---- Render: day strip ----------------------------------------------
    function renderStrip() {
        const list = pool();
        const counts = dayCounts(list);
        const cells = [`<button type="button" class="day day--all${state.day === 'all' ? ' is-active' : ''}" data-day="all" aria-pressed="${state.day === 'all'}">
            <span class="day__num">${esc(t('all_dates'))}</span><span class="day__count">${list.length}</span></button>`];

        for (let i = 0; i < STRIP_DAYS; i++) {
            const date = addDays(state.stripStart, i);
            const n = counts.get(date) || 0;
            const active = state.day === date;
            const isToday = date === today;
            const showMonth = i === 0 || date.endsWith('-01');
            const dow = isToday ? t('today') : fmt(date, { weekday: 'short' });
            const cls = ['day', active && 'is-active', isToday && 'is-today', !n && 'is-empty'].filter(Boolean).join(' ');
            cells.push(`<button type="button" class="${cls}" data-day="${date}" aria-pressed="${active}"
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
                ${picture(lead, '', '(max-width: 640px) 100vw, (max-width: 960px) 50vw, 660px', true)}
                <span class="badge">${esc(sectionLabel(lead))}</span>
            </a>
            <div class="cover__body">
                ${kicker(lead, true)}
                <h2 class="cover__title"><a href="#e=${lead.uid}" data-open="${lead.uid}">${esc(lead.title)}</a></h2>
                ${lead.desc ? `<p class="standfirst">${esc(lead.desc)}</p>` : ''}
                ${facts(lead)}
                ${ctaRow(lead)}
            </div>
        </article>`;
    }

    function pager(counts) {
        if (state.day === 'all') return '';
        const dates = [...counts.keys()].filter(d => d >= stripMin).sort();
        const prev = dates.filter(d => d < state.day).pop();
        const next = dates.find(d => d > state.day);
        const link = (date, label, arrowFirst) => `<button type="button" class="btn" data-day="${date}">
            ${arrowFirst ? '<span aria-hidden="true">←</span>' : ''}
            <span><span class="pager__label">${esc(label)}</span><br>${esc(fmtLong(date))} · ${esc(countLabel(counts.get(date)))}</span>
            ${arrowFirst ? '' : '<span aria-hidden="true">→</span>'}</button>`;
        if (!prev && !next) return '';
        return `<nav class="pager">${prev ? link(prev, t('earlier'), true) : ''}${next ? link(next, t('next_up'), false) : ''}</nav>`;
    }

    function emptyState() {
        const message = state.filter === 'filter_saved' ? t('empty_saved')
            : state.day !== 'all' ? tf('empty_day', { date: fmtLong(state.day) })
            : t('empty_events');
        const buttons = [];
        if (state.filter !== 'filter_all') buttons.push(`<button type="button" class="btn btn--primary" data-filter="filter_all">${esc(t('show_all_sections'))}</button>`);
        if (state.day !== 'all') buttons.push(`<button type="button" class="btn" data-day="all">${esc(t('show_all_dates'))}</button>`);
        return `<div class="empty"><p>${esc(message)}</p><div class="cta">${buttons.join('')}</div></div>`;
    }

    function renderListings() {
        const all = pool();
        const counts = dayCounts(all);
        const list = state.day === 'all' ? all : all.filter(e => e.date === state.day);
        const lead = pickLead(list);
        const rest = list.filter(e => e !== lead);

        renderCover(lead);

        let html = '';
        if (!list.length) {
            html = emptyState();
        } else if (state.day === 'all') {
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
        } else if (rest.length) {
            html = `<header class="section-head">
                    <h2>${esc(tf('also_on', { date: fmtLong(state.day) }))}</h2>
                    <p>${esc(countLabel(rest.length))}</p>
                </header>
                <div class="grid">${rest.map(e => card(e, false)).join('')}</div>`;
        }
        $('dossier').innerHTML = html + pager(counts);
    }

    function renderChrome() {
        $('today-line').textContent = fmt(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        $('today-line').dateTime = today;
        const meta = window.eventsMeta;
        const stamp = meta && /^\d{4}-\d{2}-\d{2}/.test(meta.updated || '') ? meta.updated.slice(0, 10) : '';
        $('updated-line').textContent = stamp ? tf('updated', { date: fmt(stamp, { day: 'numeric', month: 'long', year: 'numeric' }) }) : '';
        $('submit-link').href = submitUrl();
        const notice = $('back-issue');
        notice.hidden = !isBackIssue;
        if (isBackIssue) {
            const range = { day: 'numeric', month: 'long', year: 'numeric' };
            notice.textContent = tf('back_issue', { from: fmt(firstDate, range), to: fmt(lastDate, range) });
        }
    }

    function renderAll(flash) {
        renderChrome();
        renderNav();
        renderStrip();
        renderListings();
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
        const top = $('listings').getBoundingClientRect().top + window.scrollY - $('daystrip').offsetHeight - 8;
        if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
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

        if (state.filter === 'filter_saved') { renderAll(false); }
        else { $('saved-count').textContent = saved.length; }
        document.querySelectorAll(`[data-act="save"][data-uid="${uid}"]`).forEach(btn => {
            btn.setAttribute('aria-pressed', on);
            const label = btn.querySelector('[data-save-label]');
            if (label) label.textContent = t(on ? 'act_saved' : 'act_save');
        });
    }

    async function share(e) {
        const url = shareUrl(e);
        if (navigator.share) {
            try { await navigator.share({ title: e.title, text: `${e.title} — ${whenText(e)}, ${e.venue}`, url }); } catch (err) { /* dismissed */ }
            return;
        }
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
    }

    // ---- Detail sheet ----------------------------------------------------
    const eventDialog = $('event-dialog');
    const pageDialog = $('page-dialog');
    let openUid = null;
    let openPage = null;

    function fillEventDialog(e) {
        $('event-dialog-body').innerHTML = `
            <div class="media sheet__media">
                ${picture(e, '', '(max-width: 720px) 100vw, 720px', true)}
                <span class="badge">${esc(sectionLabel(e))}</span>
            </div>
            <div class="sheet__content">
                ${kicker(e)}
                <h2 class="sheet__title" id="sheet-title">${esc(e.title)}</h2>
                <p class="standfirst">${esc(e.desc || t('no_desc'))}</p>
                ${facts(e, true)}
                ${ctaRow(e)}
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
                description: e.desc || `${e.title} at ${e.venue}, Chiang Mai. ${sectionLabelEn(e)}.`,
                inLanguage: 'en',
                isAccessibleForFree: e.isFree,
                url: e.link || url
            };
            if (e.start != null && e.end != null) item.endDate = iso(e.date, e.end <= e.start ? e.end + 1440 : e.end);
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
    const sectionLabelEn = e => e.category || 'Event';

    // ---- Wiring ----------------------------------------------------------
    document.addEventListener('click', ev => {
        const el = ev.target.closest('[data-open], [data-act], [data-day], [data-filter], [data-sub], [data-page]');
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
        } else if (el.dataset.day) {
            state.day = el.dataset.day;
            showDay(state.day);
            renderAll(true);
            settleScroll();
        } else if (el.dataset.filter) {
            state.filter = el.dataset.filter;
            state.sub = null;
            settleDay();
            renderAll(true);
            settleScroll();
        } else if (el.dataset.sub) {
            state.sub = state.sub === el.dataset.sub ? null : el.dataset.sub;
            settleDay();
            renderAll(true);
        } else if (el.dataset.page) {
            if (fillPageDialog(el.dataset.page)) { openPage = el.dataset.page; pageDialog.showModal(); }
        }
    });

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
        $('home-link').addEventListener('click', ev => {
            ev.preventDefault();
            state.filter = 'filter_all';
            state.sub = null;
            state.day = (datedEvents.find(e => e.date >= stripMin) || { date: stripMin }).date;
            state.stripStart = stripMin;
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
