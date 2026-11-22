# Roadmap: water, weather, market and jobs

Seven chunks, built in this order. Each chunk ships backend (FastAPI, tested with pytest) and screens (React), and is checked in a real browser before the next one starts.

## Decisions

- **Weather source: Open-Meteo.** No API key, hourly and 16-day forecasts, and it returns the FAO-56 reference evapotranspiration (ET0) that the water-need maths needs. Its free tier is for non-commercial use, so check their terms (or buy their API plan) before Aqua is sold.
- **Water-need method: FAO-56.** Crop need in mm per day is Kc x ET0, minus effective rain, divided by the irrigation efficiency. Litres are mm x plot area in square metres.
- **Soil type** sets the irrigation efficiency (sandy soils lose more to drainage) and the water the soil holds, which gives the refill interval.
- **Livestock** drinking water uses a per-head table by species, with a heat uplift when the day is hot. These are planning estimates and are labelled as such.
- **Market and jobs are cross-farm.** Any logged-in user can browse. Posting needs the manager role or higher on the farm. Contact happens inside the app (inquiries and applications), so no phone numbers are published.
- **Photos** are uploaded as base64 JSON (no new dependency), checked by file signature, stored on disk with random names and served from `/uploads`.
- **Sample data** uses fictional farmers, farms and businesses, and clearly separate demo accounts. No real people or phone numbers.

## Chunks

### 1. Water sources (tanks, wells, network)
- Backend: `WaterSource` (kind: tank, well, borehole, rain_tank, network, canal; name; capacity in litres; current level in litres; refill per day in litres; notes; updated time). CRUD, manager and above create and edit, technician and above update the level, viewer reads.
- UI: new rail page **Water** with a "My water" tab: source cards with level bars, add/edit dialog, quick "update level" control, total stored and total refill per day.
- Done when: a farmer can list a tank and a well, update the levels, and see the totals.

### 2. Weather and forecast
- Backend: `GET /api/farms/{id}/forecast` from Open-Meteo: current conditions, next 48 hours hourly, 7 days daily (min and max temperature, rain mm and chance, wind, ET0), with a short cache. Alerts: heat, frost, strong wind, heavy rain.
- UI: new rail page **Weather**: current card, hourly chart, 7-day cards, alert banners. The dashboard weather card links to it.
- Done when: the page shows a real forecast for the farm location and alerts for extreme days.

### 3. Soil, livestock and the water-need calculator
- Backend: `Plot.soil_type`; `Livestock` (species, count); `GET /api/farms/{id}/water-balance` returning demand per plot and per species for today, 7 days, 30 days and a year (using forecast ET0 and rain for the near term and typical values beyond), supply from sources, days of water left, surplus or shortfall, and a plain-language verdict ("You will need about 12 m3 more this week").
- UI: Water page tabs **Needs** (breakdown, week/month/year switch, verdict card) and **Animals** (add and edit herds). Soil type field added to the plot dialog.
- Done when: changing a crop area, soil type or herd changes the numbers, and the verdict says whether more water is needed.

### 4. Water market
- Backend: `WaterListing` (farm, title, description, litres available, price per m3 or free or negotiable, water source type, quality notes, fulfilment: pickup, delivery or both, available from and until, governorate, address text, coordinates, up to 5 photos, status), `ListingInquiry` (listing, sender, message, status). Upload endpoint for photos. Public browse for any logged-in user with filters.
- UI: rail page **Market**: listing grid with photo, litres, price, fulfilment chips, location and distance from my farm; search and filters; listing detail with gallery, description and an OpenStreetMap link; contact form; **My listings** tab to create, edit, pause and delete, and an inbox of inquiries. The Water page suggests "List your surplus" when there is a surplus.
- Done when: one farmer lists surplus water with photos and another farmer finds it and sends an inquiry the owner can read.

### 5. Hiring portal
- Backend: `JobPost` (farm, title, description, kind: task, period or long_term, start and end dates, pay amount and unit or negotiable, workers needed, skills, governorate, address text, status), `JobApplication` (job, applicant, message, status). Browse, apply, manage.
- UI: rail page **Jobs**: search and filters (kind, governorate), detail with Apply, **My posts** tab with applicants to accept or decline, and a "Create job" dialog.
- Done when: a farmer posts a one-day task and a long-term job, and another user applies and gets accepted.

### 6. Sample data
- A repeatable seed script creating about eight demo farmers with realistic farms, water sources, plots, herds, market listings with photos and job posts, plus a few inquiries and applications. Photos come from Wikimedia Commons with a credits file.
- Done when: the Market and Jobs pages look populated and believable on a fresh database.

### 7. Integration and polish
- Rail grouped into "My farm" and "Community"; the dashboard links to Water and Weather; the chat advisor also receives the water balance, sources and forecast; README and VPS notes updated; full browser pass on desktop and phone.
