# Aqua: smart farm water assistant

Hackathon project for Kizuna 2026 (21 to 22 November 2026, Esprit Bloc E, teams of 2 to 4, prizes 4000 / 2000 / 1000 TND). Theme: water, energy and food. Target users: Tunisian farmers.

Source material from the 20 November sessions:

- Ideas, software plan, roadmap, checklist, walkthrough website: `~/our idea/`
- Working scaffold (backend, frontend, firmware, compose): `~/our idea/project/`
- Desktop and Android wrappers: `~/our idea/app/`
- Hardware step by step PDF with wiring and ESP32 code: `~/smart-watering-guide.pdf`
- Hackathon site copy: `~/kizuna2026/`

## 1. What the project should be

A farm assistant that knows the soil, the weather and the crop, and decides when and how much to water.

Core logic (the heart of the demo):

| Situation | Action |
|---|---|
| Tank empty | Block the pump, raise an alarm |
| Soil dry and rain is forecast | Skip watering, count the water saved |
| Soil dry and no rain | Short pump dose |
| Soil very dry | Tiny emergency dose |

Feature groups, by priority:

- Must: soil and tank sensors with a live dashboard, rain-aware decision, crop dropdown (popular Tunisian crops) with per-crop water calculation, water saved counter.
- Should: water budget calculator (week, month, year, per source: SONEDE, well, rain tank), WhatsApp alerts, chatbot specialised in Tunisian farming (Derja, French, English, with voice), farm visualiser with coloured plots.
- Could: solar panel calculator, season changing UI (the interface changes with the season).
- Maybe: satellite NDVI map, heat and drought warning, planting advisor, pest and fertiliser calendar, leak detection, weekly PDF report, offline mode, cooperative multi-farm view.
- Later: neighbour water market (premium, needs a legal check, show as a mock screen).

Extra software adds that need no hardware: photo plant doctor, WhatsApp as the main interface, weekly smart schedule with a reason per decision, litres and dinars saved counter, simulation sliders, demo data generator.

Accessibility: the farmer can talk to the chatbot with voice.

## 2. Architecture and stack

| Layer | Choice |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind, Recharts, Leaflet, i18next with RTL |
| Backend | FastAPI (Python), SQLAlchemy |
| Database | PostgreSQL in Docker on the VPS (SQLite in dev) |
| Sensors | ESP32 posts over HTTP every 15 minutes |
| Live updates | WebSocket or SSE from FastAPI |
| Weather | Open-Meteo (free, no key) |
| Chatbot | Open model served on our GPU server (gpu.mavubo.com) through an OpenAI compatible API, with vision for the plant doctor |
| Voice | Whisper for speech to text |
| WhatsApp | Twilio sandbox for the demo, Meta Cloud API later |
| Deploy | Docker Compose on the VPS behind Nginx Proxy Manager with https |
| Auth | JWT |
| Apps | Electron (desktop), Capacitor (Android) |

Rules: the apps always talk to the API, never directly to the database. Do not use Next.js, Flutter or React Native.

Hardware (from the owned inventory): ESP32, capacitive soil moisture sensor V1.2, HC-SR04 ultrasonic sensor for tank level (ECHO through a divider of 2 x 1k ohm), water sensor module as rain detector, 5V relay, mini DC water pump with its own power supply, LEDs with 330 ohm resistors, buzzer. The Arduino Uno is not used because it has no Wi-Fi. Still needed: silicone tube, a tank, a breadboard and wires.

Repo layout:

```
backend/    FastAPI + SQLAlchemy + Alembic
frontend/   React + Vite
firmware/   ESP32 sketch
docker-compose.yml   api + postgres
```

## 3. Folders and how to run it

```
site/      product home page (static, open index.html)
backend/   FastAPI API with login and roles
web/       login page and dashboard (React, Vite, TypeScript, Tailwind, Lucide)
firmware/  ESP32 sketch
design/    reference images the pages follow
```

Run the dashboard locally:

```
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py && .venv/bin/uvicorn app.main:app --port 8000
cd web && npm install && npm run dev        # http://127.0.0.1:5173
```

The dashboard draws the farm from the plots the farmer enters: each plot gets a share of the map proportional to its area, and plots with a warning (dry soil, low tank, waiting for rain) get a glowing marker and a note on the plot.

### AI models on the GPU server

All AI features (the chat advisor, reading CVs, reading farm drawings, the plant doctor) call a language model hosted on our GPU server, `gpu.mavubo.com`, through an OpenAI compatible API (`POST /v1/chat/completions` with a JSON schema for structured answers). The backend settings are:

```
LLM_API_URL=https://gpu.mavubo.com/v1
LLM_API_KEY=            # only if the server asks for a key
LLM_MODEL=qwen2.5vl:7b  # the model name exactly as the server lists it
```

Serve the models with Ollama (simplest) or vLLM. Models to download on the GPU server:

| Use | Model | Pull command (Ollama) | VRAM, about |
|---|---|---|---|
| Default: chat, CVs, drawings, plant photos (text and images) | Qwen2.5-VL 7B Instruct | `ollama pull qwen2.5vl:7b` | 8 GB |
| Better quality, same features, if the GPU has room | Qwen2.5-VL 32B Instruct | `ollama pull qwen2.5vl:32b` | 24 GB |
| Text only, small GPU | Llama 3.1 8B Instruct | `ollama pull llama3.1:8b` | 6 GB |
| Text only, stronger reasoning | Qwen2.5 14B Instruct | `ollama pull qwen2.5:14b` | 10 GB |
| Speech to text for voice messages | Whisper large-v3 | `ollama` does not run it, use `faster-whisper` | 4 GB |

If you use vLLM instead, start it with the Hugging Face name, for example `vllm serve Qwen/Qwen2.5-VL-7B-Instruct`, and put that same name in `LLM_MODEL`. The chat advisor needs a model that can follow a JSON schema; the photo and drawing features need one of the vision models. Without the server the chat shows "The AI helper is not switched on yet" and everything else keeps working. The advisor sees the farm's live plots, readings and forecast, and accepts photos, PDFs and text files (up to four files of 5 MB per message). A long answer can take about 20 seconds.

### Workers

The Workers icon (under the chat in the left rail) holds the farm's team and its tasks. Add a worker, then assign tasks from the Tasks tab or from the chat: ask the advisor to check what needs doing and it proposes tasks as cards, and you approve each one (or Send all). The advisor never creates tasks on its own, so a photo or file in the chat cannot assign work. Managers and owners add and remove workers, technicians and above assign tasks and mark them done, viewers only read.

## Water, weather, market and jobs

The left rail has these pages (full plan in `docs/ROADMAP-water-market.md`):

- **Water**: tabs My water (tanks, wells, boreholes, the public network, with levels and refill per day), Needs (how much water the crops and animals need, from the FAO-56 method with the forecast evapotranspiration, the soil type and the irrigation efficiency, for today, 7 days, 30 days and a year, against what the farm has, with a plain verdict such as "You will run short in about 3 days") and Animals (herds and their drinking water).
- **Weather**: current conditions, 48 hours, 7 days, farm alerts (heat, frost, wind, heavy rain). Data comes from Open-Meteo, which needs no key. Its free tier is for non-commercial use, so check their terms or buy their plan before Aqua is sold.
- **Water market**: farmers list surplus water with photos, price (fixed, free or to agree), pickup or delivery, location and dates. Other farmers browse by governorate, source, price and distance, and send an inquiry. Sellers read and answer inquiries in their inbox.
- **Jobs**: farmers post a one-off task, a job for a period or a long-term job; anyone with an account applies; the farm accepts or declines. A job fills when enough people are accepted.

### People: accounts, hiring and trust

Two kinds of people use Aqua. At sign-up you choose **farmer** or **farm worker**, and one person can switch sides later without losing anything.

- **Farmers** get a setup wizard (name and region, crops and sizes, water sources, animals, a written description or a hand-drawn picture), then a dashboard built from the answers.
- **Workers** get a Worker home (active work, applications, jobs near them, messages, profile checklist), a profile (headline, skills, languages, where they live, how far they will travel, public or private) and a CV that they can upload, fill in by hand or describe in words. Reading and writing CVs with AI needs the AI model server; without it the manual form still works.
- **Matching by distance**: workers see jobs within their own travel distance and within the reach the farm gave the job. Farmers see public workers who are looking for work within the radius they pick. Private profiles never appear and cannot apply.
- **Hiring**: accepting an application creates an engagement. The farmer marks it finished (it becomes confirmed work history on the worker's public profile), disapproves it with a reason, or offers full time after temporary work.
- **Chat**: after a hire, the farm and the worker talk in the Messages page, with unread counts. Email and phone are never shown.
- **Reports**: anyone can report a person (scam, no-show, unsafe, harassment, other), at most five a day. An admin reviews them, adds a note, resolves or dismisses, and can suspend an account, which locks it out at once and can be lifted.

CV files and farm drawings are private files, served only to their owner (and farm members for drawings). People and farms are placed by governorate, so distances are between governorate centres.

### Sample community

`backend/seed_market.py` creates eight fictional farmers (farms, water, listings with photos, job posts, inquiries and applications) so the market and jobs pages look real. Everyone shares the password in the script (`aqua-demo-2026`), for example `mohamed.karoui@aqua.test`. All people and businesses are invented. Photos are from Wikimedia Commons, credits in `backend/seed_media/CREDITS.md`.

```
cd backend
.venv/bin/python seed.py            # demo farm and the five role logins
.venv/bin/python seed_market.py     # sample community (add --reset to start over)
```

`backend/seed_people.py` adds eight fictional workers (profiles and CVs, one private, one not looking), three hires (active, finished, disapproved) with chats and two reports. It needs the two scripts above first, and `--reset` removes only the people it made.

```
.venv/bin/python seed_people.py     # sample workers, hires, chats and reports
```

Delete the demo accounts before any real use.

### Deploying these changes

- The API creates the new tables and adds the plot `soil_type` column by itself on start.
- Uploaded photos live in the `uploads` volume in `docker-compose.yml` (`UPLOADS_DIR=/data/uploads`) and are served at `/uploads`. Proxy `/uploads` to the API together with `/api`.
- The sample community is for demos only, do not run `seed_market.py` or `seed_people.py` on a real farm database.

## 3b. Older notes on running the scaffold

### Run locally

```
# backend, terminal 1
cd ~/our\ idea/project/backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py
.venv/bin/uvicorn app.main:app --reload        # http://localhost:8000/docs

# frontend, terminal 2
cd ~/our\ idea/project/frontend
npm install && npm run dev                     # http://localhost:5173
```

### Deploy on the VPS

```
cp .env.example .env        # set POSTGRES_PASSWORD and DEVICE_API_KEY
docker compose up -d --build
```

The API binds to 127.0.0.1:8000. Put it behind Nginx Proxy Manager with https, then set `CORS_ORIGINS` to the real origins: `http://localhost`, `https://localhost`, `capacitor://localhost`, and `null` for Electron.

### Desktop and Android apps

```
cd ~/our\ idea/project
./link-wrappers.sh https://api.yourdomain.com
cd ../app
npm run desktop           # Electron
npm run android:build     # APK, needs the Android SDK
```

Android SDK install was still downloading at the end of the 20 November session. Check `ANDROID_HOME` before building. iOS needs a Mac.

### Firmware

Open `firmware/` in the Arduino IDE, set Wi-Fi name and password, the API URL and `DEVICE_API_KEY`. Calibrate the soil and tank values yourself, the numbers in the sketch are guesses. Power the pump from its own supply, not USB.

### API

- `GET /health`
- `GET /api/crops`, `GET/POST /api/farms`, `POST /api/farms/{id}/plots`
- `POST /api/readings` (header `X-API-Key`), `GET /api/plots/{id}/readings`
- `POST /api/plots/{id}/decide`, `GET /api/plots/{id}/saved`

## 4. Plan for the 25 hours

1. Hours 0 to 3: agree scope, split roles, collect crop data (Kc, water needs).
2. Hours 3 to 10: ESP32 prototype and backend receiving data, dashboard skeleton in parallel.
3. Hours 10 to 16: decision engine with weather API, crop calculator, water saved counter.
4. Hours 16 to 20: chatbot with voice, WhatsApp alert, farm visualiser.
5. Hours 20 to 23: polish, season theme, mock screens for market and solar.
6. Hours 23 to 25: rehearse the pitch, record a backup demo video.

Roles: hardware and sensors, backend and decision engine, frontend and visualiser, chatbot and pitch.

## 5. Done and not done

Done: scaffold with farms, plots, readings, rain-aware decision with live Open-Meteo, saved counter, seed data, 3 passing tests, dashboard with chart, ESP32 sketch, Compose tested with Postgres, Electron tested, Capacitor Android platform added.

Also done: login (JWT) and role based access control (admin, owner, manager, technician, viewer), see `~/our idea/project/README.md`.

Not done: FAO water formula (placeholder of 4 L/m2 now), chatbot, WhatsApp, Leaflet map, i18n, Android SDK finish.

## 6. Pitch outline

1. Problem: summer 2026 was the hottest on record in Tunisia, power cuts stop pumps, farmers lose water.
2. Idea: an assistant that knows soil, weather and crop.
3. Live demo: dry soil, rain forecast, the system saves water and tells the farmer on WhatsApp.
4. Impact: litres and dinars saved.
5. Growth: neighbour water market and cooperatives.
6. Why us: Tunisia and Japan, two cultures that farm with scarce water.

Risks: water resale rules in Tunisia, WhatsApp API approval time, Derja speech to text quality, sensor calibration. Keep demo data ready in case a sensor dies live.
