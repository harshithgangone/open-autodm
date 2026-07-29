<div align="center">

<img src="public/logo.svg" width="90" alt="open-autoDM logo" />

# open-autoDM

**Open-source, self-hosted Instagram comment-to-DM automation.**

Someone comments a keyword on your post → they instantly get your link in their DMs.
The exact engine behind ManyChat-style "comment *LINK* to get it" funnels — except it's
free, it runs on **your** infrastructure, through **your own** Meta app, and your data
never touches anyone else's servers.

`Next.js (one deployment)` · `Supabase (DB + auth + queue + cron)` · `Vercel or Cloudflare`

</div>

---

## ✨ What it does

- **Comment → DM** — auto-DM anyone who comments a trigger keyword (or any comment) on a specific post or all posts. Sent as Meta **Private Replies** — the purpose-built comment-to-DM channel with its own 750/hour allowance, valid up to 7 days after the comment.
- **DM keyword auto-replies** — someone DMs you `DIET` → they instantly get the resource you attached to that keyword.
- **Story reply triggers** — someone replies `DIET` to your story → same thing. Story replies route to their own automations, separate from plain DMs.
- **Tappable link buttons** — links are delivered as real button-template DMs (a button that opens the URL), with automatic fallback to an inline link if Meta rejects the template for a recipient.
- **Public comment replies** — replies to the trigger comment with a random line from your list ("Sent! Check your DMs 📬"). Idempotent — a retried job never double-posts.
- **2-step button flow** — opening DM with a *"Send me the link"* button; content is delivered only after the tap (massively better delivery + engagement).
- **Ask-to-follow gate** — optionally ask people to follow you before delivering the content (Visit Profile + "I'm following ✅" buttons).
- **Text + card responses** — plain messages, link buttons, or rich cards with image / subtitle / up to 3 URL buttons.
- **`{username}` personalization** — greet commenters by their @handle in messages and public replies.
- **Live debug panel** — watch every webhook → match → send step stream in real time while testing.

## 🛡️ Built to keep your Instagram account safe

This isn't a scraper or a browser bot — it uses the **official Instagram API** end-to-end, and the architecture enforces every platform rule:

| Rule | How it's enforced |
|---|---|
| 200 DMs/hour per account (Meta hard limit) | Atomic Postgres rate limiter capped at **180/hour** (rolling window, 20-DM safety buffer for your manual DMs) |
| 24-hour messaging window | Checked at webhook receipt **and** again before every send |
| One DM per person per trigger | `UNIQUE` constraints at the database level — duplicates are physically impossible |
| No bot-like bursts | Randomized 2–5s humanized delay before every send; sends are sequential, never parallel |
| Policy blocks (Meta error 368) | **Circuit breaker**: all sends for the account auto-pause for 24h instead of retrying into a ban |
| Meta-side rate limit errors (4/17/32/613) | Generous 15-minute backoff, no attempt burned |
| Webhook authenticity | HMAC-SHA256 signature verified over the raw body before *anything* else runs (accepts the Instagram **or** Facebook app-secret signature — Meta uses either depending on app type) |
| Token safety | Instagram tokens + your App Secret are AES-256-GCM encrypted at rest; auto-refreshed before their 60-day expiry |

**Build and test with zero waiting:** in Development mode your app already delivers real events for the
accounts on your app (you + testers you add) — so you can fully build, test and run automations within your
own circle immediately, no approval needed. When you want the **general public's** comments to trigger your
automations, submit Meta's free **App Review** once (a short screencast of your working flow — typically
approved in days). The in-app Setup Wizard walks you through both stages.

## 🏗️ Architecture

One Next.js app. No Redis, no worker servers, no message broker.

```
Instagram comment
      │
      ▼
Meta webhook ──► /api/webhook ── verify HMAC ── 200 OK to Meta (< 1s)
                                      │ after() — background of same invocation
                                      ▼
                          match keyword/post ─► job row in Postgres (job_queue)
                                      │
                                      ▼
                    engine claims job (FOR UPDATE SKIP LOCKED)
                    window check → dedup → rate limit → jitter → send DM
                                      │
              ┌───────────────────────┴─────────────────────┐
   sent instantly (95% case)              rate-limited / transient error
                                          → rescheduled with run_after
                                          → drained by pg_cron every minute
```

- **Supabase** is the entire backend: Postgres (data + job queue + rate limiter), Auth, Storage (card images), and pg_cron (background ticks).
- **Deploys identically** to Vercel (zero config) and Cloudflare Workers (via OpenNext).

## 🚀 Quick start

You need: a free [Supabase](https://supabase.com) account, a free [Vercel](https://vercel.com) or [Cloudflare](https://cloudflare.com) account, and a free [Meta developer](https://developers.facebook.com) account. Full walkthrough: **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

```bash
# 1. Clone + install
git clone https://github.com/YOUR_USERNAME/open-autodm && cd open-autodm
npm install

# 2. Create a Supabase project, then apply the schema
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# 3. Configure env
cp .env.example .env
#    → fill in the 6 values (each one is explained in the file)

# 4. Deploy
npx vercel            # …or: npm run cf:deploy  (Cloudflare)

# 5. Create your login in Supabase (Authentication → Users → Add user),
#    then open your deployment → sign in → follow the in-app Setup Wizard
```

**No register page, on purpose.** Access is invite-only: accounts exist only when the instance
owner creates them in the Supabase dashboard (and public signups are switched off there too).
Your instance, your guest list.

The **Setup Wizard** inside the app walks you through creating the Meta app, gives you the
exact webhook URL / verify token / redirect URI to paste into the Meta portal, and generates
the one SQL snippet that turns on the background engine. ~15 minutes total.

## 🧪 Testing your instance

See **[docs/TESTING.md](docs/TESTING.md)** for the full end-to-end test script
(local dev with a Cloudflare/ngrok tunnel, the debug panel event flow you should see,
and a troubleshooting table for every failure mode we've ever hit).

## 🔐 Security model

- The only secrets in your deployment env: Supabase keys, one encryption key, one cron secret.
- Meta App ID/Secret are entered in the UI and stored **AES-256-GCM encrypted** in your own DB.
- Instagram OAuth tokens: encrypted at rest, decrypted only at send time, never logged.
- Webhooks: HMAC-verified (timing-safe compare) before any processing.
- OAuth: CSRF-protected with signed, 10-minute state JWTs.
- Every API route authenticates the Supabase JWT; ownership is checked in SQL on every query.
- Row Level Security on every table, service-role isolation for engine tables.

## 📄 License

MIT — do whatever you want, no attribution required.

---

*open-autoDM automates your own Instagram account through Meta's official APIs, within Meta's
published rate limits and policies. You are responsible for your own account's compliance with
Instagram's Terms of Use.*
