# VitalOS — Your Personal AI Health Dashboard

Single-user health dashboard. Export your data from the Health app, hit
**Import Apple Health**, and your real numbers appear on the dashboard —
steps, heart rate, sleep, weight, SpO2, calories, hydration, and recent
workouts, all pulled straight out of Apple's own export. Click any metric
for a detail popup with a 14-day trend.

## Architecture

- `client/` — Vite + React 19 + Tailwind v4, single page (`src/App.jsx`).
  Parses `export.zip`/`export.xml` **entirely in the browser** (regex-based
  streaming parser, not a full DOMParser — handles multi-year exports
  without freezing the tab), then bulk-uploads the aggregated daily numbers
  to the backend.
- `server/` — Express + MongoDB Atlas (free M0 tier). Stores one document
  per day in `daily_records` plus a `workouts` collection. Bulk import
  endpoints use `bulkWrite` so importing years of history is a handful of
  round-trips, not thousands.

This replaces the earlier screenshot-upload flow: Apple's XML export
already contains real structured numbers, so there's no OCR step needed —
unlike a photo of a screen, which still can't be read into numbers without
extra work. The screenshot upload API is still there on the server
(untouched, still tested) in case you want it again later, but the
dashboard's primary flow is now the XML import.

## Why MongoDB instead of the single HTML file

You tried the one-file version and it was too bare-bones for what you
wanted — detail popups with real trends, workouts, etc. need somewhere to
keep history beyond one browser's local storage, and a proper backend
makes that data available from more than one device. Same MongoDB-only
storage decision as before (no Cloudinary) — now storing tiny daily
aggregates instead of images, so the 512MB free-tier ceiling isn't a
concern for a very long time.

## Running it

**Backend**
```bash
cd server
cp .env.example .env   # fill in your MongoDB Atlas connection string
npm install
npm run dev
```

**Frontend**
```bash
cd client
cp .env.example .env   # point VITE_API_URL at your server (defaults to localhost:5000)
npm install
npm run dev
```

Open the printed local URL. Click **Import Apple Health**, drop in your
`export.zip` (no need to unzip it — that happens in the browser), and the
dashboard fills in with your real data. Click any stat card for its detail
view.

## Getting your export

Health app → tap your profile picture (top right) → **Export All Health
Data** → AirDrop or save `export.zip` to whatever device you're using
VitalOS from.

## What's computed vs. what's raw

- **Steps, distance, calories, exercise minutes, heart rate, SpO2, weight,
  BMI, hydration** — summed/averaged straight from Apple's records, no
  guesswork.
- **Sleep duration/deep/REM/light** — summed from Apple's sleep analysis
  records, bucketed to the day you woke up (matching how the Health app
  itself groups a night's sleep).
- **Sleep Score** — the one number on this dashboard that's *not* raw
  Apple data. It's a simple estimate (duration vs. an 8-hour target) since
  Apple doesn't hand you a recovery/readiness score the way Whoop or Garmin
  do. Labeled "(est.)" everywhere it shows up, on purpose.

## API surface (server)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/records` | list records (optional `?from=&to=`) |
| GET | `/api/records/:date` | one day's record |
| POST | `/api/records/:date` | manually set/update a day's metrics |
| PATCH | `/api/records/:date/notes` | update just the notes |
| DELETE | `/api/records/:date` | delete a day |
| DELETE | `/api/records` | wipe everything |
| **POST** | **`/api/import/records`** | **bulk upsert from Apple Health import** |
| **POST** | **`/api/import/workouts`** | **bulk upsert workouts from import** |
| **GET** | **`/api/workouts?limit=`** | **recent workouts** |
| GET | `/api/reports?period=&date=` | simple period averages |
| POST/GET/DELETE | `/api/screenshots*` | still present from the earlier build, unused by the current UI |

## Not built yet
- AI-generated daily reports (the `aiReport` field exists on the schema
  and stays `null` until then)
- Re-import merge conflicts beyond simple upsert (importing the same
  export twice just overwrites matching days — safe, but not smart about
  partial/incremental exports yet)
- Editing metrics by hand from the UI (currently API-only via POST)
