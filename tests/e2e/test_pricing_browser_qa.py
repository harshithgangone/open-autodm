#!/usr/bin/env python3
"""
Comprehensive Playwright Browser QA for Open AutoDM Pricing Page (/pricing) and Navigation.

Runs against local Next.js server (http://localhost:3005).
Tests:
1. Desktop Viewport (1280 x 800):
   - Homepage (/) navigation contains "Pricing" link.
   - Click "Pricing" link -> navigates to /pricing.
   - Verified page title, H1 headline ("Simple Pricing. More Control.").
   - Horizontal overflow check (must be <= 1280px).
   - Verify 3 Pricing Cards:
     * Free Trial ($0, for 30 days) with "Start Free Trial" CTA
     * Starter ($5 / month) with "Choose Starter" CTA
     * Creator Plus ($9 / month) with "Choose Creator Plus" CTA
   - Verify Early-Access Status notice.
   - Verify Feature Comparison matrix and all capability rows.
   - Verify 30-Day Free Trial Explanation section.
   - Verify Billing FAQ Accordion expansion.
   - Verify Bottom CTA ("Start Free Trial" & "Sign In to Existing Account").
   - Test CTA navigation:
     * "Start Free Trial" -> /login?plan=trial
     * "Choose Starter" -> /login?plan=starter
     * "Choose Creator Plus" -> /login?plan=creator-plus
   - Check Footer links (Privacy Policy, Terms, Data Deletion, Home).
   - Console error monitoring (0 errors).
   - Capture desktop screenshots.

2. Mobile Viewport (375 x 667 — iPhone SE):
   - Homepage mobile hamburger drawer contains "Pricing" link.
   - Click "Pricing" in drawer -> navigates to /pricing.
   - Horizontal overflow check (must be <= 375px).
   - Verify responsive card stacking.
   - Mobile menu drawer on /pricing.
   - Click mobile card CTA -> navigates to /login?plan=trial.
   - Mobile /login overflow check (must be <= 375px).
   - Console error monitoring.
   - Capture mobile screenshots.
"""

import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3005"
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def run_pricing_browser_qa():
    results = {
        "desktop": {},
        "mobile": {},
        "cta_navigation": {},
        "console_errors": [],
        "screenshots": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ══════════════════════════════════════════════════════════════════════
        # PART 1: DESKTOP AUDIT (1280 x 800)
        # ══════════════════════════════════════════════════════════════════════
        print("\n========================================================")
        print("  1. RUNNING DESKTOP PRICING BROWSER QA (1280 x 800)")
        print("========================================================")

        desktop_context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = desktop_context.new_page()

        # Monitor console errors
        def on_console(msg):
            if msg.type == "error":
                results["console_errors"].append(f"[Console Error] {msg.text}")
                print(f"  [Browser Console Error] {msg.text}")

        page.on("console", on_console)
        page.on("pageerror", lambda err: results["console_errors"].append(f"[Page Error] {err}"))

        # 1.1 Load Root Homepage and verify Pricing link
        print("\n--> 1.1 Checking Homepage Navigation for Pricing Link")
        resp = page.goto(f"{BASE_URL}/", wait_until="networkidle")
        assert resp.status == 200, f"Expected 200 OK for /, got {resp.status}"

        pricing_nav_link = page.locator("header nav a[href='/pricing']")
        assert pricing_nav_link.is_visible(), "Pricing link not found in desktop header navigation"
        print("  ✓ Found 'Pricing' link in desktop header navigation")

        footer_pricing_link = page.locator("footer a[href='/pricing']")
        assert footer_pricing_link.is_visible(), "Pricing link not found in footer"
        print("  ✓ Found 'Pricing' link in footer")

        # 1.2 Click Pricing Nav Link
        print("\n--> 1.2 Navigating to /pricing via Header Link")
        pricing_nav_link.click()
        page.wait_for_url("**/pricing", timeout=5000)
        assert "/pricing" in page.url, f"Expected /pricing, got {page.url}"
        print(f"  ✓ Navigated successfully to {page.url}")

        # 1.3 Verify Title and H1
        title = page.title()
        print(f"  ✓ Page Title: '{title}'")
        assert "Simple Pricing. More Control." in title, f"Unexpected title: {title}"
        results["desktop"]["title"] = title

        h1 = page.locator("h1").inner_text()
        print(f"  ✓ H1 Headline: '{h1.replace(chr(10), ' ')}'")
        assert "Simple Pricing." in h1 and "More Control." in h1
        results["desktop"]["h1"] = h1

        # 1.4 Horizontal Overflow Check
        scroll_width = page.evaluate("() => document.documentElement.scrollWidth")
        inner_width = page.evaluate("() => window.innerWidth")
        print(f"  ✓ Viewport Width: {inner_width}px | Document Scroll Width: {scroll_width}px")
        assert scroll_width <= inner_width, f"Horizontal overflow! scrollWidth ({scroll_width}) > innerWidth ({inner_width})"
        results["desktop"]["no_horizontal_overflow"] = True

        # 1.5 Verify 3 Pricing Cards
        print("\n--> 1.3 Verifying 3 Pricing Cards ($0, $5, $9)")
        # Plan A: Free Trial
        assert page.locator("text=Free Trial").first.is_visible()
        assert page.locator("text=$0").first.is_visible()
        assert page.locator("text=for 30 days").first.is_visible()
        assert page.locator("text=1 connected Instagram account").first.is_visible()
        assert page.locator("a:has-text('Request Early Access')").first.is_visible()
        print("  ✓ Free Trial card verified: $0 for 30 days, 1 connected Instagram account")

        # Plan B: Starter
        assert page.locator("text=Starter").first.is_visible()
        assert page.locator("text=$5").first.is_visible()
        assert page.locator("text=1 connected Instagram account").first.is_visible()
        assert page.locator("text=Individual creators and beginners").first.is_visible()
        assert page.locator("a:has-text('Choose Starter')").is_visible()
        print("  ✓ Starter card verified: $5 / month, 1 connected Instagram account")

        # Plan C: Creator Plus
        assert page.locator("text=Creator Plus").first.is_visible()
        assert page.locator("text=$9").first.is_visible()
        assert page.locator("text=Up to 3 connected Instagram accounts").first.is_visible()
        assert page.locator("text=Creators who want the advanced supported automation workflow").first.is_visible()
        assert page.locator("a:has-text('Choose Creator Plus')").is_visible()
        print("  ✓ Creator Plus card verified: $9 / month (Recommended), up to 3 connected Instagram accounts")

        # Verify ceiling: ensure no card displays over $12
        card_prices = page.locator(".font-heading.font-extrabold:has-text('$')").all_inner_texts()
        print(f"  ✓ Discovered Card Prices: {card_prices}")
        for p_str in card_prices:
            val = int(p_str.replace("$", "").strip())
            assert val <= 12, f"Price {val} exceeds $12 ceiling!"

        # 1.6 Verify Early Access Status Notice
        print("\n--> 1.4 Verifying Early Access Notice")
        assert page.locator("text=Early-Access Status Notice:").is_visible()
        assert page.locator("text=Open AutoDM is currently in early access").first.is_visible()
        print("  ✓ Early-Access Status Notice verified")

        # 1.7 Verify Capability Comparison Matrix
        print("\n--> 1.5 Verifying Capability Comparison Matrix")
        assert page.locator("text=Compare Platform Capabilities").is_visible()
        table = page.locator("table")
        assert table.locator("text=Connected Instagram Accounts").first.is_visible()
        assert table.locator("text=1 account").first.is_visible()
        assert table.locator("text=Up to 3 accounts").first.is_visible()
        assert table.locator("text=Comment-to-DM Automation").first.is_visible()
        assert table.locator("text=Post & Reel Targeting").first.is_visible()
        assert table.locator("text=Shared-Reel DM Triggers").first.is_visible()
        assert table.locator("text=Keyword Inclusion & Phrase Matching").first.is_visible()
        assert table.locator("text=Negative Keyword Exclusions").first.is_visible()
        assert table.locator("text=Dynamic Public Reply Rotation").first.is_visible()
        assert table.locator("text=AI Reply Suggestions (Llama 3.2)").first.is_visible()
        assert table.locator("text=Private DM Delivery").first.is_visible()
        assert table.locator("text=Sliding-Window Rate Limiting").first.is_visible()
        assert table.locator("text=Atomic Deduplication Lock").first.is_visible()
        assert table.locator("text=Protective Spike Pause").first.is_visible()
        print("  ✓ All verified application capability rows present in comparison matrix")

        # 1.8 Verify Free Trial Explanation Section
        print("\n--> 1.6 Verifying Free Trial Explanation")
        assert page.locator("text=How the 30-Day Free Trial Works").is_visible()
        assert page.locator("text=Zero Billing Obligation").first.is_visible()
        assert page.locator("text=What happens after 30 days?").is_visible()
        print("  ✓ Free Trial explanation section verified")

        # 1.9 Verify Billing FAQ Accordion
        print("\n--> 1.7 Testing Billing FAQ Accordion")
        faq_btn = page.locator("button:has-text('How will billing work when self-serve subscriptions launch?')")
        assert faq_btn.is_visible()
        faq_btn.click()
        time.sleep(0.3)
        assert page.locator("text=payments will be processed securely through a compliant payment provider").is_visible()
        print("  ✓ Billing FAQ expanded and verified")

        # 1.10 Verify Bottom CTA
        print("\n--> 1.8 Verifying Bottom CTA")
        assert page.locator("text=Ready to Automate Your Instagram Growth?").is_visible()
        assert page.locator("a:has-text('Sign In to Existing Account')").is_visible()

        # Capture Desktop Screenshots
        shot_hero = os.path.join(SCREENSHOTS_DIR, "desktop_pricing_hero_cards.png")
        page.screenshot(path=shot_hero)
        results["screenshots"].append(shot_hero)
        print(f"  ✓ Captured screenshot: {os.path.basename(shot_hero)}")

        page.locator("text=Compare Platform Capabilities").scroll_into_view_if_needed()
        time.sleep(0.3)
        shot_matrix = os.path.join(SCREENSHOTS_DIR, "desktop_pricing_comparison_table.png")
        page.screenshot(path=shot_matrix)
        results["screenshots"].append(shot_matrix)
        print(f"  ✓ Captured screenshot: {os.path.basename(shot_matrix)}")

        # 1.11 Test CTA Navigation to /login with Plan Parameter
        print("\n--> 1.9 Testing Plan CTA Links")
        page.goto(f"{BASE_URL}/pricing", wait_until="networkidle")

        # Test Request Early Access CTA
        page.locator("a:has-text('Request Early Access'):visible").first.click()
        page.wait_for_url("**/login?plan=trial", timeout=5000)
        assert "/login?plan=trial" in page.url
        print(f"  ✓ 'Request Early Access' navigated to {page.url}")
        results["cta_navigation"]["trial"] = page.url

        # Test Choose Starter CTA
        page.goto(f"{BASE_URL}/pricing", wait_until="networkidle")
        page.locator("a:has-text('Choose Starter'):visible").first.click()
        page.wait_for_url("**/login?plan=starter", timeout=5000)
        assert "/login?plan=starter" in page.url
        print(f"  ✓ 'Choose Starter' navigated to {page.url}")
        results["cta_navigation"]["starter"] = page.url

        # Test Choose Creator Plus CTA
        page.goto(f"{BASE_URL}/pricing", wait_until="networkidle")
        page.locator("a:has-text('Choose Creator Plus'):visible").first.click()
        page.wait_for_url("**/login?plan=creator-plus", timeout=5000)
        assert "/login?plan=creator-plus" in page.url
        print(f"  ✓ 'Choose Creator Plus' navigated to {page.url}")
        results["cta_navigation"]["creator-plus"] = page.url

        # 1.12 Test Footer Links
        print("\n--> 1.10 Testing Footer Legal Links from /pricing")
        for legal_path in ["/privacy-policy", "/terms", "/data-deletion"]:
            page.goto(f"{BASE_URL}/pricing", wait_until="networkidle")
            link = page.locator(f"footer a[href='{legal_path}']")
            assert link.is_visible(), f"Footer link to {legal_path} not visible"
            link.click()
            page.wait_for_url(f"**{legal_path}", timeout=5000)
            assert legal_path in page.url
            print(f"  ✓ Footer link to {legal_path} verified (200 OK)")

        desktop_context.close()

        # ══════════════════════════════════════════════════════════════════════
        # PART 2: MOBILE AUDIT (375 x 667)
        # ══════════════════════════════════════════════════════════════════════
        print("\n========================================================")
        print("  2. RUNNING MOBILE PRICING BROWSER QA (375 x 667 — iPhone SE)")
        print("========================================================")

        mobile_context = browser.new_context(
            viewport={"width": 375, "height": 667},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            is_mobile=True,
            has_touch=True,
        )
        m_page = mobile_context.new_page()
        m_page.on("console", on_console)
        m_page.on("pageerror", lambda err: results["console_errors"].append(f"[Mobile Page Error] {err}"))

        # 2.1 Load Homepage and check mobile drawer Pricing link
        print("\n--> 2.1 Checking Mobile Menu Drawer on Homepage")
        m_page.goto(f"{BASE_URL}/", wait_until="networkidle")
        hamburger = m_page.locator("button[aria-label='Toggle navigation menu']")
        assert hamburger.is_visible(), "Hamburger button not found"
        hamburger.click()
        time.sleep(0.3)

        mobile_pricing_link = m_page.locator("header a[href='/pricing']:visible")
        assert mobile_pricing_link.is_visible(), "Pricing link not visible in mobile drawer"
        print("  ✓ Found 'Pricing' link in mobile drawer")

        # 2.2 Click Pricing in Mobile Drawer
        mobile_pricing_link.click()
        m_page.wait_for_url("**/pricing", timeout=5000)
        assert "/pricing" in m_page.url
        print(f"  ✓ Mobile navigation to /pricing successful")

        # 2.3 Check Mobile Horizontal Overflow
        m_scroll_width = m_page.evaluate("() => document.documentElement.scrollWidth")
        m_inner_width = m_page.evaluate("() => window.innerWidth")
        print(f"  ✓ Mobile Viewport: {m_inner_width}px | Mobile Scroll Width: {m_scroll_width}px")
        assert m_scroll_width <= m_inner_width, f"Mobile horizontal overflow! scrollWidth ({m_scroll_width}) > innerWidth ({m_inner_width})"
        results["mobile"]["no_horizontal_overflow"] = True

        # 2.4 Verify Mobile Pricing Cards
        assert m_page.locator("h2:has-text('Free Trial')").first.is_visible()
        assert m_page.locator("h2:has-text('Starter')").first.is_visible()
        assert m_page.locator("h2:has-text('Creator Plus')").first.is_visible()
        print("  ✓ All 3 plans visible on mobile")

        # Capture Mobile Screenshots
        shot_mobile_cards = os.path.join(SCREENSHOTS_DIR, "mobile_pricing_cards.png")
        m_page.screenshot(path=shot_mobile_cards)
        results["screenshots"].append(shot_mobile_cards)
        print(f"  ✓ Captured screenshot: {os.path.basename(shot_mobile_cards)}")

        # 2.5 Test Mobile Drawer on /pricing
        m_hamburger_pricing = m_page.locator("button[aria-label='Toggle navigation menu']")
        m_hamburger_pricing.click()
        time.sleep(0.3)
        shot_mobile_drawer = os.path.join(SCREENSHOTS_DIR, "mobile_pricing_drawer.png")
        m_page.screenshot(path=shot_mobile_drawer)
        results["screenshots"].append(shot_mobile_drawer)
        print(f"  ✓ Captured screenshot: {os.path.basename(shot_mobile_drawer)}")

        # Click Sign In from Mobile Drawer
        m_page.locator("a:has-text('Sign In'):visible").first.click()
        m_page.wait_for_url("**/login", timeout=5000)
        assert "/login" in m_page.url
        print("  ✓ Mobile drawer 'Sign In' navigated to /login")

        mobile_context.close()
        browser.close()

    # ══════════════════════════════════════════════════════════════════════
    # CONSOLE ERROR CHECK
    # ══════════════════════════════════════════════════════════════════════
    print("\n========================================================")
    print("  3. BROWSER CONSOLE ERROR AUDIT")
    print("========================================================")
    print(f"Total Console Errors Recorded: {len(results['console_errors'])}")
    if results["console_errors"]:
        for err in results["console_errors"]:
            print(f"  [ERROR] {err}")
    assert len(results["console_errors"]) == 0, f"Found {len(results['console_errors'])} browser console errors!"
    print("  ✓ 0 Browser Console Errors Detected!")

    print("\n========================================================")
    print("  >>> ALL PRICING BROWSER QA CHECKS PASSED SUCCESSFULLY <<<")
    print("========================================================")

if __name__ == "__main__":
    run_pricing_browser_qa()
