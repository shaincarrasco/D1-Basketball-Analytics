"""Screenshot the dashboard with headless Chrome (dev tool, not a test).

    python tests/app/shoot.py --url http://127.0.0.1:8799 --out docs/screenshots

Expects a server already running against the demo data.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

VIEWPORTS = {"desktop": (1440, 900), "mobile": (390, 844)}


def shoot(url: str, out: Path, only: str | None = None, brief_id: str = "fx-montevideo-1") -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for vp, (w, h) in VIEWPORTS.items():
            if only and only != vp:
                continue
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if vp == "mobile" else 1,
                                      timezone_id="UTC", locale="en-GB")
            page = ctx.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            def save(name: str, full: bool = False):
                path = out / f"{name}-{vp}.png"
                page.screenshot(path=str(path), full_page=full)
                saved.append(path)

            page.goto(url + "/#/")
            page.wait_for_selector(".row")
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(300)
            save("matches")

            # Tomorrow has the brief matches
            page.get_by_role("button", name="Tomorrow").click()
            page.locator(f'.match[data-id="{brief_id}"] .row').click()
            page.wait_for_selector(".court")
            page.wait_for_timeout(600)
            page.locator(f'.match[data-id="{brief_id}"]').scroll_into_view_if_needed()
            page.evaluate(f"document.querySelector('.match[data-id=\"{brief_id}\"]').scrollIntoView({{block:'start'}}); window.scrollBy(0,-72)")
            page.wait_for_timeout(200)
            save("brief")
            save("brief-full", full=True)

            page.get_by_role("tab", name="Attributes").click()
            page.wait_for_selector(".radar")
            page.wait_for_timeout(200)
            save("attributes")

            page.get_by_role("tab", name="Odds").click()
            page.wait_for_timeout(400)
            save("odds")

            page.get_by_role("tab", name="Profile").click()
            page.wait_for_timeout(200)
            save("profile")

            page.get_by_role("tab", name="Sets").click()
            page.wait_for_timeout(200)
            save("sets")

            page.goto(url + "/#/proof")
            page.wait_for_selector(".pnl-box svg")
            page.wait_for_timeout(400)
            save("proof")
            save("proof-full", full=True)

            page.goto(url + "/#/players")
            page.wait_for_selector("table.players")
            page.wait_for_timeout(200)
            save("players")
            if errors:
                print(vp, "console errors:", *errors, sep="\n  ")
            ctx.close()
        browser.close()
    return saved


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8799")
    ap.add_argument("--out", default="/tmp/deuce-shots")
    ap.add_argument("--only", choices=list(VIEWPORTS))
    ap.add_argument("--brief", default="fx-montevideo-1")
    a = ap.parse_args()
    for pth in shoot(a.url, Path(a.out), a.only, a.brief):
        print(pth)
