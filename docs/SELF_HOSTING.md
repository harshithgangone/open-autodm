# Self-Hosting Guide - open-autoDM

From zero to a working comment-to-DM automation on your own Instagram account.
Total time: **~30 minutes**. Everything used here has a free tier.

You will create:
1. A **Supabase** project (database, auth, background cron)
2. A **deployment** (Vercel *or* Cloudflare)
3. A **Meta developer app** (your personal, free Instagram API access)

> **Requirement:** your Instagram account must be a **Business or Creator** account.
> Switch for free in the Instagram app: *Settings → Account type and tools → Switch to professional account*.

---

## Part 1 - Supabase (≈5 min)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name (e.g. `open-autodm`), a strong DB password, and a region near you.
2. While it provisions, install the CLI and clone this repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/open-autodm && cd open-autodm
   npm install
   npm i -g supabase
   supabase login
   ```
3. Link and push the schema (project ref is in your Supabase dashboard URL: `supabase.com/dashboard/project/<THIS>`):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
   This creates every table, index, RLS policy, the job queue, and the rate limiter.
4. Collect three values from **Project Settings → API Keys / Data API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(keep secret!)*
5. **Create your login account** (there is no register page - access is invite-only by design):
   - **Authentication → Users → Add user → Create new user** → enter your email + a strong password → check **Auto Confirm User** → create.
   - Then lock the door: **Authentication → Sign In / Providers → turn OFF "Allow new users to sign up"**. Now the *only* way anyone gets an account is you adding them here.

## Part 2 - Generate your secrets (1 min)

```bash
# TOKEN_ENCRYPTION_KEY (64 hex chars - encrypts tokens & your app secret)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CRON_SECRET (protects the background endpoint)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Save both. **If you ever lose TOKEN_ENCRYPTION_KEY you'll need to re-run setup and reconnect Instagram** (nothing is lost permanently, it's just re-linking).

## Part 3 - Deploy (≈5 min)

### Option A - Vercel (easiest)

1. Push the repo to your GitHub, then [vercel.com/new](https://vercel.com/new) → import it.
2. Add the environment variables (from Parts 1-2):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`
3. Deploy. Copy your live URL (e.g. `https://open-autodm-xyz.vercel.app`), then add one more env var:
   `NEXT_PUBLIC_APP_URL` = that URL (no trailing slash) - and **redeploy** once.

### Option B - Cloudflare (via OpenNext)

```bash
npx wrangler login
# public vars: put NEXT_PUBLIC_* into the "vars" block of wrangler.jsonc
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put CRON_SECRET
npm run cf:deploy
```
Copy the `*.workers.dev` URL, set it as `NEXT_PUBLIC_APP_URL` in `wrangler.jsonc` vars, and deploy again.

## Part 4 - Sign in + Meta app (≈10 min)

1. Open your deployed URL → **sign in** with the account you created in the Supabase dashboard (Part 1, step 5).
2. You land on the dashboard → open the **Setup Wizard** (sidebar).
3. The wizard walks you through everything, but in short:
   - [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → use case **Other** → type **Business**.
   - In the new app: **Instagram → Set up** ("Instagram API with Instagram Login").
   - **Instagram → API setup with Instagram login → 3. Set up Instagram business login** → copy the **Instagram app ID** + **Instagram app secret** shown there → paste into the wizard → **Save Credentials**. ⚠️ Use these, NOT the App ID/Secret under *App settings → Basic* - those are the parent Meta app's and Instagram login rejects them with "Invalid platform app". (Optionally also paste the Basic-settings App Secret into the wizard's Facebook App Secret field so webhook signatures verify either way.)
4. The wizard now shows your **Callback URL** and **Verify Token**:
   - Meta portal → *Instagram → API setup with Instagram login → 2. Configure webhooks* → paste both → **Verify and save** → subscribe to **comments** and **messages**.
5. And your **OAuth Redirect URI**:
   - Same page → *3. Set up Instagram business login* → **Business login settings** → paste into **OAuth redirect URIs** → Save.

## Part 5 - Background engine (2 min)

In the wizard's Step 4 you'll find a ready-made SQL snippet. Open **Supabase → SQL Editor**,
replace `YOUR_CRON_SECRET` with your actual `CRON_SECRET`, run it. This schedules a
once-a-minute call to your deployment that processes delayed jobs and auto-refreshes tokens.

Verify: `select * from cron.job;` → you should see `open-autodm-process-jobs`.

## Part 6 - Connect Instagram + first automation (5 min)

1. In the app: **Settings → Connect Instagram** → log in with **your** Instagram (the professional account) → approve all permissions.
2. You'll bounce back to Settings with a green "connected" banner. Click **Check Status** on the account card - you want `✓ comments  ✓ messages`.
3. **Automations → New Automation → Comment to DM** → pick a post → add a trigger keyword (e.g. `LINK`) → write your opening DM → add a response with your link → **Activate**.
4. Now run the end-to-end test → see **[TESTING.md](TESTING.md)**.

---

## FAQ

**Do I need Meta App Review?**
Not to build, test, or run automations within your own circle: in Development mode, events flow
for every account that holds a role on your app - you (admin) plus any **Instagram Testers** you
add (App roles → Roles → Add people → Instagram Tester → they accept in the Instagram app under
Settings → Website permissions → Tester invites). But dev mode applies to BOTH sides: a comment
from a random member of the public produces no webhook. To go public, submit the free **App
Review** for the Instagram business permissions (screencast of your working flow, usually approved
within days). Nothing changes in the app afterwards - events simply start flowing for everyone.

**Can a friend use my instance?**
Yes, but only if you let them in - there is no public registration. Two steps:
① Supabase dashboard → Authentication → Users → **Add user** (their email + a password you share with them).
② Meta portal → App roles → add them as a tester → they accept the invite (Instagram app →
Settings → Website permissions / Apps and websites) → they sign in on your instance and
connect their own Instagram account.

**Is this against Instagram's rules?**
No. It uses the official Instagram messaging API, the exact same one ManyChat and every
commercial tool uses, and enforces Meta's rate limits *more* conservatively than required.

**What does it cost?**
$0 at personal scale. Supabase free tier + Vercel/Cloudflare free tier + Meta API (free)
comfortably cover a creator doing thousands of DMs per month.

**Where are my tokens stored?**
In your own Supabase DB, AES-256-GCM encrypted with a key that exists only in your
deployment's env vars. Nothing ever leaves your infrastructure.
