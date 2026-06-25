#!/usr/bin/env python3
"""
TableCheck reservation availability checker for Pizza Marumo.

Correct UI flow (confirmed by user):
  1. Tick notice checkbox
  2. Set date (Mobiscroll picker)
  3. Set adults = 4
  4. Click テーブル seat type → turns blue
  5. Click ディナー plan card → turns green (labeled "dinner")
  6. For each time slot from 17:00:
       - Select/click the time → bottom popup appears
       - Read popup: indicates available or unavailable
       - Dismiss popup, try next time

Usage:
    pip install playwright && playwright install chromium
    python3 check_reservations.py --start 2026-07-07 --end 2026-07-10
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

NUM_PEOPLE  = 4
MIN_HOUR    = 17      # dinner only — skip lunch times
SHOP_SLUG   = "pizza-marumo"
RESERVE_URL = f"https://www.tablecheck.com/ja/shops/{SHOP_SLUG}/reserve"

# Known form field selectors
_NOTICE_CB   = 'input[name="reservation_confirm_shop_note"]'
_DATE_INPUT  = 'input[name="reservation[start_date]"]'
_TIME_SELECT = 'select[name="reservation[start_at_epoch]"]'
_ADULTS_SEL  = 'select[name="reservation[num_people_adult]"]'

# Text that confirms a slot is UNAVAILABLE (error popup / flash message)
UNAVAIL_TEXT = [
    "Reservations are not available in the category",
    "Please select a different category",
    "ご選択のカテゴリー",
    "満席",
    "ご希望の時間帯",
    "予約ができません",
    "ご利用いただけません",
    "受付不可",
]

# Text that confirms the popup is a BOOKING CONFIRMATION (slot available)
AVAIL_TEXT = [
    "予約する",       # "Make reservation"
    "予約を確定",     # "Confirm reservation"
    "ご予約を確認",   # "Confirm your reservation"
    "次のステップ",   # "Next step"
    "進む",           # "Proceed"
]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Check Pizza Marumo reservations")
    p.add_argument("--start",  required=True, metavar="YYYY-MM-DD")
    p.add_argument("--end",    required=True, metavar="YYYY-MM-DD")
    p.add_argument("--visible", action="store_true")
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
    print(f"  Guests   : {NUM_PEOPLE} adults, table/dinner")
    print(f"  Range    : {start} → {end}  ({days} day(s))")
    print(f"  Times    : {MIN_HOUR}:00 onwards only\n")

    if debug:
        Path("debug").mkdir(exist_ok=True)

    checked: dict[str, dict] = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        ctx = browser.new_context(
            locale="ja-JP",
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = ctx.new_page()

        current = start
        while current <= end:
            ds = current.isoformat()
            print(f"\n{ds}")

            page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_timeout(3_000)

            if debug:
                page.screenshot(path=f"debug/{ds}_01_loaded.png")

            # Step 1: tick notice checkbox
            _accept_notice(page)
            page.wait_for_timeout(500)

            # Step 2: set date
            if not _set_date(page, current):
                print("  ✗ could not set date")
                _write_debug_summary(page, ds, "_set_date() failed")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            page.wait_for_timeout(1_000)

            # Step 3: set adults
            _set_adults(page)
            page.wait_for_timeout(500)

            if debug:
                page.screenshot(path=f"debug/{ds}_02_date_adults.png")

            # Step 4: click テーブル seat type (turns blue)
            if not _select_table_seat(page):
                _write_debug_summary(page, ds, "テーブル seat type not found")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            page.wait_for_timeout(1_500)

            if debug:
                page.screenshot(path=f"debug/{ds}_03_table.png")

            # Step 5: click ディナー plan (turns green)
            if not _select_dinner_plan(page):
                _write_debug_summary(page, ds, "ディナー plan not found")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            page.wait_for_timeout(1_500)

            if debug:
                page.screenshot(path=f"debug/{ds}_04_dinner.png")

            # Step 6: collect time options (≥ MIN_HOUR)
            time_opts = _get_time_options(page)
            print(f"  {len(time_opts)} time option(s): {[t for _, t in time_opts]}")

            if not time_opts:
                _write_debug_summary(page, ds, "no time options after seat+plan selection")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            all_times:   list[str] = []
            avail_times: list[str] = []

            for epoch_val, time_label in time_opts:
                print(f"  trying {time_label}")

                # Select the time — this should trigger the bottom popup
                try:
                    page.locator(_TIME_SELECT).select_option(value=epoch_val, timeout=5_000)
                except Exception as e:
                    print(f"  ⚠ could not select time: {e}")
                    # Fallback: try clicking a time button with this label
                    if not _click_time_button(page, time_label):
                        continue

                # Wait for the popup to appear
                page.wait_for_timeout(2_000)

                if debug:
                    page.screenshot(path=f"debug/{ds}_{time_label.replace(':', '')}.png")

                result = _check_popup(page)
                all_times.append(time_label)

                if result == "available":
                    avail_times.append(time_label)
                    print(f"  {time_label}: ✓ available")
                elif result == "unavailable":
                    print(f"  {time_label}: ✗ not available")
                else:
                    print(f"  {time_label}: ? unknown")

                # Dismiss popup before trying next time
                _dismiss_popup(page)
                page.wait_for_timeout(500)

            checked[ds] = {
                "all":       sorted(set(all_times)),
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
            "checked_at":  datetime.now().isoformat(),
            "shop":        SHOP_SLUG,
            "num_people":  NUM_PEOPLE,
            "seat_type":   "table",
            "plan":        "dinner",
            "range_start": str(start),
            "range_end":   str(end),
            "checked":     checked,
            "slots":       slots_flat,
        }, f, ensure_ascii=False, indent=2)
    print(f"\nSaved → {output_path}")

    if comment_file:
        with open(comment_file, "w", encoding="utf-8") as f:
            f.write(_format_comment(checked, start, end))
        print(f"Comment → {comment_file}")


# ---------------------------------------------------------------------------
# Form helpers
# ---------------------------------------------------------------------------

def _accept_notice(page):
    """Tick the store-notice agreement checkbox."""
    try:
        cb = page.locator(_NOTICE_CB).first
        if cb.is_visible(timeout=2_000) and not cb.is_checked():
            cb.click()
            page.wait_for_timeout(300)
            print("  ✓ notice checkbox ticked")
        elif cb.is_checked():
            print("  ✓ notice checkbox already ticked")
    except Exception as e:
        print(f"  ⚠ _accept_notice: {e}")


def _set_date(page, d: date) -> bool:
    """Set the Mobiscroll date picker. Returns True when time options load."""
    ds_slash = f"{d.year}/{d.month:02d}/{d.day:02d}"

    method = page.evaluate(f"""() => {{
        const el = document.querySelector('{_DATE_INPUT}');
        if (!el) return 'not-found';
        const dt = new Date({d.year}, {d.month - 1}, {d.day});
        if (window.$ && $.fn && $.fn.mobiscroll) {{
            try {{
                $(el).mobiscroll('setVal', dt, true);
                return 'mbsc-jquery';
            }} catch(e) {{ }}
        }}
        el.value = '{ds_slash}';
        if (window.$) {{
            $(el).trigger('change');
            return 'jquery-trigger';
        }}
        el.dispatchEvent(new Event('change', {{bubbles: true}}));
        el.dispatchEvent(new Event('input',  {{bubbles: true}}));
        return 'manual-event';
    }}""")
    print(f"  _set_date method={method}")
    page.wait_for_timeout(2_000)

    if _time_options_loaded(page):
        return True

    return _set_date_via_calendar(page, d)


def _set_date_via_calendar(page, d: date) -> bool:
    """Open Mobiscroll calendar, navigate to month, click day."""
    try:
        page.locator(_DATE_INPUT).click(timeout=3_000)
        page.wait_for_timeout(1_200)

        today = date.today()
        months = (d.year - today.year) * 12 + (d.month - today.month)
        for _ in range(months):
            for sel in ['.mbsc-cal-next', '.mbsc-fr-arr-r', '.mbsc-calendar-next',
                        'button[aria-label*="next"]', 'button[aria-label*="次"]']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=400):
                        btn.click()
                        page.wait_for_timeout(400)
                        break
                except Exception:
                    continue

        day_str = str(d.day)
        for sel in [f'[data-val*="{d.isoformat()}"]', f'[data-date="{d.isoformat()}"]',
                    '.mbsc-cal-day-i', '.mbsc-calendar-day-text']:
            try:
                if 'data-' in sel:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=400):
                        el.click()
                        page.wait_for_timeout(500)
                        break
                else:
                    for el in page.locator(sel).all():
                        if el.inner_text(timeout=100).strip() == day_str and el.is_visible():
                            el.click()
                            page.wait_for_timeout(500)
                            break
            except Exception:
                continue

        for kw in ['Set', 'OK', '決定', '閉じる']:
            try:
                btn = page.get_by_text(kw, exact=True).first
                if btn.is_visible(timeout=400):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                continue

        page.wait_for_timeout(1_500)
        return _time_options_loaded(page)

    except Exception as e:
        print(f"  _set_date_via_calendar error: {e}")
        return False


def _time_options_loaded(page) -> bool:
    """True when the time <select> has real options populated by AJAX."""
    try:
        opts = page.locator(_TIME_SELECT + " option").all()
        real = [o for o in opts
                if '--' not in (o.get_attribute('value') or '')
                and (o.get_attribute('value') or '').strip()]
        return bool(real)
    except Exception:
        return False


def _set_adults(page):
    """Set adults selector to NUM_PEOPLE."""
    try:
        page.locator(_ADULTS_SEL).select_option(str(NUM_PEOPLE), timeout=5_000)
        print(f"  ✓ adults set to {NUM_PEOPLE}")
    except Exception as e:
        print(f"  ⚠ _set_adults: {e}")


def _select_table_seat(page) -> bool:
    """
    Click the テーブル (table) seat type button — should highlight blue.
    Tries multiple strategies since TableCheck renders this as custom UI.
    """
    strategies = [
        # Exact text match on various element types
        lambda: page.get_by_text("テーブル席", exact=True).first.click(),
        lambda: page.get_by_text("テーブル", exact=True).first.click(),
        # Radio/button with value containing "table"
        lambda: page.locator('input[type="radio"][value*="table"]').first.evaluate("el => el.click()"),
        lambda: page.locator('input[type="radio"]').nth(0).evaluate("el => el.click()"),
        # Labeled elements
        lambda: page.locator('label:has-text("テーブル")').first.click(),
        lambda: page.locator('[class*="seat"]:has-text("テーブル")').first.click(),
        lambda: page.locator('[class*="type"]:has-text("テーブル")').first.click(),
    ]
    for i, fn in enumerate(strategies):
        try:
            fn()
            page.wait_for_timeout(500)
            print(f"  ✓ テーブル selected (strategy {i})")
            return True
        except Exception:
            continue
    print("  ⚠ テーブル seat type not found — dumping clickable elements:")
    _dump_clickables(page)
    return False


def _select_dinner_plan(page) -> bool:
    """
    Click the ディナー (dinner) plan card — should highlight green.
    This appears after selecting テーブル seat type.
    """
    for keyword in ["ディナー", "Dinner", "テーブル席ディナー", "夜"]:
        strategies = [
            lambda kw=keyword: page.get_by_text(kw, exact=True).first.click(),
            lambda kw=keyword: page.get_by_text(kw, exact=False).first.click(),
            lambda kw=keyword: page.locator(f'label:has-text("{kw}")').first.click(),
            lambda kw=keyword: page.locator(f'[class*="plan"]:has-text("{kw}")').first.click(),
            lambda kw=keyword: page.locator(f'[class*="course"]:has-text("{kw}")').first.click(),
            lambda kw=keyword: page.locator(f'li:has-text("{kw}")').first.click(),
        ]
        for i, fn in enumerate(strategies):
            try:
                fn()
                page.wait_for_timeout(500)
                print(f"  ✓ dinner plan selected: {keyword!r} (strategy {i})")
                return True
            except Exception:
                continue

    print("  ⚠ ディナー plan not found — dumping clickable elements:")
    _dump_clickables(page)
    return False


def _get_time_options(page) -> list[tuple[str, str]]:
    """
    Return [(epoch_value, display_text)] for time options ≥ MIN_HOUR.
    Reads from the hidden time <select> which AJAX populates after date+plan selection.
    """
    opts = []
    try:
        for opt in page.locator(_TIME_SELECT + " option").all():
            v = (opt.get_attribute('value') or '').strip()
            t = opt.inner_text().strip()
            if not v or '--' in t:
                continue
            m = re.match(r'(\d{1,2}):', t)
            if m and int(m.group(1)) >= MIN_HOUR:
                opts.append((v, t))
    except Exception:
        pass
    return opts


def _click_time_button(page, time_label: str) -> bool:
    """Fallback: find and click a visible time button with this label."""
    for selector in [
        f'button:has-text("{time_label}")',
        f'[role="button"]:has-text("{time_label}")',
        f'[class*="time"]:has-text("{time_label}")',
        f'[class*="slot"]:has-text("{time_label}")',
        f'li:has-text("{time_label}")',
    ]:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=800):
                el.click()
                print(f"  ✓ clicked time button {time_label!r}")
                return True
        except Exception:
            continue
    return False


def _check_popup(page) -> str:
    """
    After selecting a time, check the bottom popup for availability.
    Returns 'available', 'unavailable', or 'unknown'.
    """
    # Try to find a popup/sheet/modal
    popup_text = ""
    popup_found = False
    for sel in [
        '[role="dialog"]', '[role="alertdialog"]',
        '[class*="modal"]', '[class*="popup"]',
        '[class*="sheet"]', '[class*="bottom"]',
        '[class*="reservation-action"]', '[class*="booking"]',
        '[class*="reserve"]',
    ]:
        try:
            popup = page.locator(sel).first
            if popup.is_visible(timeout=1_000):
                popup_text = popup.inner_text(timeout=1_000)
                print(f"  popup({sel}): {popup_text[:300]!r}")
                popup_found = True
                break
        except Exception:
            continue

    if not popup_found:
        # No distinct popup element found — check full body for error/confirmation text
        try:
            popup_text = page.inner_text("body", timeout=3_000)
        except Exception:
            popup_text = ""
        print(f"  no popup — body[0:300]={popup_text[:300]!r}")

    # Check for unavailability
    for txt in UNAVAIL_TEXT:
        if txt in popup_text:
            print(f"    → unavailable ({txt!r})")
            return "unavailable"

    # Check for booking confirmation (available)
    for txt in AVAIL_TEXT:
        if txt in popup_text:
            print(f"    → available ({txt!r})")
            return "available"

    # If a popup element appeared but neither text matched — log and mark unknown
    if popup_found:
        print("    → popup appeared but no definitive text — unknown")

    return "unknown"


def _dismiss_popup(page):
    """Close any open popup/modal before trying the next time slot."""
    for sel in [
        'button[aria-label*="close"]', 'button[aria-label*="閉じ"]',
        '[class*="close"]', 'button:has-text("閉じる")',
        'button:has-text("×")', 'button:has-text("✕")', 'button:has-text("戻る")',
    ]:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=400):
                btn.click()
                page.wait_for_timeout(400)
                return
        except Exception:
            continue
    # Fallback: Escape key
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Debug helpers
# ---------------------------------------------------------------------------

def _dump_clickables(page):
    """Print all visible clickable elements — used when seat/plan selection fails."""
    try:
        els = page.evaluate("""() => {
            const out = [];
            for (const el of document.querySelectorAll(
                    'button, [role="button"], label, input[type="radio"], input[type="checkbox"], a, li, [class*="plan"], [class*="seat"], [class*="type"]')) {
                const text = (el.innerText || el.textContent || '').trim().slice(0, 80);
                const val  = el.value || '';
                const cls  = (typeof el.className === 'string' ? el.className : '').slice(0, 80);
                const vis  = el.offsetParent !== null;
                if ((text || val) && vis) out.push({tag: el.tagName, text, val, cls});
            }
            return out.slice(0, 40);
        }""")
        for e in els:
            print(f"    <{e['tag']}> text={e['text']!r} val={e['val']!r} cls={e['cls']!r}")
    except Exception as ex:
        print(f"    _dump_clickables error: {ex}")


def _write_debug_summary(page, ds: str, note: str = ""):
    Path("debug").mkdir(exist_ok=True)
    lines = [f"**URL:** `{page.url}`", f"**Note:** {note}", ""]

    lines.append("### Visible clickable elements")
    try:
        els = page.evaluate("""() => {
            const out = [];
            for (const el of document.querySelectorAll(
                    'button, [role="button"], label, input[type="radio"], input[type="checkbox"], select, a')) {
                const text = (el.innerText || el.textContent || '').trim().slice(0, 100);
                const val  = el.value || '';
                const cls  = (typeof el.className === 'string' ? el.className : '').slice(0, 100);
                const name = el.name || '';
                const vis  = el.offsetParent !== null;
                if (vis) out.push({tag: el.tagName, text, val, cls, name});
            }
            return out.slice(0, 60);
        }""")
        for e in els:
            lines.append(f"- `<{e['tag']}>` name=`{e['name']}` val=`{e['val']}` text=`{e['text']}` cls=`{e['cls']}`")
    except Exception as ex:
        lines.append(f"_(error: {ex})_")

    lines.append("")
    lines.append("### Page body text (first 2000 chars)")
    try:
        body = page.inner_text("body", timeout=3_000)
        lines.append(f"```\n{body[:2000]}\n```")
    except Exception as ex:
        lines.append(f"_(error: {ex})_")

    content = "\n".join(lines)
    Path(f"debug/{ds}_summary.md").write_text(content, encoding="utf-8")
    print(f"\n--- DEBUG {ds} ({note}) ---")
    print(content[:2000])
    print("--- END DEBUG ---\n")


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _format_comment(checked: dict, start: date, end: date) -> str:
    total_avail = sum(len(v["available"]) for v in checked.values())
    lines = [f"## 🍕 {start} → {end} · {NUM_PEOPLE} adults · table dinner ({MIN_HOUR}:00+)", ""]

    if not checked:
        lines.append("⚠️ No dates were checked.")
    else:
        summary = (f"✅ **{total_avail} slot(s) available**"
                   if total_avail else "❌ **No availability found**")
        lines.append(f"{summary} — {len(checked)} date(s) checked")
        lines += ["", "| Date | Checked | Available |", "|------|---------|-----------|"]
        for d in sorted(checked):
            dt = datetime.strptime(d, "%Y-%m-%d")
            label     = dt.strftime("%a %-d %b")
            v         = checked[d]
            all_str   = " · ".join(v["all"])       if v["all"]       else "—"
            avail_str = " · ".join(v["available"]) if v["available"] else "—"
            lines.append(f"| **{label}** | {all_str} | {avail_str} |")

    lines += ["", f"*Checked {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*"]
    return "\n".join(lines)


def _print_results(checked: dict):
    print(f"\n{'='*56}")
    print(f"  RESULTS — {NUM_PEOPLE} adults, table dinner, Pizza Marumo")
    print(f"{'='*56}")
    if not checked:
        print("  No dates checked.")
        return
    for d in sorted(checked):
        v  = checked[d]
        dt = datetime.strptime(d, "%Y-%m-%d")
        all_str   = "  ".join(v["all"])       if v["all"]       else "–"
        avail_str = "  ".join(v["available"]) if v["available"] else "–"
        print(f"  {dt.strftime('%Y-%m-%d (%a)')}")
        print(f"    checked  : {all_str}")
        print(f"    available: {avail_str}")
    total      = sum(len(v["available"]) for v in checked.values())
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
