#!/usr/bin/env python3
"""
TableCheck reservation availability checker for Pizza Marumo.
Checks all available slots for 4 adults, table service.

Strategy
--------
1. Open the reservation page in a headless browser.
2. Select 4 guests and table service.
3. Intercept the first availability API call the page makes.
4. Replay that same API call (adjusting the date) for every day in the range
   using plain HTTP requests — much faster than clicking through the calendar.

Usage
-----
    pip install playwright requests
    playwright install chromium
    python3 check_reservations.py [--days 60] [--visible]
"""

import argparse
import json
import re
import sys
import time
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

NUM_PEOPLE = 4
SHOP_SLUG = "pizza-marumo"
RESERVE_URL = f"https://www.tablecheck.com/ja/shops/{SHOP_SLUG}/reserve"

# TableCheck known API path fragments to watch
AVAIL_PATTERNS = re.compile(
    r"(merit|avail|slot|timeslot|vacancy|capacity|stock|schedule)", re.I
)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Check Pizza Marumo reservations")
    p.add_argument("--days", type=int, default=60,
                   help="Days ahead to check (default: 60)")
    p.add_argument("--visible", action="store_true",
                   help="Show browser window (default: headless)")
    p.add_argument("--output", default="reservations.json",
                   help="JSON output file (default: reservations.json)")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Browser session
# ---------------------------------------------------------------------------

def run(days: int, headless: bool, output_path: str):
    try:
        from playwright.sync_api import sync_playwright
        import requests as req
    except ImportError:
        print("Missing dependencies. Run:\n  pip install playwright requests && playwright install chromium")
        sys.exit(1)

    today = date.today()
    end = today + timedelta(days=days)

    print(f"Pizza Marumo — availability checker")
    print(f"  Guests   : {NUM_PEOPLE} adults, table service")
    print(f"  Range    : {today} → {end}  ({days} days)")
    print(f"  Headless : {headless}\n")

    captured = {}   # url → response JSON
    headers_seen = {}  # url → request headers

    def on_response(response):
        url = response.url
        if response.status != 200:
            return
        if AVAIL_PATTERNS.search(url) or "tablecheck" in url:
            try:
                body = response.json()
                captured[url] = body
            except Exception:
                pass

    def on_request(request):
        url = request.url
        if AVAIL_PATTERNS.search(url) or "tablecheck" in url:
            headers_seen[url] = dict(request.headers)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            locale="ja-JP",
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        page.on("response", on_response)
        page.on("request", on_request)

        print(f"→ Opening {RESERVE_URL}")
        page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(4_000)

        # ------------------------------------------------------------------ #
        # Step 1: select 4 guests                                             #
        # ------------------------------------------------------------------ #
        _set_guest_count(page, NUM_PEOPLE)
        page.wait_for_timeout(1_500)

        # ------------------------------------------------------------------ #
        # Step 2: select table service                                        #
        # ------------------------------------------------------------------ #
        _set_seat_type(page, "テーブル")
        page.wait_for_timeout(1_500)

        # ------------------------------------------------------------------ #
        # Step 3: click the first clickable date to trigger an API call       #
        # ------------------------------------------------------------------ #
        _trigger_first_date_click(page)
        page.wait_for_timeout(3_000)

        # Dump all captured URLs for debugging
        print("\n[debug] Captured API calls:")
        for u in list(captured.keys()):
            print(f"  {u[:120]}")

        browser.close()

    # ---------------------------------------------------------------------- #
    # Step 4: identify the availability endpoint + replay for all dates       #
    # ---------------------------------------------------------------------- #
    avail_url = _pick_avail_url(captured)

    if avail_url:
        print(f"\n[info] Using API endpoint: {avail_url[:100]}…")
        hdrs = headers_seen.get(avail_url, {})
        # Strip hop-by-hop headers that we can't replay
        for h in ("content-length", "content-encoding", "transfer-encoding",
                  "connection", "host"):
            hdrs.pop(h, None)
        slots = _query_api_for_range(avail_url, hdrs, today, end, req)
    else:
        print("\n[warn] No API endpoint captured — falling back to browser calendar scan")
        slots = _browser_calendar_scan(days, headless)

    # ---------------------------------------------------------------------- #
    # Output                                                                  #
    # ---------------------------------------------------------------------- #
    _print_results(slots)

    result = {
        "checked_at": datetime.now().isoformat(),
        "shop": SHOP_SLUG,
        "num_people": NUM_PEOPLE,
        "seat_type": "table",
        "range_start": str(today),
        "range_end": str(end),
        "slots": slots,
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nSaved → {output_path}")


# ---------------------------------------------------------------------------
# UI helpers
# ---------------------------------------------------------------------------

def _set_guest_count(page, count: int):
    """Try every known pattern to select guest count = count."""
    print(f"  Setting guests = {count}…", end=" ")

    # Pattern A: numbered buttons (1 2 3 4 …)
    for btn in page.locator("button, [role='button']").all():
        try:
            if btn.inner_text().strip() == str(count) and btn.is_visible():
                btn.click()
                print("✓ (button)")
                return
        except Exception:
            continue

    # Pattern B: <select> element
    for sel in page.locator("select").all():
        try:
            opts = sel.locator("option").all()
            if any(o.get_attribute("value") == str(count) for o in opts):
                sel.select_option(str(count))
                print("✓ (select)")
                return
        except Exception:
            continue

    # Pattern C: stepper — click "+" until we reach count
    plus = page.locator('button[aria-label*="増"], button:has-text("+"), button[data-direction="up"]').first
    try:
        if plus.is_visible():
            for _ in range(count - 1):
                plus.click()
                page.wait_for_timeout(200)
            print("✓ (stepper)")
            return
    except Exception:
        pass

    print("⚠ not found")


def _set_seat_type(page, keyword: str):
    """Click the table-service option."""
    print(f"  Setting seat type '{keyword}'…", end=" ")
    keywords = [keyword, "table", "TABLE", "テーブル席", "着席", "ダイニング"]
    for kw in keywords:
        try:
            el = page.get_by_text(kw, exact=True).first
            if el.is_visible():
                el.click()
                print(f"✓ ('{kw}')")
                return
        except Exception:
            continue
    # Try radio / checkbox inputs labeled with these words
    for kw in keywords:
        try:
            el = page.locator(f'label:has-text("{kw}"), [value*="table"]').first
            if el.is_visible():
                el.click()
                print(f"✓ (label '{kw}')")
                return
        except Exception:
            continue
    print("⚠ not found")


def _trigger_first_date_click(page):
    """Click the first non-disabled calendar date to trigger an API request."""
    print("  Clicking first available date to capture API…", end=" ")

    selectors = [
        'td:not(.disabled):not([aria-disabled="true"]) > button:not(:disabled)',
        '[class*="day"]:not([class*="disabled"]):not([aria-disabled="true"])',
        '[class*="Date"]:not([class*="disabled"])',
        'td[data-date]:not(.disabled)',
        'button[data-date]',
    ]
    for sel in selectors:
        try:
            els = page.locator(sel).all()
            for el in els:
                if el.is_visible() and el.is_enabled():
                    el.click()
                    print("✓")
                    return
        except Exception:
            continue
    print("⚠ no clickable date found")


# ---------------------------------------------------------------------------
# API detection & replay
# ---------------------------------------------------------------------------

def _pick_avail_url(captured: dict) -> str | None:
    """Choose the best availability API URL from captured responses."""
    scored = []
    for url, body in captured.items():
        score = 0
        if AVAIL_PATTERNS.search(url):
            score += 3
        if isinstance(body, dict):
            for key in ("slots", "times", "availabilities", "merits", "schedules", "data"):
                if key in body:
                    score += 2
        if score > 0:
            scored.append((score, url))
    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][1]


def _query_api_for_range(template_url: str, headers: dict, start: date, end: date, req) -> list:
    """
    Replay the captured API call for every date in [start, end].
    Tries to substitute the date parameter in the query string.
    """
    parsed = urlparse(template_url)
    qs = parse_qs(parsed.query, keep_blank_values=True)

    # Find date param key
    date_key = None
    for k in qs:
        for v in qs[k]:
            if re.match(r'\d{4}-\d{2}-\d{2}', v):
                date_key = k
                break
        if date_key:
            break

    slots = []
    current = start
    while current <= end:
        ds = current.isoformat()
        if date_key:
            new_qs = dict(qs)
            new_qs[date_key] = [ds]
            query = urlencode(new_qs, doseq=True)
        else:
            query = parsed.query  # use original query if no date param found

        url = urlunparse(parsed._replace(query=query))

        try:
            resp = req.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                day_slots = _extract_slots_from_json(data, ds)
                if day_slots:
                    print(f"  {ds}: {len(day_slots)} slot(s) — {', '.join(s['time'] for s in day_slots)}")
                    slots.extend(day_slots)
                else:
                    print(f"  {ds}: –")
            else:
                print(f"  {ds}: HTTP {resp.status_code}")
        except Exception as e:
            print(f"  {ds}: error ({e})")

        current += timedelta(days=1)
        time.sleep(0.3)  # be polite

    return slots


def _extract_slots_from_json(data, date_str: str) -> list:
    """Parse an API response into a list of {date, time} dicts."""
    results = []
    if not isinstance(data, dict):
        return results

    # Common key names across TableCheck API versions
    for key in ("slots", "times", "availabilities", "merits", "schedules", "data", "results"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            t = (
                item.get("time")
                or item.get("start_time")
                or item.get("start_at")
                or item.get("startTime")
                or item.get("datetime", "")[:16]
            )
            if t and _looks_like_time(str(t)):
                d = item.get("date") or item.get("day") or date_str
                available = item.get("available", item.get("is_available", True))
                if available:
                    results.append({"date": str(d)[:10], "time": str(t)[:5]})
        if results:
            return results

    # Nested: data.availability_by_date[date] = [...]
    nested = data.get("availability_by_date") or data.get("byDate") or {}
    if isinstance(nested, dict) and date_str in nested:
        for item in nested[date_str]:
            t = item.get("time") or item.get("start_time", "")
            if t:
                results.append({"date": date_str, "time": str(t)[:5]})

    return results


def _looks_like_time(s: str) -> bool:
    return bool(re.match(r'\d{1,2}:\d{2}', s))


# ---------------------------------------------------------------------------
# Fallback: full browser calendar scan
# ---------------------------------------------------------------------------

def _browser_calendar_scan(days: int, headless: bool) -> list:
    """Slower fallback: click every available date in the browser calendar."""
    from playwright.sync_api import sync_playwright

    today = date.today()
    end = today + timedelta(days=days)
    slots = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(locale="ja-JP")
        page = context.new_page()

        page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(3_000)
        _set_guest_count(page, NUM_PEOPLE)
        page.wait_for_timeout(1_000)
        _set_seat_type(page, "テーブル")
        page.wait_for_timeout(1_500)

        months_done = set()
        current_month = (today.year, today.month)
        target_month = (end.year, end.month)

        while current_month <= target_month:
            year, month = current_month
            if (year, month) not in months_done:
                months_done.add((year, month))
                cells = _available_cells_in_view(page, today, end)
                print(f"  {year}-{month:02d}: {len(cells)} available dates")

                for cell in cells:
                    d_str = cell["date"]
                    print(f"    {d_str}…", end=" ", flush=True)
                    try:
                        cell["el"].click()
                        page.wait_for_timeout(2_000)
                        ts = _time_slots_from_page(page)
                        print(f"{len(ts)} slot(s)" if ts else "–")
                        for t in ts:
                            slots.append({"date": d_str, "time": t})
                        page.go_back(wait_until="domcontentloaded")
                        page.wait_for_timeout(1_500)
                    except Exception as e:
                        print(f"err: {e}")

            # advance month
            y, m = current_month
            m += 1
            if m > 12:
                y, m = y + 1, 1
            current_month = (y, m)
            if current_month <= target_month:
                _click_next_month(page)
                page.wait_for_timeout(1_000)

        browser.close()

    return slots


def _available_cells_in_view(page, start: date, end: date) -> list:
    selectors = [
        'td:not(.disabled):not([aria-disabled="true"]) button',
        '[class*="day"]:not([class*="disabled"])[data-date]',
        '[class*="CalendarDay"]:not([class*="blocked"])',
    ]
    results = []
    for sel in selectors:
        try:
            for el in page.locator(sel).all():
                if not (el.is_visible() and el.is_enabled()):
                    continue
                d_str = el.get_attribute("data-date") or el.inner_text().strip()
                if re.match(r'^\d{4}-\d{2}-\d{2}$', d_str):
                    try:
                        dt = date.fromisoformat(d_str)
                        if start <= dt <= end:
                            results.append({"date": d_str, "el": el})
                    except Exception:
                        pass
            if results:
                return results
        except Exception:
            continue
    return results


def _time_slots_from_page(page) -> list:
    selectors = [
        '[class*="time"]:not([class*="disabled"]) button',
        'button[data-time]',
        '[class*="slot"]:not(.disabled)',
        '[class*="TimeSlot"]:not([class*="disabled"])',
    ]
    for sel in selectors:
        try:
            times = []
            for el in page.locator(sel).all():
                txt = el.inner_text().strip()
                if re.match(r'\d{1,2}:\d{2}', txt):
                    times.append(txt)
            if times:
                return times
        except Exception:
            continue
    return []


def _click_next_month(page):
    for sel in [
        'button[aria-label*="次"], button[aria-label*="next"]',
        '[class*="next"]',
        'button:has-text("›"), button:has-text(">")',
    ]:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.click()
                return
        except Exception:
            continue


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _print_results(slots: list):
    print(f"\n{'='*52}")
    print(f"  RESULTS — {NUM_PEOPLE} adults, table service, Pizza Marumo")
    print(f"{'='*52}")

    if not slots:
        print("  No available reservations found in the search range.")
        return

    by_date: dict[str, list[str]] = {}
    for s in slots:
        by_date.setdefault(s["date"], []).append(s["time"])

    for d in sorted(by_date):
        dt = datetime.strptime(d, "%Y-%m-%d")
        label = dt.strftime("%Y-%m-%d (%a)")
        times = "  ".join(sorted(set(by_date[d])))
        print(f"  {label}  →  {times}")

    total_times = sum(len(v) for v in by_date.values())
    print(f"\n  {total_times} time slot(s) across {len(by_date)} date(s)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = parse_args()
    run(
        days=args.days,
        headless=not args.visible,
        output_path=args.output,
    )
