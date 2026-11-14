import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Homepage & Login Page Structure, Content, and Route Verification', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const homePagePath = path.join(rootDir, 'src/app/page.tsx');
  const loginPagePath = path.join(rootDir, 'src/app/login/page.tsx');
  const loginClientPath = path.join(rootDir, 'src/app/login/LoginClient.tsx');
  const marketingPath = path.join(rootDir, 'src/components/marketing/MarketingHomepage.tsx');
  const middlewarePath = path.join(rootDir, 'src/middleware.ts');

  it('verifies all expected page and component files exist', () => {
    expect(fs.existsSync(homePagePath)).toBe(true);
    expect(fs.existsSync(loginPagePath)).toBe(true);
    expect(fs.existsSync(loginClientPath)).toBe(true);
    expect(fs.existsSync(marketingPath)).toBe(true);
    expect(fs.existsSync(middlewarePath)).toBe(true);
  });

  describe('Root Marketing Homepage (src/app/page.tsx)', () => {
    const homeContent = fs.readFileSync(homePagePath, 'utf-8');

    it('exports metadata with accurate title, description, and metadataBase', () => {
      expect(homeContent).toContain('open-autoDM — Turn Instagram Comments Into Conversations');
      expect(homeContent).toContain('Instagram comment-to-DM automation');
      expect(homeContent).toContain('Traffic Guard safeguards');
      expect(homeContent).toContain('metadataBase');
    });

    it('renders MarketingHomepage as the root component', () => {
      expect(homeContent).toContain('<MarketingHomepage />');
    });
  });

  describe('Dedicated Login Page (src/app/login/page.tsx & LoginClient.tsx)', () => {
    const loginPageContent = fs.readFileSync(loginPagePath, 'utf-8');
    const loginClientContent = fs.readFileSync(loginClientPath, 'utf-8');

    it('exports metadata for dedicated login route', () => {
      expect(loginPageContent).toContain('Sign In — open-autoDM');
      expect(loginPageContent).toContain('Sign in to your open-autoDM automation console');
    });

    it('renders LoginClient with LoginForm and back to homepage link', () => {
      expect(loginClientContent).toContain('Back to Homepage');
      expect(loginClientContent).toContain('href="/"');
      expect(loginClientContent).toContain('<LoginForm />');
      expect(loginClientContent).toContain('<ThemeToggle />');
    });

    it('verifies LoginForm provides honest request-access path alongside returning-user sign-in', () => {
      const loginFormPath = path.join(rootDir, 'src/components/auth/LoginForm.tsx');
      const loginFormContent = fs.readFileSync(loginFormPath, 'utf-8');

      // Returning user authentication preservation
      expect(loginFormContent).toContain('signInWithPassword');
      expect(loginFormContent).toContain('Sign in');
      expect(loginFormContent).toContain('Welcome back');

      // Honest request-access journey
      expect(loginFormContent).toContain('Request Early Access');
      expect(loginFormContent).toContain('work.techhacksai@gmail.com');
      expect(loginFormContent).toContain('Copy Email &amp; Request Template');
      expect(loginFormContent).toContain('mailto:');
      expect(loginFormContent).toContain('Open AutoDM is in private early access');
    });
  });

  describe('Marketing Homepage Sections & Copy (src/components/marketing/MarketingHomepage.tsx)', () => {
    const marketingContent = fs.readFileSync(marketingPath, 'utf-8');

    it('renders the exact required headline in Hero', () => {
      expect(marketingContent).toContain('Turn Instagram Comments Into');
      expect(marketingContent).toContain('Conversations.');
    });

    it('renders primary CTA linking to /login and secondary CTA linking to #how-it-works', () => {
      expect(marketingContent).toContain('href="/login"');
      expect(marketingContent).toContain('href="#how-it-works"');
      expect(marketingContent).toContain('Get Started');
      expect(marketingContent).toContain('Sign In');
    });

    it('renders sticky navigation with all required section anchors, pricing link, and mobile drawer', () => {
      expect(marketingContent).toContain('href="#features"');
      expect(marketingContent).toContain('href="#how-it-works"');
      expect(marketingContent).toContain('href="#traffic-guard"');
      expect(marketingContent).toContain('href="/pricing"');
      expect(marketingContent).toContain('Pricing');
      expect(marketingContent).toContain('href="#reviews"');
      expect(marketingContent).toContain('href="#faq"');
      expect(marketingContent).toContain('mobileMenuOpen');
    });

    it('renders interactive 4-step execution preview in hero', () => {
      expect(marketingContent).toContain('1. Trigger');
      expect(marketingContent).toContain('2. Filter & Guard');
      expect(marketingContent).toContain('3. Public Reply');
      expect(marketingContent).toContain('4. Private DM');
      expect(marketingContent).toContain('Traffic Guard Active');
    });

    it('renders all 6 supported core automation capabilities with Cloudflare Workers AI', () => {
      expect(marketingContent).toContain('Instant Comment-to-DM');
      expect(marketingContent).toContain('Reel & Post Targeting');
      expect(marketingContent).toContain('Smart Keyword & Exclusion Rules');
      expect(marketingContent).toContain('Dynamic Public Replies');
      expect(marketingContent).toContain('AI Reply Suggestions');
      expect(marketingContent).toContain('Cloudflare Workers AI');
      expect(marketingContent).not.toContain('Google Gemini');
      expect(marketingContent).toContain('Traffic Guard Safeguards');
    });

    it('renders the 4-step setup walkthrough without node canvas', () => {
      expect(marketingContent).toContain('Connect Your Meta Account');
      expect(marketingContent).toContain('Select Your Reel or Post');
      expect(marketingContent).toContain('Define Keywords & Messages');
      expect(marketingContent).toContain('Launch With Built-In Protection');
    });

    it('renders dedicated Traffic Guard section with headline and mandatory safety disclaimer', () => {
      expect(marketingContent).toContain('Automation With More Control.');
      expect(marketingContent).toContain('Comment Spike Monitoring &amp; Velocity Control');
      expect(marketingContent).toContain('Sliding-Window Rate Limiting');
      expect(marketingContent).toContain('Atomic Deduplication &amp; Idempotency');
      expect(marketingContent).toContain('Automated Protective Pauses');

      // Crucial Disclaimer checks
      expect(marketingContent).toContain('Platform Compliance &amp; Account Safety Notice');
      expect(marketingContent).toContain('No software tool can guarantee an account will never be restricted or flagged by Instagram.');
      expect(marketingContent).toContain('Community Guidelines and Platform Terms');
    });

    it('renders honest Meta platform integration without misleading badges', () => {
      expect(marketingContent).toContain('Built on Official Meta APIs. Zero Hacks.');
      expect(marketingContent).toContain('instagram_manage_comments');
      expect(marketingContent).toContain('instagram_manage_messages');
      expect(marketingContent).toContain('X-Hub-Signature-256');
      expect(marketingContent).toContain('HMAC-SHA256');
    });

    it('renders truthful early access community feedback invitations without fake testimonials', () => {
      expect(marketingContent).toContain('Early Access &amp; Community Feedback');
      expect(marketingContent).toContain('Community Beta Testing');
      expect(marketingContent).toContain('Self-Hosted Builders');
      expect(marketingContent).toContain('Open Community Collaboration');
      expect(marketingContent).not.toContain('Sarah M.');
      expect(marketingContent).not.toContain('David K.');
      expect(marketingContent).not.toContain('Elena R.');
      expect(marketingContent).not.toContain('400 downloads');
      expect(marketingContent).toContain('work.techhacksai@gmail.com');
    });

    it('renders all 6 real product FAQs in interactive accordion', () => {
      expect(marketingContent).toContain('What type of Instagram account do I need?');
      expect(marketingContent).toContain('How does Open AutoDM protect my account from getting restricted?');
      expect(marketingContent).toContain('Can an audience member receive the same DM multiple times?');
      expect(marketingContent).toContain('How does the AI reply suggestion feature work?');
      expect(marketingContent).toContain('Is Open AutoDM open-source and self-hostable?');
      expect(marketingContent).toContain('Can I filter out followers asking for customer support?');
    });

    it('renders comprehensive footer with legal links and Meta affiliation disclaimer', () => {
      expect(marketingContent).toContain('href="/privacy-policy"');
      expect(marketingContent).toContain('href="/terms"');
      expect(marketingContent).toContain('href="/data-deletion"');
      expect(marketingContent).toContain('href="/login"');
      expect(marketingContent).toContain('open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.');
    });

    it('renders consistent Instagram safety disclaimer near hero and bottom conversion CTAs', () => {
      const disclaimer = 'open-autoDM uses official Meta Graph API webhooks and built-in Traffic Guard rate limiting and safeguards to help protect your account. No tool can guarantee immunity from platform restrictions; account owners remain responsible for ensuring messaging content and frequency comply with Meta Community Guidelines. open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.';
      expect(marketingContent).toContain(disclaimer);
      expect(marketingContent).toContain('Safety &amp; Compliance Notice:');
    });

    it('renders four polished interactive animation elements', () => {
      // 1. Animated hero visuals
      expect(marketingContent).toContain('animate-float-slow');
      expect(marketingContent).toContain('animate-float-delayed');
      expect(marketingContent).toContain('@maya_travel');
      expect(marketingContent).toContain('Keyword Match &quot;GUIDE&quot;');
      expect(marketingContent).toContain('Direct Message');

      // 2. Interactive comment-to-DM demonstration with scenario selection & replay
      expect(marketingContent).toContain('Select Scenario:');
      expect(marketingContent).toContain('handleRunSimulation');
      expect(marketingContent).toContain('handleResetSimulation');
      expect(marketingContent).toContain('role="tablist"');
      expect(marketingContent).toContain('role="tab"');
      expect(marketingContent).toContain('aria-live="polite"');
      expect(marketingContent).toContain('PIPELINE_SCENARIOS');

      // 3. Interactive feature cards with hover, focus, and elevation
      expect(marketingContent).toContain('tabIndex={0}');
      expect(marketingContent).toContain('role="article"');
      expect(marketingContent).toContain('hover:border-primary/40');
      expect(marketingContent).toContain('focus-visible:ring-primary/40');
      expect(marketingContent).toContain('Ready in Builder');

      // 4. Scroll-based section entrances
      expect(marketingContent).toContain('whileInView={{ opacity: 1, y: 0 }}');
      expect(marketingContent).toContain('viewport={{ once: true');
    });
  });

  describe('Globals CSS Motion & Accessibility Configuration (src/app/globals.css)', () => {
    const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
    const globalsContent = fs.readFileSync(globalsCssPath, 'utf-8');

    it('defines slow, polished floating keyframes and animations', () => {
      expect(globalsContent).toContain('@keyframes floatSlow');
      expect(globalsContent).toContain('@keyframes floatDelayed');
      expect(globalsContent).toContain('.animate-float-slow');
      expect(globalsContent).toContain('.animate-float-delayed');
    });

    it('strictly enforces prefers-reduced-motion to suppress animations', () => {
      expect(globalsContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(globalsContent).toContain('animation-duration: 0.01ms !important');
      expect(globalsContent).toContain('transition-duration: 0.01ms !important');
    });
  });

  describe('Middleware Route Protection Configuration (src/middleware.ts)', () => {
    const middlewareContent = fs.readFileSync(middlewarePath, 'utf-8');

    it('redirects unauthenticated protected routes to /login', () => {
      expect(middlewareContent).toContain("redirectUrl.pathname = '/login'");
      expect(middlewareContent).toContain("pathname.startsWith('/dashboard')");
      expect(middlewareContent).toContain("pathname.startsWith('/automations')");
      expect(middlewareContent).toContain("pathname.startsWith('/settings')");
      expect(middlewareContent).toContain("pathname.startsWith('/setup')");
      expect(middlewareContent).toContain("pathname.startsWith('/analytics')");
    });

    it('redirects authenticated users visiting /login to /dashboard', () => {
      expect(middlewareContent).toContain("pathname === '/login' && user");
      expect(middlewareContent).toContain("redirectUrl.pathname = '/dashboard'");
    });

    it('does not force redirect on root (/) allowing public marketing access', () => {
      expect(middlewareContent).not.toContain("pathname === '/' && user");
    });
  });
});
