#!/usr/bin/env python3
"""
TableCheck reservation availability checker for Pizza Marumo.
Checks all time slots for 4 adults, table service.

Form flow (as seen on the actual page)
---------------------------------------
1. A "Notice from the Store" checkbox must be ticked first.
2. The form has: date stepper, time stepper, adults select, category buttons.
3. Click the green Select button.
4. If the page advances → available; orange error → not available.

For each date we try every 30-minute slot 11:00–21:00.

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

# All 30-minute slots to try (restaurant open lunch + dinner)
ALL_TIMES = [
    f"{h:02d}:{m:02d}"
    for h in range(11, 22)
    for m in (0, 30)
]

# Error text shown when a slot is unavailable
UNAVAIL_TEXT = [
    "Reservations are not available in the category",
    "ご選択のカテゴリー",
    "満席",
    "Please select a different category",
    "not available",
]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Check Pizza Marumo reservations")
    p.add_argument("--start", required=True, metavar="YYYY-MM-DD")
    p.add_argument("--end",   required=True, metavar="YYYY-MM-DD")
    p.add_argument("--visible", action="store_true", help="Show browser window")
    p.add_argument("--output", default="reservations.json")
    p.add_argument("--comment-file", default=None, metavar="PATH")
    p.add_argument("--debug-screenshots", action="store_true")
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
    print(f"  Range    : {start} → {end}  ({days} day(s))\n")

    if debug:
        Path("debug").mkdir(exist_ok=True)

    checked: dict[str, dict] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(
            locale="ja-JP",
            viewport={"width": 390, "height": 844},   # iPhone-sized so mobile layout loads
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = ctx.new_page()

        print(f"→ {RESERVE_URL}")
        page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(3_000)

        if debug:
            page.screenshot(path="debug/01_loaded.png")

        # ------------------------------------------------------------------
        # Walk each date
        # ------------------------------------------------------------------
        current = start
        while current <= end:
            ds = current.isoformat()
            print(f"\n{ds}")

            # Fresh page load for each date
            page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_timeout(3_000)

            # 1. Tick the "Notice from the Store" agreement checkbox
            _accept_notice(page)
            page.wait_for_timeout(500)

            # 2. Set date
            if not _set_date(page, current):
                print("  ⚠ could not set date — dumping debug info")
                _write_debug_summary(page, ds)
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            page.wait_for_timeout(800)

            # 3. Set adults = 4
            _set_adults(page, NUM_PEOPLE)
            page.wait_for_timeout(500)

            # 4. Select "table" category
            _select_category(page, "table")
            page.wait_for_timeout(500)

            if debug:
                page.screenshot(path=f"debug/{ds}_form_ready.png")

            # Dump debug info for the first date so we can verify form state
            if current == start:
                _write_debug_summary(page, ds)

            all_times: list[str] = []
            avail_times: list[str] = []

            for t in ALL_TIMES:
                # Set the time field
                if not _set_time(page, t):
                    continue        # time field not found — skip silently

                page.wait_for_timeout(300)
                _select_category(page, "table")   # re-assert in case reset
                page.wait_for_timeout(200)

                _click_select(page)
                page.wait_for_timeout(2_000)

                if debug:
                    page.screenshot(path=f"debug/{ds}_{t.replace(':', '')}.png")

                result = _check_result(page)

                if result == "available":
                    all_times.append(t)
                    avail_times.append(t)
                    print(f"  {t}: ✓ available")
                    page.go_back(wait_until="domcontentloaded", timeout=10_000)
                    page.wait_for_timeout(1_500)
                    _select_category(page, "table")
                elif result == "unavailable":
                    all_times.append(t)
                    print(f"  {t}: ✗ not available")
                    # Still on form — try next time
                else:
                    # "unknown" — time probably doesn't exist on the form, skip
                    pass

            checked[ds] = {
                "all": sorted(set(all_times)),
                "available": sorted(set(avail_times)),
            }
            current += timedelta(days=1)

        browser.close()

    # -----------------------------------------------------------------------
    # Output
    # -----------------------------------------------------------------------
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
# Form helpers
# ---------------------------------------------------------------------------

def _set_date(page, d: date) -> bool:
    """Set the date field to d. Returns True if successful."""
    ds = d.isoformat()

    # Try native date input
    for sel in ['input[type="date"]', 'input[name*="date"]', 'input[name*="Date"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.fill(ds)
                page.wait_for_timeout(300)
                return True
        except Exception:
            continue

    # Try clicking a displayed date value and changing it
    for sel in [f'[value="{ds}"]', f'text="{ds}"', '[data-field="date"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.click()
                page.wait_for_timeout(500)
                # If a date picker opened, we're done for now — the page might
                # default to the right date; treat as success if date appears
                return True
        except Exception:
            continue

    # Try <select> for date parts
    try:
        page.locator(f'select[name*="year"] option[value="{d.year}"]').first.click()
        page.locator(f'select[name*="month"] option[value="{d.month}"]').first.click()
        page.locator(f'select[name*="day"] option[value="{d.day}"]').first.click()
        return True
    except Exception:
        pass

    # Last resort: look for a visible field showing a date and use fill
    try:
        for el in page.locator("input").all():
            val = el.input_value()
            if re.match(r'\d{4}-\d{2}-\d{2}', val or ""):
                el.fill(ds)
                return True
    except Exception:
        pass

    return False


def _set_adults(page, count: int):
    """Set the adults/people count field."""
    # Try select
    for sel in ['select[name*="adult"]', 'select[name*="people"]',
                'select[name*="num"]', 'select[name*="guest"]',
                'select[name*="person"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.select_option(str(count))
                return
        except Exception:
            continue

    # Try stepper: find a field near a person icon that contains a number
    for sel in ['input[name*="adult"]', 'input[name*="num"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.fill(str(count))
                return
        except Exception:
            continue

    # Try visible select that currently shows a number
    for sel_el in page.locator("select").all():
        try:
            opts = [o.get_attribute("value") for o in sel_el.locator("option").all()]
            if str(count) in opts and sel_el.is_visible():
                sel_el.select_option(str(count))
                return
        except Exception:
            continue


def _select_category(page, category: str):
    """Click the table/counter/private room category button."""
    keywords = {
        "table": ["table", "テーブル"],
        "counter": ["counter", "カウンター"],
        "private": ["private", "個室"],
    }.get(category, [category])

    for kw in keywords:
        for locator in [
            page.get_by_text(kw, exact=True),
            page.get_by_text(kw, exact=False),
            page.locator(f'button:has-text("{kw}")'),
            page.locator(f'[value="{kw}"]'),
        ]:
            try:
                el = locator.first
                if el.is_visible():
                    el.click()
                    return
            except Exception:
                continue


def _accept_notice(page):
    """Tick the 'Notice from the Store' agreement checkbox."""
    for sel in [
        'input[type="checkbox"]',
        '[role="checkbox"]',
        'label:has-text("agree")',
        'label:has-text("同意")',
        'label:has-text("注意")',
    ]:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                try:
                    if el.is_checked():
                        return   # already ticked
                except Exception:
                    pass
                el.click()
                page.wait_for_timeout(300)
                return
        except Exception:
            continue


def _set_time(page, t: str) -> bool:
    """Fill the time stepper with value t (e.g. '17:00'). Returns True if found."""
    for sel in [
        'input[type="time"]',
        'input[name*="time"]',
        'input[name*="hour"]',
        'input[name*="start"]',
    ]:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.fill(t)
                el.dispatch_event("change")
                el.dispatch_event("input")
                return True
        except Exception:
            continue

    # Fallback: try any <select> that has this time as an option
    for sel in ['select[name*="time"]', 'select[name*="hour"]', 'select[name*="start"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible():
                el.select_option(value=t)
                return True
        except Exception:
            continue

    return False


def _click_select(page):
    """Click the green Select / 選択 button."""
    for kw in ["Select", "選択", "予約する", "次へ", "Next", "検索", "Search"]:
        try:
            el = page.get_by_text(kw, exact=True).first
            if el.is_visible():
                el.click()
                return
        except Exception:
            continue
    # Fallback: any submit/button
    try:
        page.locator('button[type="submit"]').first.click()
    except Exception:
        pass


def _check_result(page) -> str:
    """Return 'available', 'unavailable', or 'unknown'."""
    # Unavailability: orange error message still visible on the same form
    for txt in UNAVAIL_TEXT:
        try:
            if page.get_by_text(txt, exact=False).first.is_visible(timeout=500):
                return "unavailable"
        except Exception:
            continue

    # Available: page advanced to the customer-info / booking-confirm step
    for sig in [
        'input[name*="name"]', 'input[name*="email"]', 'input[name*="phone"]',
        'text=予約情報', 'text=お客様情報',
        'button:has-text("確認")', 'button:has-text("Confirm")',
    ]:
        try:
            if page.locator(sig).first.is_visible(timeout=500):
                return "available"
        except Exception:
            continue

    if any(kw in page.url for kw in ("confirm", "booking", "step2", "complete")):
        return "available"

    return "unknown"


# ---------------------------------------------------------------------------
# Debug helpers
# ---------------------------------------------------------------------------

def _write_debug_summary(page, ds: str):
    """Write a comprehensive markdown summary of all interactive elements on the page."""
    Path("debug").mkdir(exist_ok=True)
    lines = [f"**URL:** `{page.url}`", ""]

    # Run JS to collect every element with text or a value
    elements = page.evaluate("""() => {
        const results = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
            const text = (el.innerText || el.textContent || '').trim().slice(0, 80);
            const val  = el.value !== undefined ? String(el.value) : '';
            if (!text && !val) continue;
            results.push({
                tag:      el.tagName.toLowerCase(),
                id:       el.id || '',
                cls:      (el.className && typeof el.className === 'string')
                              ? el.className.slice(0, 80) : '',
                role:     el.getAttribute('role') || '',
                type:     el.getAttribute('type') || '',
                name:     el.getAttribute('name') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                ariaDisabled: el.getAttribute('aria-disabled') || '',
                dataDate: el.getAttribute('data-date') || '',
                text:     text,
                val:      val.slice(0, 40),
            });
        }
        return results;
    }""")

    # Section 1: anything whose text or value looks like a time
    time_els = [e for e in elements
                if re.search(r'\b\d{1,2}:\d{2}\b', e['text'] + ' ' + e['val'])]
    lines.append(f"### Elements containing a time value ({len(time_els)})")
    for e in time_els:
        lines.append(
            f"- `<{e['tag']}>` id=`{e['id']}` name=`{e['name']}` "
            f"type=`{e['type']}` role=`{e['role']}` "
            f"aria-label=`{e['ariaLabel']}` aria-disabled=`{e['ariaDisabled']}`  "
            f"class=`{e['cls']}`  text=`{e['text']}`  val=`{e['val']}`"
        )
    if not time_els:
        lines.append("_(none)_")
    lines.append("")

    # Section 2: all <select> elements and their options
    lines.append("### Select elements")
    for sel_el in page.locator("select").all():
        try:
            name = sel_el.get_attribute("name") or sel_el.get_attribute("id") or "?"
            opts = [(o.get_attribute("value") or "", o.inner_text().strip())
                    for o in sel_el.locator("option").all()]
            lines.append(f"- `{name}`: {opts[:30]}")
        except Exception:
            continue
    lines.append("")

    # Section 3: all input elements
    lines.append("### Input elements")
    for el in page.locator("input").all():
        try:
            name = el.get_attribute("name") or el.get_attribute("id") or "?"
            typ  = el.get_attribute("type") or "text"
            val  = el.input_value() or ""
            aria = el.get_attribute("aria-label") or ""
            lines.append(f"- `{name}` type=`{typ}` value=`{val}` aria-label=`{aria}`")
        except Exception:
            continue
    lines.append("")

    # Section 4: elements with role=listbox/combobox/option/spinbutton
    roles = ["listbox", "combobox", "option", "spinbutton", "slider", "menu", "menuitem"]
    role_els = [e for e in elements if e['role'] in roles]
    lines.append(f"### ARIA role elements ({len(role_els)})")
    for e in role_els:
        lines.append(
            f"- role=`{e['role']}` `<{e['tag']}>` id=`{e['id']}` "
            f"class=`{e['cls']}`  text=`{e['text']}`"
        )
    if not role_els:
        lines.append("_(none)_")
    lines.append("")

    # Section 5: all buttons
    lines.append("### Buttons")
    for el in page.locator("button, [role='button']").all():
        try:
            t   = el.inner_text(timeout=200).strip()
            cls = (el.get_attribute("class") or "")[:80]
            aria = el.get_attribute("aria-label") or ""
            if t or aria:
                lines.append(f"- text=`{t}` aria-label=`{aria}` class=`{cls}`")
        except Exception:
            continue

    Path(f"debug/{ds}_summary.md").write_text("\n".join(lines), encoding="utf-8")


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
            all_str  = " · ".join(v["all"])       if v["all"]       else "—"
            avail_str = " · ".join(v["available"]) if v["available"] else "—"
            lines.append(f"| **{label}** | {all_str} | {avail_str} |")

    lines += ["", f"*Checked {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*"]
    return "\n".join(lines)


def _print_results(checked: dict):
    print(f"\n{'='*56}")
    print(f"  RESULTS — {NUM_PEOPLE} adults, table, Pizza Marumo")
    print(f"{'='*56}")
    if not checked:
        print("  No dates checked.")
        return
    for d in sorted(checked):
        v = checked[d]
        dt = datetime.strptime(d, "%Y-%m-%d")
        all_str   = "  ".join(v["all"])       if v["all"]       else "–"
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
