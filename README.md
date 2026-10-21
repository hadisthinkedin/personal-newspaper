# The Daily Bread

A one-page personal morning newspaper built with Next.js. The edition is designed to be read straight through: verified wire reporting first, explicitly labeled political framing second, then Michigan and local news, people to track, technology, Screen & Cinema, and measurable good news.

## Editorial design

- **Global Headlines** and **National Headlines** begin with AP and Reuters reporting discovered through publisher-constrained Google News feeds because stable public direct feeds are not available.
- Each wire headline is paired only with topically matched CNN and Fox News Digital coverage inside the same narrative. CNN is labeled as left-leaning framing and Fox as right-leaning framing; unmatched partisan reports are not forced into the comparison.
- **Michigan and local desks** prioritize direct nonprofit and local feeds from Bridge Michigan, Michigan Public, Michigan Advance, BridgeDetroit, WDET, Lansing City Pulse, and East Lansing Info. Google News fills specific Warren/Macomb and Lansing/MSU gaps.
- **People to track** watches Abdul El-Sayed and Zohran Mamdani across reporting without implying endorsement.
- **Technology** uses direct feeds from The Verge, Ars Technica, and TechCrunch.
- **Screen & Cinema** uses movie-specific feeds from Variety, Deadline, and The Hollywood Reporter plus tightly filtered official Apple and Disney feeds. It keeps material Hollywood-movie developments such as casting, production, directing, distribution, releases, franchises, and studio business while excluding television, celebrity profiles, awards chatter, and non-Hollywood industries.
- **Meaningful Good News** is limited to measurable health, science, funding, treatment, and public-interest progress from FDA, WHO, and UNICEF sources.

Feed descriptions are sanitized and article text is cleaned before being shaped into sourced long-form summaries. Every story links onward to its publisher, directly when the feed permits it or through the clearly disclosed Google News discovery layer.

## Date-bounded editions and archive

- Every edition is bounded to one `America/Detroit` calendar day using the publisher/feed publication timestamp. Undated items and items from other calendar days are excluded.
- `/` shows only today's edition. `/?edition=yesterday` shows only yesterday's edition; the reader UI intentionally exposes no older-edition browser.
- At 06:15 UTC each day, `.github/workflows/archive-yesterday.yml` validates yesterday's API payload and commits it to the repository's orphan `editions` branch as `YYYY-MM-DD.json`.
- Archive JSON is never retained in the `main` working tree. Vercel reads yesterday's immutable snapshot from GitHub's raw-file endpoint, while the `main` branch remains the deployment source.
- If the newest snapshot has not been committed yet, the server builds a strictly date-filtered yesterday fallback from the feeds; the next archive run persists it remotely.

## Refresh behavior

- Feed requests run independently with 10-second timeouts, so one publisher cannot break the edition.
- Next.js caches feed results for 15 minutes and serves stale data while revalidating.
- `vercel.json` schedules `/api/refresh` every day at 10:00 UTC to invalidate and warm the edition.
- A reader can request a fresh cached edition with the **Refresh edition** button.
- If `CRON_SECRET` is configured in Vercel, `/api/refresh` requires `Authorization: Bearer <CRON_SECRET>`; Vercel Cron supplies it automatically.

Official and campaign sources establish that an announcement was made. They are not treated as independent validation of every claim. Google News query feeds are a discovery fallback and can occasionally return imperfect matches; direct publisher feeds are preferred whenever available.

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

Playwright uses the locally installed Google Chrome because Playwright's bundled Chromium no longer supports macOS 12.

## Public endpoints

- `/` — today's Detroit-calendar edition
- `/?edition=yesterday` — yesterday's Detroit-calendar edition
- `/api/news` — today's normalized articles and per-source health
- `/api/news?edition=yesterday` — the GitHub-backed yesterday snapshot (or a strict same-day fallback before archival)
- `/api/refresh` — daily cache invalidation and warming endpoint
