import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Pricing Page Structure, Plan Verification, and Routing Safety', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const pricingPageRoute = path.join(rootDir, 'src/app/pricing/page.tsx');
  const pricingComponent = path.join(rootDir, 'src/components/pricing/PricingPage.tsx');
  const marketingComponent = path.join(rootDir, 'src/components/marketing/MarketingHomepage.tsx');
  const middlewarePath = path.join(rootDir, 'src/middleware.ts');

  it('verifies pricing route and component files exist', () => {
    expect(fs.existsSync(pricingPageRoute)).toBe(true);
    expect(fs.existsSync(pricingComponent)).toBe(true);
    expect(fs.existsSync(marketingComponent)).toBe(true);
    expect(fs.existsSync(middlewarePath)).toBe(true);
  });

  describe('Pricing Route Metadata (src/app/pricing/page.tsx)', () => {
    const routeContent = fs.readFileSync(pricingPageRoute, 'utf-8');

    it('exports metadata with required title and description', () => {
      expect(routeContent).toContain('Simple Pricing. More Control.');
      expect(routeContent).toContain('open-autoDM');
      expect(routeContent).toContain('30-day free trial');
      expect(routeContent).toContain('$5/mo');
      expect(routeContent).toContain('$9/mo');
    });

    it('configures metadataBase and openGraph correctly', () => {
      expect(routeContent).toContain('metadataBase');
      expect(routeContent).toContain('url: "/pricing"');
    });
  });

  describe('Pricing Component Content & Safety (src/components/pricing/PricingPage.tsx)', () => {
    const pageContent = fs.readFileSync(pricingComponent, 'utf-8');

    it('renders the exact required page heading', () => {
      expect(pageContent).toContain('Simple Pricing.');
      expect(pageContent).toContain('More Control.');
    });

    it('displays Plan A (Free Trial) with price $0, 30 days duration, 1 connected Instagram account, and Request Early Access CTA without draft wording', () => {
      expect(pageContent).toContain('Free Trial');
      expect(pageContent).toContain('"$0"');
      expect(pageContent).toContain('"for 30 days"');
      expect(pageContent).toContain('"1 connected Instagram account"');
      expect(pageContent).not.toContain('(proposed trial)');
      expect(pageContent).toContain('"Request Early Access"');
      expect(pageContent).toContain('"/login?plan=trial"');
    });

    it('displays Plan B (Starter) with price $5/month, 1 connected Instagram account, correct audience, and Choose Starter CTA', () => {
      expect(pageContent).toContain('Starter');
      expect(pageContent).toContain('"$5"');
      expect(pageContent).toContain('"/ month"');
      expect(pageContent).toContain('"1 connected Instagram account"');
      expect(pageContent).toContain('Individual creators and beginners');
      expect(pageContent).toContain('"Choose Starter"');
      expect(pageContent).toContain('"/login?plan=starter"');
    });

    it('displays Plan C (Creator Plus) with price $9/month, up to 3 connected Instagram accounts, correct audience, and Choose Creator Plus CTA', () => {
      expect(pageContent).toContain('Creator Plus');
      expect(pageContent).toContain('"$9"');
      expect(pageContent).toContain('"/ month"');
      expect(pageContent).toContain('"Up to 3 connected Instagram accounts"');
      expect(pageContent).toContain('Creators who want the advanced supported automation workflow');
      expect(pageContent).toContain('"Choose Creator Plus"');
      expect(pageContent).toContain('"/login?plan=creator-plus"');
    });

    it('uses exact connected Instagram account allowances without claiming team seats or user logins', () => {
      expect(pageContent).toContain('Connected Instagram Accounts');
      expect(pageContent).toContain('"1 account"');
      expect(pageContent).toContain('"Up to 3 accounts"');
      expect(pageContent).not.toContain('team seats');
      expect(pageContent).not.toContain('user logins');
    });

    it('strictly adheres to price ceiling: no paid plan exceeds $12/month', () => {
      // Extract all price strings matching "$[0-9]+"
      const priceMatches = [...pageContent.matchAll(/"\$([0-9]+)"/g)].map((m) => parseInt(m[1]!, 10));
      expect(priceMatches.length).toBeGreaterThanOrEqual(3);
      for (const price of priceMatches) {
        expect(price).toBeLessThanOrEqual(12);
      }
      expect(priceMatches).toContain(0);
      expect(priceMatches).toContain(5);
      expect(priceMatches).toContain(9);
    });

    it('CTAs navigate exclusively to existing login flow with validated plan query parameter', () => {
      expect(pageContent).toContain('ctaHref: "/login?plan=trial"');
      expect(pageContent).toContain('ctaHref: "/login?plan=starter"');
      expect(pageContent).toContain('ctaHref: "/login?plan=creator-plus"');
      expect(pageContent).toContain('href={plan.ctaHref}');
      // No fake checkout URLs or payment simulator routes
      expect(pageContent).not.toContain('/checkout');
      expect(pageContent).not.toContain('/pay');
      expect(pageContent).not.toContain('/api/billing');
      expect(pageContent).not.toContain('/api/stripe');
    });

    it('includes a feature comparison table based strictly on verified application capabilities', () => {
      expect(pageContent).toContain('Comment-to-DM Automation');
      expect(pageContent).toContain('Post & Reel Targeting');
      expect(pageContent).toContain('Shared-Reel DM Triggers');
      expect(pageContent).toContain('Keyword Inclusion & Phrase Matching');
      expect(pageContent).toContain('Negative Keyword Exclusions');
      expect(pageContent).toContain('Dynamic Public Reply Rotation');
      expect(pageContent).toContain('AI Reply Suggestions (Llama 3.2)');
      expect(pageContent).toContain('Private DM Delivery');
      expect(pageContent).toContain('Follow-Up Message Scheduling');
      expect(pageContent).toContain('Sliding-Window Rate Limiting');
      expect(pageContent).toContain('Atomic Deduplication Lock');
      expect(pageContent).toContain('Protective Spike Pause');
      expect(pageContent).toContain('Campaign Lifecycle Controls');
    });

    it('does NOT invent synthetic quotas, artificial limits, or fake subscription states', () => {
      // Must not claim arbitrary message limits or fake enterprise guarantees
      expect(pageContent).not.toContain('10,000 DMs/month');
      expect(pageContent).not.toContain('Unlimited accounts');
      expect(pageContent).not.toContain('Enterprise SLA');
      expect(pageContent).not.toContain('Payment Successful');
      expect(pageContent).not.toContain('Subscription Active');
    });

    it('displays transparent early-access status notice explaining billing roadmap', () => {
      expect(pageContent).toContain('Early-Access Status Notice');
      expect(pageContent).toContain('must be provisioned or confirmed by the instance administrator');
      expect(pageContent).toContain('Automatic trial expiry, billing checkouts');
      expect(pageContent).toContain('subscription entitlement enforcement are not yet implemented');
    });

    it('explains the 30-day free trial truthfully with transparent post-trial expectations', () => {
      expect(pageContent).toContain('How the 30-Day Free Trial Works');
      expect(pageContent).toContain('Zero Billing Obligation');
      expect(pageContent).toContain('What happens after 30 days?');
      expect(pageContent).toContain('Open AutoDM is in early access. Trial access must be provisioned or confirmed by the instance administrator');
    });

    it('includes billing FAQ addressing trial, card requirements, and open-source self-hosting', () => {
      expect(pageContent).toContain('How does the 30-day free trial work?');
      expect(pageContent).toContain('Trial access must be provisioned or confirmed by the instance administrator');
      expect(pageContent).toContain('Clicking a plan button navigates to sign-in and does not automatically create an account');
      expect(pageContent).toContain('Is a credit card required to start the trial?');
      expect(pageContent).toContain('How will billing work when self-serve subscriptions launch?');
      expect(pageContent).toContain('Can I switch or cancel my plan at any time?');
      expect(pageContent).toContain('Is Open AutoDM still free for self-hosters?');
      expect(pageContent).toContain('open-source under the MIT license');
    });

    it('renders consistent Instagram safety disclaimer near conversion CTAs and bottom actions', () => {
      const disclaimer = 'open-autoDM uses official Meta Graph API webhooks and built-in Traffic Guard rate limiting and safeguards to help protect your account. No tool can guarantee immunity from platform restrictions; account owners remain responsible for ensuring messaging content and frequency comply with Meta Community Guidelines. open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.';
      expect(pageContent).toContain(disclaimer);
      expect(pageContent).toContain('Safety &amp; Compliance Notice:');
    });

    it('clarifies implementation status vs planned billing entitlements in comparison matrix note', () => {
      expect(pageContent).toContain('Implementation &amp; Entitlement Notice:');
      expect(pageContent).toContain('zero artificial paywalls');
      expect(pageContent).toContain('automated entitlement enforcement and paywalls');
    });

    it('accurately differentiates hosted early access from self-hosting without dead links', () => {
      expect(pageContent).toContain('Hosted early access is evaluated directly on this deployment (app.opendm.in)');
      expect(pageContent).toContain('Self-hosting deployment instructions are packaged directly in the source repository');
      expect(pageContent).not.toContain('github.com/YOUR_USERNAME');
    });

    it('renders links to homepage, login, privacy policy, terms, and data deletion', () => {
      expect(pageContent).toContain('href="/"');
      expect(pageContent).toContain('href="/login"');
      expect(pageContent).toContain('href="/privacy-policy"');
      expect(pageContent).toContain('href="/terms"');
      expect(pageContent).toContain('href="/data-deletion"');
    });
  });

  describe('Navigation & Cross-Linking Integrity', () => {
    const marketingContent = fs.readFileSync(marketingComponent, 'utf-8');

    it('ensures marketing homepage links to /pricing in desktop nav, mobile menu, and footer', () => {
      expect(marketingContent).toContain('<Link href="/pricing" className="hover:text-foreground transition-colors">\n              Pricing\n            </Link>');
      expect(marketingContent).toContain('href="/pricing"');
      expect(marketingContent).toContain('Pricing');
    });
  });
});
