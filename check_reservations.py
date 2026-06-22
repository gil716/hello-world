#!/usr/bin/env python3
"""
TableCheck reservation availability checker for Pizza Marumo.
Checks all time slots for 4 adults, table service.

Flow
----
For each date in range:
  1. Click the date on the calendar (skip if grayed out).
  2. Collect every time slot button shown on that page.
  3. Click each slot individually — if the page advances to a booking
     form it is available; if it stays or shows an error it is not.
  4. Navigate back and repeat.

Usage
-----
    pip install playwright
    playwright install chromium
    python3 check_reservations.py --start 2026-07-07 --end 2026-07-10 [--visible]
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

NUM_PEOPLE = 4
SHOP_SLUG = "pizza-marumo"
RESERVE_URL = f"https://www.tablecheck.com/ja/shops/{SHOP_SLUG}/reserve"

# Selectors tried in order for each element type.
# TableCheck uses hashed class names so we rely on structural patterns.
DATE_CELL_SELECTORS = [
    "td[data-date='{d}']",
    "button[data-date='{d}']",
    "[data-date='{d}']",
]

# Broad selectors for time slot elements — we filter by text content
TIME_SLOT_SELECTORS = [
    "button",
    "[role='button']",
    "li",
    "a",
]

# After clicking a slot, these signal we reached the booking form
ADVANCE_SIGNALS = [
    "input[name*='name'], input[name*='email'], input[name*='phone'], input[name*='tel']",
    "[class*='confirm'], [class*='Confirm']",
    "text=予約情報",
    "text=お客様情報",
    "text=次のステップ",
    "text=NEXT",
]

# Text / class markers that mean a slot is not clickable
DISABLED_MARKERS = ("disabled", "unavailable", "soldout", "full", "closed", "満席", "×")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Check Pizza Marumo reservation availability")
    p.add_argument("--start", required=True, metavar="YYYY-MM-DD")
    p.add_argument("--end", required=True, metavar="YYYY-MM-DD")
    p.add_argument("--visible", action="store_true", help="Show browser window")
    p.add_argument("--output", default="reservations.json")
    p.add_argument("--comment-file", default=None, metavar="PATH")
    p.add_argument("--debug-screenshots", action="store_true",
                   help="Save screenshots at each step to debug/")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(start: date, end: date, headless: bool, output_path: str,
        comment_file: str | None = None, debug: bool = False):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Run: pip install playwright && playwright install chromium")
        sys.exit(1)

    days = (end - start).days + 1
    print(f"Pizza Marumo — reservation checker")
    print(f"  Guests   : {NUM_PEOPLE} adults, table service")
    print(f"  Range    : {start} → {end}  ({days} day(s))")
    print(f"  Headless : {headless}\n")

    if debug:
        Path("debug").mkdir(exist_ok=True)

    checked: dict[str, dict] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(
            locale="ja-JP",
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = ctx.new_page()

        # ------------------------------------------------------------------
        # 1. Load page and configure
        # ------------------------------------------------------------------
        print(f"→ {RESERVE_URL}")
        page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(4_000)

        if debug:
            page.screenshot(path="debug/01_loaded.png")

        _set_guest_count(page, NUM_PEOPLE)
        page.wait_for_timeout(1_500)
        _set_seat_type(page, "テーブル")
        page.wait_for_timeout(2_000)

        if debug:
            page.screenshot(path="debug/02_setup_done.png")

        # ------------------------------------------------------------------
        # 2. Walk through each date
        # ------------------------------------------------------------------
        current = start
        while current <= end:
            ds = current.isoformat()

            _navigate_to_month(page, current.year, current.month)
            page.wait_for_timeout(800)

            date_el = _find_date_cell(page, current)

            if date_el is None:
                print(f"  {ds}: not found in calendar")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            if not _cell_is_available(date_el):
                print(f"  {ds}: grayed (no availability)")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            # Click the date
            print(f"  {ds}: ", end="", flush=True)
            try:
                date_el.click()
                page.wait_for_timeout(2_500)
            except Exception as e:
                print(f"click error: {e}")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            if debug:
                page.screenshot(path=f"debug/{ds}_after_date_click.png")
                _dump_html(page, f"debug/{ds}_after_date_click.html")

            # Collect all time slots visible after clicking the date
            slots = _collect_time_slots(page)
            print(f"{len(slots)} slot(s) found")

            if not slots:
                summary = _debug_summary(page)
                # Always write debug summary when no slots found (used by workflow)
                Path("debug").mkdir(exist_ok=True)
                Path(f"debug/{ds}_no_slots_summary.md").write_text(summary, encoding="utf-8")
                if debug:
                    _dump_html(page, f"debug/{ds}_no_slots.html")
                checked[ds] = {"all": [], "available": []}
                _back_to_calendar(page)
                page.wait_for_timeout(1_000)
                current += timedelta(days=1)
                continue

            all_times: list[str] = []
            avail_times: list[str] = []

            for slot in slots:
                t = slot["time"]
                all_times.append(t)

                if not slot["clickable"]:
                    print(f"    {t}: grayed")
                    continue

                # Click and check if booking form appears
                print(f"    {t}: ", end="", flush=True)
                try:
                    slot["el"].click()
                    page.wait_for_timeout(2_000)

                    if debug:
                        page.screenshot(path=f"debug/{ds}_{t.replace(':', '')}_after_slot.png")

                    if _booking_form_appeared(page):
                        avail_times.append(t)
                        print("✓ available")
                    else:
                        print("✗ not available")

                    # Return to the time slot list for this date
                    _back_to_slots(page, current)
                    page.wait_for_timeout(1_500)

                except Exception as e:
                    print(f"error: {e}")
                    _back_to_slots(page, current)
                    page.wait_for_timeout(1_500)

            checked[ds] = {
                "all": sorted(set(all_times)),
                "available": sorted(set(avail_times)),
            }

            _back_to_calendar(page)
            page.wait_for_timeout(1_000)
            current += timedelta(days=1)

        browser.close()

    # ------------------------------------------------------------------
    # 3. Output
    # ------------------------------------------------------------------
    slots_flat = [
        {"date": d, "time": t}
        for d, v in checked.items()
        for t in v["available"]
    ]

    _print_results(checked)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "checked_at": datetime.now().isoformat(),
            "shop": SHOP_SLUG,
            "num_people": NUM_PEOPLE,
            "seat_type": "table",
            "range_start": str(start),
            "range_end": str(end),
            "checked": checked,
            "slots": slots_flat,
        }, f, ensure_ascii=False, indent=2)
    print(f"\nSaved → {output_path}")

    if comment_file:
        with open(comment_file, "w", encoding="utf-8") as f:
            f.write(_format_comment(checked, start, end))
        print(f"Comment → {comment_file}")


# ---------------------------------------------------------------------------
# Setup helpers
# ---------------------------------------------------------------------------

def _set_guest_count(page, count: int):
    print(f"  Guests = {count}…", end=" ")

    # Numbered buttons  (1  2  3  4 …)
    for btn in page.locator("button, [role='button']").all():
        try:
            if btn.inner_text().strip() == str(count) and btn.is_visible():
                btn.click()
                print("✓")
                return
        except Exception:
            continue

    # <select>
    for sel in page.locator("select").all():
        try:
            if any(o.get_attribute("value") == str(count)
                   for o in sel.locator("option").all()):
                sel.select_option(str(count))
                print("✓ (select)")
                return
        except Exception:
            continue

    # Stepper +
    for plus_sel in ['button[aria-label*="増"]', 'button:has-text("+")',
                     'button[data-direction="up"]']:
        try:
            el = page.locator(plus_sel).first
            if el.is_visible():
                for _ in range(count - 1):
                    el.click()
                    page.wait_for_timeout(200)
                print("✓ (stepper)")
                return
        except Exception:
            continue

    print("⚠ not found")


def _set_seat_type(page, keyword: str):
    print(f"  Seat type…", end=" ")
    for kw in [keyword, "テーブル席", "table", "TABLE", "着席", "ダイニング"]:
        for locator in [
            page.get_by_text(kw, exact=True),
            page.locator(f'label:has-text("{kw}")'),
            page.locator(f'[value*="table"]'),
        ]:
            try:
                el = locator.first
                if el.is_visible():
                    el.click()
                    print(f"✓ ('{kw}')")
                    return
            except Exception:
                continue
    print("⚠ not found")


# ---------------------------------------------------------------------------
# Calendar navigation
# ---------------------------------------------------------------------------

def _navigate_to_month(page, year: int, month: int):
    for _ in range(24):
        cur_year, cur_month = _current_calendar_month(page)
        if cur_year == year and cur_month == month:
            return
        if (cur_year, cur_month) < (year, month):
            _click_month_arrow(page, "next")
        else:
            _click_month_arrow(page, "prev")
        page.wait_for_timeout(600)


def _current_calendar_month(page) -> tuple[int, int]:
    for sel in [
        "[class*='calendar'] [class*='month']",
        "[class*='Calendar'] [class*='month']",
        "[class*='calendar'] [class*='title']",
        "[class*='calendar'] [class*='header']",
        "[class*='datepicker'] [class*='month']",
        "h2", "h3",
    ]:
        try:
            txt = page.locator(sel).first.inner_text(timeout=1000)
            m = re.search(r'(\d{4})[年\-/\s](\d{1,2})', txt)
            if m:
                return int(m.group(1)), int(m.group(2))
            months_ja = ["1月","2月","3月","4月","5月","6月",
                         "7月","8月","9月","10月","11月","12月"]
            for i, mn in enumerate(months_ja, 1):
                if mn in txt:
                    yr = re.search(r'\d{4}', txt)
                    if yr:
                        return int(yr.group()), i
        except Exception:
            continue
    return datetime.now().year, datetime.now().month


def _click_month_arrow(page, direction: str):
    if direction == "next":
        candidates = [
            'button[aria-label*="次"]', 'button[aria-label*="next" i]',
            '[class*="next"]', 'button:has-text("›")', 'button:has-text(">")',
            'button:has-text("→")',
        ]
    else:
        candidates = [
            'button[aria-label*="前"]', 'button[aria-label*="prev" i]',
            '[class*="prev"]', 'button:has-text("‹")', 'button:has-text("<")',
            'button:has-text("←")',
        ]
    for sel in candidates:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.click()
                return
        except Exception:
            continue


def _find_date_cell(page, d: date):
    """Return the clickable element for a calendar date, or None."""
    ds = d.isoformat()

    # Try data-date attribute first
    for tmpl in DATE_CELL_SELECTORS:
        sel = tmpl.format(d=ds)
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible():
                return el
        except Exception:
            continue

    # Fall back: find a cell whose text is the day number within the current month
    day_str = str(d.day)
    for sel in ["td", "[class*='day']", "[class*='Day']", "[class*='date']", "[class*='Date']"]:
        try:
            for el in page.locator(sel).all():
                if el.inner_text(timeout=500).strip() == day_str and el.is_visible():
                    return el
        except Exception:
            continue

    return None


def _cell_is_available(el) -> bool:
    try:
        if not el.is_enabled():
            return False
        cls = (el.get_attribute("class") or "").lower()
        aria = (el.get_attribute("aria-disabled") or "").lower()
        return aria != "true" and not any(m in cls for m in DISABLED_MARKERS)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Time slot helpers
# ---------------------------------------------------------------------------

def _collect_time_slots(page) -> list[dict]:
    """Return list of {time, el, clickable} for every time-looking element on page."""
    slots: dict[str, dict] = {}

    for sel in TIME_SLOT_SELECTORS:
        try:
            for el in page.locator(sel).all():
                try:
                    txt = el.inner_text(timeout=300).strip()
                except Exception:
                    continue
                # Must look like a time (e.g. 11:30, 18:00)
                if not re.match(r'^\d{1,2}:\d{2}$', txt):
                    continue
                if txt in slots:
                    continue
                cls = (el.get_attribute("class") or "").lower()
                aria = (el.get_attribute("aria-disabled") or "").lower()
                clickable = (
                    el.is_visible()
                    and el.is_enabled()
                    and aria != "true"
                    and not any(m in cls for m in DISABLED_MARKERS)
                )
                slots[txt] = {"time": txt, "el": el, "clickable": clickable}
        except Exception:
            continue

    return sorted(slots.values(), key=lambda s: s["time"])


def _booking_form_appeared(page) -> bool:
    """Return True if the page now shows a booking / confirmation form."""
    for sig in ADVANCE_SIGNALS:
        try:
            if page.locator(sig).first.is_visible(timeout=1000):
                return True
        except Exception:
            continue

    # Also check for URL change to a step beyond the calendar
    url = page.url
    if any(kw in url for kw in ("confirm", "booking", "reservation", "step2", "form")):
        return True

    return False


def _back_to_slots(page, d: date):
    """Navigate back from booking form to the time slot list for date d."""
    # Try a back button specific to the site
    for sel in [
        'button[aria-label*="戻"]', 'button:has-text("戻る")',
        'a:has-text("戻る")', '[class*="back"]',
    ]:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.click()
                page.wait_for_timeout(1_000)
                # Check if time slots are visible again
                if _collect_time_slots(page):
                    return
        except Exception:
            continue

    # Fall back to browser history
    page.go_back(wait_until="domcontentloaded", timeout=10_000)
    page.wait_for_timeout(1_000)


def _back_to_calendar(page):
    """Navigate back to the calendar view."""
    for sel in [
        'button[aria-label*="戻"]', 'button:has-text("戻る")',
        'a:has-text("戻る")', '[class*="back"]',
    ]:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.click()
                page.wait_for_timeout(1_000)
                return
        except Exception:
            continue

    page.go_back(wait_until="domcontentloaded", timeout=10_000)
    page.wait_for_timeout(1_000)


# ---------------------------------------------------------------------------
# Debug helpers
# ---------------------------------------------------------------------------

def _dump_html(page, path: str):
    try:
        Path(path).write_text(page.content(), encoding="utf-8")
    except Exception:
        pass


def _debug_summary(page) -> str:
    """Extract DOM info useful for fixing selectors — no full HTML needed."""
    lines = []

    # Current URL
    lines.append(f"**URL:** `{page.url}`")
    lines.append("")

    # All button texts
    btn_texts = []
    for el in page.locator("button, [role='button']").all():
        try:
            t = el.inner_text(timeout=300).strip()
            if t:
                cls = (el.get_attribute("class") or "")[:60]
                btn_texts.append(f"`{t}` (class: `{cls}`)")
        except Exception:
            continue
    lines.append(f"**Buttons ({len(btn_texts)}):**")
    lines += btn_texts[:40] or ["(none)"]
    lines.append("")

    # Any element whose text looks like a time
    time_els = []
    for tag in ["button", "a", "li", "div", "span", "td", "p"]:
        for el in page.locator(tag).all():
            try:
                t = el.inner_text(timeout=200).strip()
                if re.match(r'^\d{1,2}:\d{2}$', t):
                    cls = (el.get_attribute("class") or "")[:80]
                    aria = el.get_attribute("aria-disabled") or ""
                    enabled = el.is_enabled()
                    time_els.append(
                        f"`<{tag}>` `{t}` — class: `{cls}` aria-disabled: `{aria}` enabled: `{enabled}`"
                    )
            except Exception:
                continue
    lines.append(f"**Time-like elements ({len(time_els)}):**")
    lines += time_els[:30] or ["(none found — time slots may not be on this page yet)"]
    lines.append("")

    # Unique class name fragments (helps identify component names)
    classes = set()
    for el in page.locator("[class]").all():
        try:
            for c in (el.get_attribute("class") or "").split():
                if len(c) > 3:
                    classes.add(c[:50])
        except Exception:
            continue
    interesting = sorted(c for c in classes
                         if any(kw in c.lower() for kw in
                                ("time", "slot", "hour", "schedule", "seat",
                                 "frame", "panel", "list", "item", "block",
                                 "reserve", "book", "avail", "step")))
    lines.append(f"**Relevant CSS classes:**")
    lines += [f"`{c}`" for c in interesting[:30]] or ["(none)"]

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _format_comment(checked: dict, start: date, end: date) -> str:
    total_avail = sum(len(v["available"]) for v in checked.values())
    lines = [f"## 🍕 {start} → {end} · {NUM_PEOPLE} adults, table service", ""]

    if not checked:
        lines.append("⚠️ No dates were checked.")
    else:
        summary = (f"✅ **{total_avail} slot(s) available**"
                   if total_avail else "❌ **No availability found**")
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
    print(f"\n{'='*56}")
    print(f"  RESULTS — {NUM_PEOPLE} adults, table service, Pizza Marumo")
    print(f"{'='*56}")
    if not checked:
        print("  No dates checked.")
        return
    for d in sorted(checked):
        dt = datetime.strptime(d, "%Y-%m-%d")
        v = checked[d]
        all_str = "  ".join(v["all"]) if v["all"] else "–"
        avail_str = "  ".join(v["available"]) if v["available"] else "–"
        print(f"  {dt.strftime('%Y-%m-%d (%a)')}")
        print(f"    checked  : {all_str}")
        print(f"    available: {avail_str}")
    total = sum(len(v["available"]) for v in checked.values())
    avail_days = sum(1 for v in checked.values() if v["available"])
    print(f"\n  {total} slot(s) across {avail_days}/{len(checked)} date(s)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = parse_args()
    run(
        start=date.fromisoformat(args.start),
        end=date.fromisoformat(args.end),
        headless=not args.visible,
        output_path=args.output,
        comment_file=args.comment_file,
        debug=args.debug_screenshots,
    )
