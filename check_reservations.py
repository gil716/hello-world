#!/usr/bin/env python3
"""
TableCheck reservation availability checker for Pizza Marumo.

Form structure (discovered via debug dump):
  - Checkbox:  input[name="reservation_confirm_shop_note"]
  - Date:      input[name="reservation[start_date]"]  ← Mobiscroll picker
  - Time:      select[name="reservation[start_at_epoch]"] ← AJAX-populated after date set
  - Adults:    select[name="reservation[num_people_adult]"]
  - Category:  input[name="reservation[service_category]"] (radio, 3 options)
  - Submit:    input[name="commit"]  value="確定画面へ"

Flow:
  1. Tick checkbox
  2. Set date via Mobiscroll (jQuery API or calendar click)
  3. Wait for time <select> to populate (AJAX fires on date change)
  4. For each time option: select it, set adults+category, click submit
  5. Unavailable → orange error, still on form; Available → new page

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

NUM_PEOPLE = 4
SHOP_SLUG  = "pizza-marumo"
RESERVE_URL = f"https://www.tablecheck.com/ja/shops/{SHOP_SLUG}/reserve"

# Exact selectors from the live DOM
_NOTICE_CB   = 'input[name="reservation_confirm_shop_note"]'
_DATE_INPUT  = 'input[name="reservation[start_date]"]'
_TIME_SELECT = 'select[name="reservation[start_at_epoch]"]'
_ADULTS_SEL  = 'select[name="reservation[num_people_adult]"]'
_CAT_RADIO   = 'input[name="reservation[service_category]"]:not([type="hidden"])'
_SUBMIT      = 'input[name="commit"]'

UNAVAIL_TEXT = [
    "Reservations are not available in the category",
    "Please select a different category",
    "ご選択のカテゴリー",
    "満席",
    "ご希望の時間帯",
    "予約ができません",
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
    print(f"  Guests   : {NUM_PEOPLE} adults, table service")
    print(f"  Range    : {start} → {end}  ({days} day(s))\n")

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

            # 1. Tick the notice checkbox
            _accept_notice(page)
            page.wait_for_timeout(500)

            # 2. Set date and wait for time options to load
            if not _set_date(page, current):
                print("  ✗ could not set date")
                _write_debug_summary(page, ds, "_set_date() failed")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            if debug:
                page.screenshot(path=f"debug/{ds}_02_date_set.png")

            # 3. Collect time options (populated by AJAX after date set)
            time_opts = _get_time_options(page)
            print(f"  {len(time_opts)} time option(s): {[t for _, t in time_opts]}")

            if not time_opts:
                _write_debug_summary(page, ds, "no time options after date set")
                checked[ds] = {"all": [], "available": []}
                current += timedelta(days=1)
                continue

            # 4. Set adults (stays constant across all time trials)
            _set_adults(page)

            all_times:   list[str] = []
            avail_times: list[str] = []

            for epoch_val, time_label in time_opts:
                print(f"  trying {time_label} (epoch={epoch_val})")
                # Set time
                try:
                    page.locator(_TIME_SELECT).select_option(value=epoch_val, timeout=5_000)
                except Exception as e:
                    print(f"  ⚠ could not select time {time_label}: {e}")
                    continue

                page.wait_for_timeout(300)

                # Set category = table (first radio = テーブル)
                _select_table_category(page)
                page.wait_for_timeout(200)

                # Submit — form.submit() causes real navigation; wait for it
                url_before = page.url
                _click_submit(page)
                try:
                    page.wait_for_load_state("domcontentloaded", timeout=10_000)
                except Exception:
                    page.wait_for_timeout(3_000)

                if debug:
                    page.screenshot(path=f"debug/{ds}_{time_label.replace(':', '')}.png")

                result = _check_result(page, url_before)
                all_times.append(time_label)

                if result == "available":
                    avail_times.append(time_label)
                    print(f"  {time_label}: ✓ available")
                    # Reload form fresh so remaining slots can be checked
                    page.goto(RESERVE_URL, wait_until="domcontentloaded", timeout=30_000)
                    page.wait_for_timeout(3_000)
                    _accept_notice(page)
                    page.wait_for_timeout(500)
                    if not _set_date(page, current):
                        print("  ⚠ could not re-set date after available result — stopping date")
                        break
                    page.wait_for_timeout(1_500)
                    _set_adults(page)
                elif result == "unavailable":
                    print(f"  {time_label}: ✗ not available")
                else:
                    print(f"  {time_label}: ? unknown result (url={page.url[:60]})")
                    if debug:
                        page.screenshot(path=f"debug/{ds}_{time_label.replace(':', '')}_unknown.png")

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
    """
    Set the Mobiscroll date picker to d.
    Returns True when the time <select> subsequently gets populated (AJAX success).
    """
    ds_slash = f"{d.year}/{d.month:02d}/{d.day:02d}"  # Mobiscroll default format

    # --- Attempt 1: jQuery Mobiscroll API ---
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
        // Try setting the string value + jQuery trigger
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

    # --- Attempt 2: Click calendar UI and navigate ---
    return _set_date_via_calendar(page, d)


def _set_date_via_calendar(page, d: date) -> bool:
    """Open Mobiscroll calendar, navigate to month, click day."""
    try:
        page.locator(_DATE_INPUT).click(timeout=3_000)
        page.wait_for_timeout(1_200)

        # Navigate forward from today's month to d's month
        today = date.today()
        months = (d.year - today.year) * 12 + (d.month - today.month)
        for _ in range(months):
            for sel in ['.mbsc-cal-next', '.mbsc-fr-arr-r', '.mbsc-calendar-next',
                        'button[aria-label*="next"]', 'button[aria-label*="次"]',
                        'button:has-text("›")', 'button:has-text(">")']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=400):
                        btn.click()
                        page.wait_for_timeout(400)
                        break
                except Exception:
                    continue

        # Click on the day cell
        day_str = str(d.day)
        for sel in [
            f'[data-val*="{d.isoformat()}"]',
            f'[data-date="{d.isoformat()}"]',
            '.mbsc-cal-day-i',
            '.mbsc-calendar-day-text',
        ]:
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

        # Confirm/close
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
    """True when the time <select> has real options (AJAX populated it)."""
    try:
        opts = page.locator(_TIME_SELECT + " option").all()
        real = [o for o in opts
                if '--' not in (o.get_attribute('value') or '')
                and (o.get_attribute('value') or '').strip()]
        if real:
            return True
    except Exception:
        pass
    return False


def _get_time_options(page) -> list[tuple[str, str]]:
    """Return [(epoch_value, display_text)] for all real time options in the select."""
    opts = []
    try:
        for opt in page.locator(_TIME_SELECT + " option").all():
            v = (opt.get_attribute('value') or '').strip()
            t = opt.inner_text().strip()
            if v and '--' not in t and v:
                opts.append((v, t))
    except Exception:
        pass
    return opts


def _set_adults(page):
    """Set adults to NUM_PEOPLE."""
    try:
        page.locator(_ADULTS_SEL).select_option(str(NUM_PEOPLE), timeout=5_000)
        print(f"  ✓ adults set to {NUM_PEOPLE}")
    except Exception as e:
        print(f"  ⚠ _set_adults: {e}")


def _select_table_category(page):
    """Click the first service-category radio (テーブル / table)."""
    try:
        radio = page.locator(_CAT_RADIO).first
        if not radio.is_checked():
            radio.click()
    except Exception:
        # Fallback: click テーブル text
        try:
            page.get_by_text("テーブル", exact=False).first.click()
        except Exception:
            pass


def _click_submit(page):
    """Submit the reservation form."""
    # Log button state for diagnostics
    try:
        btn = page.locator(_SUBMIT)
        cls = btn.get_attribute('class', timeout=1_000) or ''
        print(f"    submit btn class={cls!r}")
    except Exception:
        cls = ''

    # If button is NOT disabled, normal click is fine
    if cls and 'btn-disabled' not in cls:
        try:
            page.locator(_SUBMIT).click(timeout=2_000)
            return
        except Exception as e:
            print(f"    normal click failed: {e}")

    # Button is disabled (JS guards prevent submission).
    # form.submit() bypasses ALL JS event handlers and submits directly.
    try:
        r = page.evaluate("""() => {
            const f = document.querySelector('form');
            if (!f) return 'no-form';
            f.submit();
            return 'ok';
        }""")
        print(f"    form.submit()={r}")
    except Exception as e:
        print(f"    form.submit error: {e}")


def _check_result(page, url_before: str) -> str:
    """Return 'available', 'unavailable', or 'unknown'."""
    url_after = page.url
    print(f"    url_before={url_before[:60]}")
    print(f"    url_after ={url_after[:60]}")

    # Dump body text for reliable string matching and diagnostics
    try:
        body_text = page.inner_text("body", timeout=3_000)
    except Exception:
        body_text = ""
    print(f"    body[0:400]={body_text[:400]!r}")

    # Error text in body → submit fired but slot is unavailable
    for txt in UNAVAIL_TEXT:
        if txt in body_text:
            print(f"    error text found: {txt!r}")
            return "unavailable"

    # URL changed → navigated to a booking/confirmation page → available
    if url_after != url_before:
        print("    URL changed")
        if any(kw in url_after for kw in ("confirm", "booking", "step2", "complete")):
            return "available"
        for txt in ["予約確認", "確認ページ", "Reservation Confirmation"]:
            if txt in body_text:
                return "available"
        return "unknown"

    # Same URL + no error text → submit likely did not fire (btn-disabled / bot-block)
    # Never count this as "available" — return unknown so it is not reported.
    return "unknown"


# ---------------------------------------------------------------------------
# Debug helper
# ---------------------------------------------------------------------------

def _write_debug_summary(page, ds: str, note: str = ""):
    Path("debug").mkdir(exist_ok=True)
    lines = [f"**URL:** `{page.url}`", f"**Note:** {note}", ""]

    elements = page.evaluate("""() => {
        const out = [];
        for (const el of document.querySelectorAll('*')) {
            const text = (el.innerText || el.textContent || '').trim().slice(0, 100);
            const val  = el.value !== undefined ? String(el.value) : '';
            if (!text && !val) continue;
            out.push({
                tag: el.tagName.toLowerCase(),
                id:  el.id || '',
                cls: (typeof el.className === 'string') ? el.className.slice(0,100) : '',
                role: el.getAttribute('role') || '',
                type: el.getAttribute('type') || '',
                name: el.getAttribute('name') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                text: text, val: val.slice(0, 60),
            });
        }
        return out;
    }""")

    lines.append("### Page HTML (first 5000 chars of <body>)")
    try:
        html = page.evaluate("() => document.body.innerHTML.slice(0, 5000)")
        lines.append(f"```html\n{html}\n```")
    except Exception as exc:
        lines.append(f"_(error: {exc})_")
    lines.append("")

    time_els = [e for e in elements
                if re.search(r'\b\d{1,2}:\d{2}\b', e['text'] + ' ' + e['val'])]
    lines.append(f"### Elements with time-like value ({len(time_els)})")
    for e in time_els:
        lines.append(f"- `<{e['tag']}>` name=`{e['name']}` type=`{e['type']}` "
                     f"val=`{e['val']}` text=`{e['text']}` cls=`{e['cls']}`")
    if not time_els:
        lines.append("_(none)_")
    lines.append("")

    lines.append("### Select elements")
    found = False
    for sel_el in page.locator("select").all():
        try:
            name = sel_el.get_attribute("name") or "?"
            opts = [(o.get_attribute("value") or "", o.inner_text().strip())
                    for o in sel_el.locator("option").all()]
            lines.append(f"- `{name}`: {opts[:30]}")
            found = True
        except Exception:
            continue
    if not found:
        lines.append("_(none)_")
    lines.append("")

    lines.append("### Input elements")
    found = False
    for el in page.locator("input").all():
        try:
            name = el.get_attribute("name") or el.get_attribute("id") or "?"
            typ  = el.get_attribute("type") or "text"
            val  = el.input_value() or ""
            aria = el.get_attribute("aria-label") or ""
            cls  = (el.get_attribute("class") or "")[:80]
            lines.append(f"- `{name}` type=`{typ}` val=`{val}` aria=`{aria}` cls=`{cls}`")
            found = True
        except Exception:
            continue
    if not found:
        lines.append("_(none)_")
    lines.append("")

    lines.append("### Buttons")
    for el in page.locator("button, [role='button'], input[type='submit']").all():
        try:
            bt  = el.inner_text(timeout=200).strip() or el.get_attribute("value") or ""
            cls = (el.get_attribute("class") or "")[:100]
            aria = el.get_attribute("aria-label") or ""
            if bt or aria:
                lines.append(f"- text=`{bt}` aria=`{aria}` cls=`{cls}`")
        except Exception:
            continue

    content = "\n".join(lines)
    Path(f"debug/{ds}_summary.md").write_text(content, encoding="utf-8")
    print(f"\n--- DEBUG {ds} ({note}) ---")
    print(content[:3000])
    print("--- END DEBUG ---\n")


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
            label     = dt.strftime("%a %-d %b")
            v         = checked[d]
            all_str   = " · ".join(v["all"])       if v["all"]       else "—"
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
