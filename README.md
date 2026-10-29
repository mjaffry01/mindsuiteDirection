# MindSuite Direction

One application with two parts, sharing one server, one login and live updates:

- **365-day plan** (`/`): the director view of the whole company and a calendar
  for each of the 10 departments, by day, week, month or the full year.
- **Sales and marketing toolkit** (`/toolkit`): pipeline, proposals, paid
  assessments, leads and marketing spend, measured against the sales goals.

Right-click any department name (or use **What this department does** on a
department's panel) to see its definition, its KPIs with live values where the
app can measure them, its responsibilities and the services it delivers. All
176 services from the offerings catalogue are assigned to a department.

The two are connected: the Sales and Marketing department pages and the
director view in the plan show live numbers from the toolkit (open pipeline
against ₹10 Cr, win rate, proposal turnaround, paid assessments and leads),
with a link straight into the toolkit. Every change appears in all open
browsers within a second.

## Run it

Requires Node.js 18.18 or later.

```bash
npm install
npm start
```

Open http://localhost:3000. For development with auto-restart: `npm run dev`.
To run the tests: `npm test`.

## Settings

Put your settings in a file called `.env` in the app folder: copy
`.env.example` to `.env` and fill it in. The app reads it when it starts, and
`.gitignore` keeps it out of Git. You can also set the same names as
environment variables or as secrets in your hosting platform; those win over
the file.


| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DATA_DIR` | `./data` | Folder for `state.json` (plan ticks) and `toolkit.json` (sales records) |
| `APP_USERS` | not set | One account per rep, `Name:password` pairs separated by commas. Each rep then has their own **My AI** settings |
| `SECRET_KEY` | generated | Encrypts reps’ OpenRouter keys on disk. If not set, a random one is created in `data/.secret-key`; back it up with your data |
| `AI_ALLOW_USER_KEYS` | `1` | Set to `0` to allow only the company key |
| `APP_USER`, `APP_PASSWORD` | not set | If both are set, the app asks for this username and password (the public lead form stays open) |
| `LEAD_API_KEYS` | not set | Keys for webhooks and imports: `name:key:DefaultSource`, comma-separated. Keys must be 16+ characters. Example: `zapier:4f9c2e7a1b8d6e3f:LinkedIn,events:9a1e5c3d7b2f8e4a:Event` |
| `LEAD_FORM_ORIGINS` | not set | Websites allowed to post the enquiry form, comma-separated, e.g. `https://www.mindsuite.in,https://mindsuite.in` |
| `LEAD_NOTIFY_WEBHOOK` | not set | A Microsoft Teams or Slack incoming-webhook URL; every new lead is posted there |
| `LEAD_FORM_RATE_LIMIT` | `5` | Form submissions allowed per visitor address every 10 minutes |
| `OPENROUTER_API_KEY` | not set | Your OpenRouter secret key (starts with `sk-or-`). Turns on **Draft with AI** in the Outreach tab. Kept on the server only |
| `OPENROUTER_MODEL` | `openrouter/auto` | Which model drafts messages, as named on openrouter.ai/models (for example an Anthropic, OpenAI or Google model). `openrouter/auto` lets OpenRouter choose |
| `APP_URL` | not set | Your app’s public address; sent to OpenRouter so usage shows under your app’s name |
| `AI_RATE_LIMIT` | `20` | AI drafts allowed per minute across the whole server |
| `BRAVE_SEARCH_API_KEY` | not set | Optional. Lets the lead engine search Brave’s news index as well |
| `ENGINE_WEB_MODEL` | `OPENROUTER_MODEL` | Optional. A different OpenRouter model for the engine’s web searches |
| `ENGINE_MAX_PER_HUNT` | `8` | Search results the engine reads per hunt and region, which caps cost per run |
| `TRUST_PROXY` | not set | Set to `1` when running behind a proxy or load balancer, so rate limits see the real visitor address |

Always set `APP_USER` and `APP_PASSWORD` before putting the app on the internet.
Back up the `DATA_DIR` folder regularly; it holds all your data.

To deploy with Docker: `docker build -t mindsuite-direction .` then
`docker run -p 3000:3000 -v mindsuite-data:/data -e APP_USER=... -e APP_PASSWORD=... mindsuite-direction`.

## Outreach and AI drafting

The **Outreach** tab works like the sequencing tools in Apollo, Outreach or
HubSpot, for MindSuite’s own sales team:

- **Lead lifecycle:** every lead has a status (New, Contacted, Engaged,
  Qualified, Meeting booked, Converted or Disqualified, with a reason), an
  owner and an industry. The Leads tab has views such as Hot, Needs first reply
  and In a sequence, an owner filter, sorting by score, and a “reply overdue”
  flag when a new lead has waited more than 24 hours.
- **Fit and engagement scores:** the fit score (0–100) comes from the ideal
  client profile, including the target industries and priority regions you set
  under **Team and targets**. Engagement adds points for a connected call (10),
  a reply (15) and a booked meeting (20).
- **Sequences:** five ready-made cadences (inbound fast response, Gulf and India
  decision-makers, US and Europe tech leaders, event follow-up, re-engagement)
  spread touches across email, LinkedIn and calls. Each step appears in
  **Today’s outreach** on its day. A reply, a booked meeting or disqualifying
  the lead stops the sequence.
- **Templates and AI drafts:** each step comes with a template that fills in the
  lead’s details. With `OPENROUTER_API_KEY` set, **Draft with AI** writes a
  personalised version through OpenRouter, using only the facts on the lead and
  marking anything to check in [square brackets]. Nothing is sent automatically:
  the salesperson copies the message into email or LinkedIn.
- **Activity log and targets:** every touch is logged against the lead, and the
  tab tracks touches today against 25 per salesperson.

**Getting an OpenRouter key:** create an account at openrouter.ai, add credit,
and create a key under Keys. Set it on the server only, for example
`OPENROUTER_API_KEY=sk-or-... npm start`, or as a secret in your hosting
platform. Never put it in the browser code, in `data/`, or in Git. The browser
asks the MindSuite server for a draft, and the server calls OpenRouter.
`GET /api/ai/status` shows whether drafting is on and which model is used, but
never the key.

## My AI: each rep’s own model and key

In the toolkit’s **My AI** tab, each signed-in rep can:

- **Save their own OpenRouter key.** It’s encrypted (AES-256-GCM) before it’s
  written to `data/ai-settings.json`, never sent back to any browser (the page
  only shows its last four characters), never logged, and used only for that
  rep’s own requests. Usage is billed to the rep’s OpenRouter account.
- **Choose two models** from OpenRouter’s live model list, with prices: one for
  writing messages (**Draft with AI** in Outreach) and one for research
  (**Run now** in the Lead engine). Empty boxes use the company defaults.
- **Test** either model with one tiny request.

Reps without a key use the company key (`OPENROUTER_API_KEY`) if there is one.
Automatic, scheduled lead engine runs always use the company key. For each rep
to have private settings, set up sign-in with `APP_USERS`; without sign-in,
everyone shares one set of settings.

## Lead engine

The **Lead engine** tab is an agent that keeps looking for new prospects and
hands them to your reps, in the way signal-based tools such as Apollo, Clay or
ZoomInfo do.

**How a run works**

1. **Search.** For each active *hunt* (for example “ERP projects and tenders in
   the Gulf and India”), the engine searches its sources: web search through
   OpenRouter, Brave News Search if you add a key, and any RSS feeds you list,
   such as industry news sites, tender portals and press-release feeds.
2. **Read and judge.** An AI model (through your OpenRouter key) reads the
   results and picks out companies with a real buying signal: a tender, an AI or
   digital programme, new funding, expansion, tech hiring, new regulation, a new
   tech leader or a partnership. It writes one line on what happened and one on
   why to call now, and suggests job titles to approach. It may only use what
   the sources say, and each prospect must link to its evidence.
3. **Check.** Prospects outside your regions, below 40% confidence, without
   evidence the search actually returned, or already known (an existing lead, or
   a prospect from the last 180 days) are dropped.
4. **Score and route.** Each prospect is scored from 0 to 100 on region,
   industry, department fit, signal type, signal strength and how recent it is,
   then assigned to the rep who covers its region, or shared evenly between reps.
5. **Review.** Reps see their prospects in the Lead engine tab, best first. They
   **accept** one into a lead, optionally starting an outreach sequence, or
   **reject** it with a reason. Recent rejections are given to the AI on the next
   run so it stops suggesting similar companies.

Set **Search automatically** to run every hour, 3, 6 or 12 hours, or daily, or
select **Run now**. Each run is logged under **Engine runs**, including any
source that failed. With `LEAD_NOTIFY_WEBHOOK` set, a Teams or Slack message
says how many prospects each rep has waiting.

**What it doesn’t do.** It finds companies and the reason to contact them, not
people’s personal details. It doesn’t scrape LinkedIn or other sites that
forbid it. Reps find the right person through LinkedIn Sales Navigator or a
contact database you’re licensed to use, and nothing becomes a lead until a
rep accepts it. Follow each region’s data protection rules.

**Costs.** Every run makes AI calls through OpenRouter: one per hunt and source
(web search costs a little more per request). Five hunts every 6 hours is about
20 runs a day. Watch usage on your OpenRouter dashboard, and lower the
frequency, the number of active hunts or `ENGINE_MAX_PER_HUNT` to control it.

Web search uses OpenRouter’s web plugin (`plugins: [{"id": "web"}]`) and reads
the cited sources from `message.annotations`. If OpenRouter changes how this
works, update `webDiscover` in `src/engine.js`, or turn web search off and use
Brave or RSS feeds instead.

## Lead generation API

Leads can reach the toolkit automatically, without anyone typing them in. Every
route runs the same steps: check the details, work out the region from the
country or phone number, score the lead from 0 to 100 against the ideal client
profile, merge it into an existing lead if it’s a duplicate (same email, or the
same company and region within 180 days), save it, and post a notification if
`LEAD_NOTIFY_WEBHOOK` is set. A score of 60 or more marks the lead “check” in
the Leads tab; a person still confirms it and ticks Qualified.

**1. Website enquiry form.** Paste this on any page of mindsuite.in, and list
the site in `LEAD_FORM_ORIGINS`:

```html
<div data-mindsuite-lead-form data-source="Website" data-interest="Applied AI"></div>
<script src="https://YOUR-SERVER/embed/lead-form.js" async></script>
```

A ready-made page is at `/forms/contact`. Add `?source=LinkedIn` (or Webinar,
Event and so on) to links you share, and UTM tags are recorded too. The form
asks for consent, and is protected by a hidden honeypot field, a minimum fill
time and a per-visitor rate limit.

**2. Webhooks** for Zapier, Make, LinkedIn lead forms (through Zapier or Make),
event apps and partners. Send JSON with an `X-API-Key` header:

```bash
curl -X POST https://YOUR-SERVER/api/webhooks/leads \
  -H "X-API-Key: 4f9c2e7a1b8d6e3f" -H "Content-Type: application/json" \
  -d '{"name":"Aisha Khan","email":"aisha@gulfbank.ae","company":"Gulf Bank","title":"Head of Digital","country":"AE","interest":"Applied AI"}'
```

Send an array to add up to 100 at once. When a booking tool schedules a call,
post `{"email": "...", "scheduledAt": "..."}` to `/api/webhooks/meetings` to
tick Meeting on that lead (it’s created if new).

**3. CSV import** for event contact lists and outbound research:

```bash
curl -u user:password -H "Content-Type: text/csv" --data-binary @gitex.csv \
  "https://YOUR-SERVER/api/leads/import?source=Event"
```

Columns: `company, contact, title, email, phone, country, region, source,
interest, timeline, employees, message, notes, externalId`. Up to 2,000 rows per
file; the reply lists how many were created, merged as duplicates, or rejected.

**Also:** `GET /api/leads/export.csv` (all leads, safe to open in Excel),
`GET /api/leads/stats?days=30` (counts by source, region and score),
`POST /api/leads/score` (score a lead without saving it), and the full
reference at `GET /api/leads/openapi.json`.

The API captures, imports and scores leads; it doesn’t scrape websites or
LinkedIn. Only add people who have contacted you, opted in, or are a legitimate
business contact, and follow the data protection rules of each region (such as
GDPR in Europe).

## Project layout

```
server.js             starts the server
src/app.js            Express app and all API routes
src/plan.js           plan task ids, progress and date helpers
src/toolkit.js        toolkit validation rules, goals and summary numbers
src/leads.js          lead scoring, region detection, duplicates, CSV
src/leadsApi.js       lead generation API routes
src/leadsOpenapi.js   OpenAPI description of the lead API
src/outreach.js       statuses, sequences and message templates
src/ai.js             AI drafting through OpenRouter (server side)
src/engine.js         the lead engine: hunts, sources, AI judging, scoring, routing, scheduler
src/secrets.js        encryption for reps’ saved keys
src/store.js          saves data to JSON files safely
data/plan.json        the full 365-day plan: tasks, departments, targets
public/index.html     the 365-day plan page (app.js, styles.css)
public/toolkit.html   the toolkit page (toolkit.js, toolkit.css)
public/nav.css        the shared navigation bar
public/deptdef.*      the department definition card (right-click)
public/embed/         the embeddable website lead form
public/forms/         the hosted contact page
test/api.test.js      API tests
```

## Editing the plan

All tasks, departments, monthly targets and quarter goals are in
`data/plan.json`. Each day has `t` (tasks as `[owner, text, departmentId]`),
`s` (₹20 Cr stretch tasks, same format) and `min` (whether the daily minimums
apply). Ticks are stored by task position within each day, so add new tasks at
the end of a day's list to keep existing ticks in place.

Department definitions, KPIs and services are in `deps` in `data/plan.json`
(each department's `def`).

Sales goals (₹10 Cr pipeline, 25% win rate, 3-day turnaround, 20 assessments,
220 leads) are in `GOALS` at the top of `src/toolkit.js`.

## API

**365-day plan**

| Method and path | What it does |
|---|---|
| `GET /api/plan` | The full plan |
| `GET /api/state` | Start date and ticked task ids |
| `PUT /api/tasks/:id` | Body `{"done": true}` or `{"done": false}` |
| `PUT /api/state/start` | Body `{"start": "YYYY-MM-DD"}`; snaps to that week’s Monday |
| `GET /api/tasks?day=12&dept=sales` | Tasks with their done status, optionally filtered |
| `GET /api/progress` | Totals, plus done and overdue counts per department |
| `GET /api/departments` | Each department’s definition, KPIs, goals and the services it delivers |

**Sales and marketing toolkit** — collections: `deals`, `proposals`,
`assessments`, `leads`, `spend`

| Method and path | What it does |
|---|---|
| `GET /api/toolkit` | All records |
| `GET /api/toolkit/summary` | Pipeline, win rate, turnaround, assessments and leads against goals |
| `POST /api/toolkit/:collection` | Create a record (validated; unknown fields are dropped) |
| `PUT /api/toolkit/:collection/:id` | Replace a record |
| `DELETE /api/toolkit/:collection/:id` | Delete a record |

**Outreach**

| Method and path | What it does |
|---|---|
| `GET /api/outreach/library` | Lead statuses, activity types, sequences and templates |
| `GET /api/settings/sales`, `PUT /api/settings/sales` | Team members, target industries and priority regions (saving re-scores every lead) |
| `GET /api/ai/status` | Whether AI is on for the signed-in rep, which models, and whether their own key or the company key is used |
| `GET /api/ai/settings`, `PUT /api/ai/settings` | The rep’s own models and key (`{"apiKey": "sk-or-..."}` to save, `null` to remove). The key is never returned |
| `POST /api/ai/test` | Test the rep’s writing model, or `{"which": "research"}` |
| `GET /api/ai/models` | OpenRouter’s model list with prices per million tokens |
| `GET /api/me` | Who is signed in |
| `POST /api/ai/draft` | Body `{"leadId": "..."}`; drafts the message for the lead’s current sequence step |
| `GET /api/engine`, `PUT /api/engine` | Lead engine status, settings, hunts, sources and recent runs |
| `POST /api/engine/run` | Run the engine now (add `?wait=1` to wait for the result) |
| `POST /api/prospects/:id/accept` | Turn a prospect into a lead; body `{"sequence": "gulf", "owner": "Ravi"}` is optional |
| `POST /api/prospects/:id/reject` | Body `{"reason": "Too small for us"}` |
| `POST /api/prospects/:id/assign` | Body `{"owner": "Sara"}` |

**Shared**: `GET /api/events` (live updates), `GET /healthz` (health check).

## Putting it on GitHub and publishing it

**1. Create a private repository.** On github.com select **New repository**,
name it `mindsuiteDirection`, choose **Private** (the plan in
`data/plan.json` is your company strategy), and don’t add a README or licence.

**2. Upload the code.** Either drag the contents of this folder onto the new
repository’s page (**uploading an existing file**), or use Git:

```bash
cd mindsuiteDirection
git init -b main
git add .
git commit -m "MindSuite app"
git remote add origin https://github.com/YOUR-NAME/mindsuiteDirection.git
git push -u origin main
```

`.gitignore` keeps `.env`, `node_modules` and everything saved in `data/`
(apart from the plan) out of GitHub. The **Tests** workflow in
`.github/workflows/ci.yml` runs the tests on every push; check the **Actions**
tab for a green tick.

**3. Publish it from GitHub (Render).** At render.com, sign in with GitHub,
select **New**, then **Blueprint**, and pick the repository. Render reads
`render.yaml`, creates the web service with a 1 GB disk for your data, and asks
for the secret values: at least `APP_USERS` (one `Name:password` per rep) and,
if you want a company-wide AI key, `OPENROUTER_API_KEY`. `SECRET_KEY` is
generated for you. Render then gives you an address like
`https://mindsuite-direction.onrender.com`; add your own domain under **Settings**,
**Custom domains**, and set `APP_URL` to it. Every push to `main` redeploys.

The app keeps its data in files, so it needs a host with a **persistent disk**
(a paid feature on most hosts, including Render). Railway, Fly.io and Azure App
Service also work: use the `Dockerfile`, mount a volume, and point `DATA_DIR`
at it. Don’t use GitHub Pages: it only serves static pages, so the server,
sign-in, AI and lead engine wouldn’t work.

**Backups:** download the disk’s contents regularly (Render has disk
snapshots), especially `toolkit.json`, `state.json`, `ai-settings.json` and
`.secret-key`.

## Moving to a database later

Data is kept in two JSON files, which suits one server and a small team. If you
run several server instances, need history of who changed what, or expect many
thousands of records, replace `src/store.js` with a database such as PostgreSQL
or SQLite, keeping the same `load`, `get` and `update` methods.
