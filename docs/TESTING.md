# Testing Guide — open-autoDM

How to prove your instance works end-to-end, and what to do when it doesn't.

> Prerequisite: you finished [SELF_HOSTING.md](SELF_HOSTING.md) — deployed, wizard complete,
> webhook verified in the Meta portal, cron scheduled, Instagram connected.

---

## The end-to-end test (5 minutes)

### 1. Turn on the debug panel

Add env var `NEXT_PUBLIC_DEBUG=true` to your deployment and redeploy.
The **Automations** page now shows a live-streaming event log at the bottom.

### 2. Create a test automation

- **Automations → New Automation → Comment to DM**
- Select a real post on your account (or "Trigger on All Posts")
- Keywords → *Specific Keywords* → add `TEST`
- Keep the default opening message + the "Send me the link" button
- Add one **Text Message** response containing any link
- Click **Activate**

### 3. Trigger it

From a **different** Instagram account (a friend's account, or a secondary account added as a
tester on your Meta app), comment on that post:

> `TEST`

⚠️ Comments from your own connected account are deliberately ignored (self-trigger guard) —
you need a second account.

### 4. What you should see (within ~15 seconds)

Debug panel event sequence:

```
webhook   webhook_received      PROCESSING
webhook   signature_check       OK
webhook   ig_account_lookup     OK
webhook   comment_event         PROCESSING
webhook   automations_fetch     OK
webhook   keyword_match         OK
webhook   job_enqueued          OK
worker    job_started           PROCESSING
worker    window_check          OK
worker    dedup_check           OK
worker    rate_limit_check      OK
worker    session_create        OK
instagram comment_reply_sent    OK       ← public reply appears under the comment
instagram dm_sent               OK       ← opening DM lands in their inbox
worker    job_completed         OK
```

On Instagram (the commenter's side):
1. A public reply appears under their comment (random pick from your reply list).
2. A DM arrives with your opening message + the button.
3. They tap the button → your response(s) with the link arrive (after the ask-to-follow card, if enabled).

The automation card's **Total DMs Sent** counter increments.

### 4b. Test DM + story-reply triggers

- **DM keyword:** create a **DM Auto Reply** automation with keyword `DIET` and a response containing your resource link → from the second account, send `DIET` as a normal DM to your account → the auto-reply (with a tappable link button) arrives within seconds. Debug panel shows `dm_event → keyword_match → job_enqueued → dm_sent`.
- **Story reply:** post a story on your connected account → create a **Story Reply** automation with keyword `DIET` → from the second account, reply `DIET` to the story → debug panel shows `story_reply_event → keyword_match → ... → dm_sent` and the resource arrives in their DMs.
- Story replies and plain DMs are routed separately: a story reply only fires Story Reply automations, a plain DM only fires DM Auto Reply automations — the same word never triggers both.

### 5. Verify the safety rails

- Comment `TEST` **again from the same account** → debug shows `dedup_check SKIPPED` — no second DM. ✅
- Comment from your own connected account → `comment_event SKIPPED (self)`. ✅
- Hit `https://YOUR_APP/api/cron/process-jobs` with header `Authorization: Bearer YOUR_CRON_SECRET` → returns `{"ok":true,...}`. ✅

---

## Local development testing

Meta needs a public HTTPS URL, so local testing uses a tunnel:

```bash
# Terminal 1
cp .env.example .env         # point NEXT_PUBLIC_SUPABASE_URL etc. at your cloud Supabase
npm run dev

# Terminal 2 — either:
npx cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```

Take the tunnel URL and:
1. Set it as `NEXT_PUBLIC_APP_URL` in `.env`, restart `npm run dev`.
2. Update the Meta portal **Callback URL** to `https://<tunnel>/api/webhook` (re-verify) and
   the **OAuth redirect URI** to `https://<tunnel>/api/instagram/callback`.
3. Run the same end-to-end test above.

Remember to switch the portal URLs back to your production deployment afterwards.

---

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| Meta portal says webhook verification failed | Verify token mismatch → copy it fresh from the Setup Wizard; make sure the URL is exactly `/api/webhook` with no trailing slash. Setup must be **saved** first (the token is generated on save). |
| Comment triggers nothing, debug panel completely silent | Meta isn't delivering webhooks. ① The commenter must not be the connected account itself. ② In dev mode, only comments from the app admin/testers' accounts generate events — add your second account as a tester and **accept the invite inside the Instagram app**. ③ Click **Fix Webhooks** then **Check Status** in Settings — you need `✓ comments`. |
| `signature_check ERROR` in debug panel | Wrong App Secret saved in the wizard → re-copy it from Meta portal → App settings → Basic → "Show". |
| `ig_account_lookup SKIPPED` with `entry.id=0` | You used the Meta portal's "Test" button — it sends fake data by design. Use a real comment. |
| OAuth shows "Invalid platform app" | You saved the parent Meta app's ID from App settings → Basic. Instagram login needs the **Instagram app ID/secret** from *Instagram → API setup with Instagram login → Business login* — re-save them in the wizard. |
| OAuth fails with "redirect_uri not identical" | 90% of the time this actually means **wrong App Secret** (Meta's error is misleading). Otherwise: the redirect URI in the portal must match the wizard's value character-for-character. |
| OAuth error `access_denied` | You declined a permission — reconnect and approve everything. |
| DM never arrives but `comment_reply_sent OK` | Check debug for `dm_send_failed` — code 190 = expired token (reconnect), code 10/200 = missing `instagram_business_manage_messages` permission (reconnect and approve all scopes). |
| `rate_limit_check SKIPPED ... delayed` | Working as intended — you sent 180 DMs this hour; the job auto-sends when the window frees up (needs the pg_cron from Setup Step 4). |
| Account shows "Safety pause active" | Meta returned a policy block (error 368). The circuit breaker paused sends for 24h to protect your account. Slow down trigger volume; sends resume automatically. |
| Jobs stuck `pending` in `job_queue` table | pg_cron isn't running → re-run the wizard's SQL snippet; check `select * from cron.job_run_details order by start_time desc limit 5;` for HTTP errors (wrong CRON_SECRET or wrong URL). |
| Everything worked, then died ~60 days later | Token expired without refresh → the cron wasn't scheduled. Reconnect Instagram, then complete Setup Step 4. |

## Where to look when debugging

- **Debug panel** (Automations page, `NEXT_PUBLIC_DEBUG=true`) — every step of every event.
- **Supabase → Table Editor** — `job_queue` (queue state), `dm_jobs` (send audit), `dm_sent_log` (dedup), `debug_events` (raw event log).
- **Deployment logs** — Vercel → Functions logs / `npx wrangler tail` — structured JSON lines from every request.
