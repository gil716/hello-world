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
    python3 check_reservations.py --start 2026-07-07 --end 2026-07-10
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
                   help="Days ahead to check (default: 60, ignored if --start/--end given)")
    p.add_argument("--start", type=str, default=None, metavar="YYYY-MM-DD",
                   help="Start date (inclusive), e.g. 2026-07-07")
    p.add_argument("--end", type=str, default=None, metavar="YYYY-MM-DD",
                   help="End date (inclusive), e.g. 2026-07-10")
    p.add_argument("--visible", action="store_true",
                   help="Show browser window (default: headless)")
    p.add_argument("--output", default="reservations.json",
                   help="JSON output file (default: reservations.json)")
    p.add_argument("--comment-file", default=None, metavar="PATH",
                   help="Write a GitHub-flavoured markdown comment to this file")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Browser session
# ---------------------------------------------------------------------------

def run(start: date, end: date, headless: bool, output_path: str, comment_file: str | None = None):
    try:
        from playwright.sync_api import sync_playwright
        import requests as req
    except ImportError:
        print("Missing dependencies. Run:\n  pip install playwright requests && playwright install chromium")
        sys.exit(1)

    days = (end - start).days + 1
    print(f"Pizza Marumo — availability checker")
    print(f"  Guests   : {NUM_PEOPLE} adults, table service")
    print(f"  Range    : {start} → {end}  ({days} day(s))")
    print(f"  Headless : {headless}\n")

    today = start  # alias so downstream code still works
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
        for h in ("content-length", "content-encoding", "transfer-encoding",
                  "connection", "host"):
            hdrs.pop(h, None)
        checked = _query_api_for_range(avail_url, hdrs, today, end, req)
    else:
        print("\n[warn] No API endpoint captured — falling back to browser calendar scan")
        checked = _browser_calendar_scan(start, end, headless)

    # Flatten available slots for backwards-compat JSON output
    slots = [{"date": d, "time": t} for d, v in checked.items() for t in v["available"]]

    # ---------------------------------------------------------------------- #
    # Output                                                                  #
    # ---------------------------------------------------------------------- #
    _print_results(checked)

    result = {
        "checked_at": datetime.now().isoformat(),
        "shop": SHOP_SLUG,
        "num_people": NUM_PEOPLE,
        "seat_type": "table",
        "range_start": str(start),
        "range_end": str(end),
        "checked": checked,
        "slots": slots,
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nSaved → {output_path}")

    if comment_file:
        body = _format_comment(checked, start, end)
        with open(comment_file, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"Comment → {comment_file}")


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


def _query_api_for_range(template_url: str, headers: dict, start: date, end: date, req) -> dict:
    """
    Replay the captured API call for every date in [start, end].
    Returns dict[date_str -> {"all": [...], "available": [...]}].
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

    checked: dict[str, dict] = {}
    current = start
    while current <= end:
        ds = current.isoformat()
        if date_key:
            new_qs = dict(qs)
            new_qs[date_key] = [ds]
            query = urlencode(new_qs, doseq=True)
        else:
            query = parsed.query

        url = urlunparse(parsed._replace(query=query))

        try:
            resp = req.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                day_slots = _extract_slots_from_json(data, ds)
                all_times = sorted(set(s["time"] for s in day_slots))
                avail_times = sorted(set(s["time"] for s in day_slots if s["available"]))
                checked[ds] = {"all": all_times, "available": avail_times}
                print(f"  {ds}: checked {len(all_times)} slot(s) — {', '.join(avail_times) or '–'}")
            else:
                checked[ds] = {"all": [], "available": []}
                print(f"  {ds}: HTTP {resp.status_code}")
        except Exception as e:
            checked[ds] = {"all": [], "available": []}
            print(f"  {ds}: error ({e})")

        current += timedelta(days=1)
        time.sleep(0.3)  # be polite

    return checked


def _extract_slots_from_json(data, date_str: str) -> list:
    """Parse an API response into a list of {date, time, available} dicts."""
    results = []
    if not isinstance(data, dict):
        return results

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
                available = bool(item.get("available", item.get("is_available", True)))
                results.append({"date": str(d)[:10], "time": str(t)[:5], "available": available})
        if results:
            return results

    # Nested: data.availability_by_date[date] = [...]
    nested = data.get("availability_by_date") or data.get("byDate") or {}
    if isinstance(nested, dict) and date_str in nested:
        for item in nested[date_str]:
            t = item.get("time") or item.get("start_time", "")
            if t:
                available = bool(item.get("available", item.get("is_available", True)))
                results.append({"date": date_str, "time": str(t)[:5], "available": available})

    return results


def _looks_like_time(s: str) -> bool:
    return bool(re.match(r'\d{1,2}:\d{2}', s))


# ---------------------------------------------------------------------------
# Fallback: full browser calendar scan
# ---------------------------------------------------------------------------

def _browser_calendar_scan(start: date, end: date, headless: bool) -> dict:
    """Slower fallback: click every available date in the browser calendar.
    Returns dict[date_str -> list[time_str]]; empty list means checked but nothing found."""
    from playwright.sync_api import sync_playwright

    checked: dict[str, list[str]] = {}

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
        current_month = (start.year, start.month)
        target_month = (end.year, end.month)

        while current_month <= target_month:
            year, month = current_month
            if (year, month) not in months_done:
                months_done.add((year, month))
                cells = _available_cells_in_view(page, start, end)
                print(f"  {year}-{month:02d}: {len(cells)} available dates")

                for cell in cells:
                    d_str = cell["date"]
                    print(f"    {d_str}…", end=" ", flush=True)
                    try:
                        cell["el"].click()
                        page.wait_for_timeout(2_000)
                        ts = _time_slots_from_page(page)
                        checked[d_str] = ts
                        print(f"checked {len(ts['all'])} — avail: {', '.join(ts['available']) or '–'}")
                        page.go_back(wait_until="domcontentloaded")
                        page.wait_for_timeout(1_500)
                    except Exception as e:
                        checked[d_str] = {"all": [], "available": []}
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

    return checked


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


def _time_slots_from_page(page) -> dict:
    """Return {"all": [...], "available": [...]} of time slots visible on the page."""
    all_selectors = [
        '[class*="time"] button',
        'button[data-time]',
        '[class*="slot"]',
        '[class*="TimeSlot"]',
    ]
    disabled_markers = ("disabled", "unavailable", "soldout", "full")

    for sel in all_selectors:
        try:
            all_times, avail_times = [], []
            for el in page.locator(sel).all():
                txt = el.inner_text().strip()
                if not re.match(r'\d{1,2}:\d{2}', txt):
                    continue
                all_times.append(txt)
                cls = (el.get_attribute("class") or "").lower()
                aria = (el.get_attribute("aria-disabled") or "").lower()
                is_disabled = any(m in cls for m in disabled_markers) or aria == "true" or not el.is_enabled()
                if not is_disabled:
                    avail_times.append(txt)
            if all_times:
                return {"all": sorted(set(all_times)), "available": sorted(set(avail_times))}
        except Exception:
            continue
    return {"all": [], "available": []}


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

def _format_comment(checked: dict, start: date, end: date) -> str:
    total_avail = sum(len(v["available"]) for v in checked.values())
    lines = [f"## 🍕 {start} → {end} · {NUM_PEOPLE} adults, table service", ""]

    if not checked:
        lines.append("⚠️ No dates were checked.")
    else:
        summary = f"✅ **{total_avail} slot(s) available**" if total_avail else "❌ **No availability found**"
        lines.append(f"{summary} — {len(checked)} date(s) checked")
        lines += ["", "| Date | Checked | Available |", "|------|---------|-----------|"]
        for d in sorted(checked):
            dt = datetime.strptime(d, "%Y-%m-%d")
            label = dt.strftime("%a %-d %b")
            v = checked[d]
            all_str = " · ".join(v["all"]) if v["all"] else "—"
            avail_str = " · ".join(v["available"]) if v["available"] else "—"
            lines.append(f"| **{label}** | {all_str} | {avail_str} |")

    lines += ["", f"*Checked {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*"]
    return "\n".join(lines)


def _print_results(checked: dict):
    print(f"\n{'='*52}")
    print(f"  RESULTS — {NUM_PEOPLE} adults, table service, Pizza Marumo")
    print(f"{'='*52}")

    if not checked:
        print("  No dates were checked.")
        return

    for d in sorted(checked):
        dt = datetime.strptime(d, "%Y-%m-%d")
        label = dt.strftime("%Y-%m-%d (%a)")
        v = checked[d]
        all_str = "  ".join(v["all"]) if v["all"] else "–"
        avail_str = "  ".join(v["available"]) if v["available"] else "–"
        print(f"  {label}  checked: {all_str}  |  available: {avail_str}")

    total = sum(len(v["available"]) for v in checked.values())
    avail_days = sum(1 for v in checked.values() if v["available"])
    print(f"\n  {total} slot(s) across {avail_days}/{len(checked)} date(s)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = parse_args()
    today = date.today()
    if args.start:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end) if args.end else start
    else:
        start = today
        end = today + timedelta(days=args.days)
    run(
        start=start,
        end=end,
        headless=not args.visible,
        output_path=args.output,
        comment_file=args.comment_file,
    )
