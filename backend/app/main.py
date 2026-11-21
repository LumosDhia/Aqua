import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import bridge, weekly
from .config import settings
from .db import init_schema
from .routers import auth, chat, cv, devices, discovery, engagements, farmlife, farms, home, weeklyreports, videos as videos_router, jobs, market, messages, onboarding, profiles, readings, reports, water, weather, worker_chat, workers

init_schema()


@asynccontextmanager
async def lifespan(_: FastAPI):
    bridge_worker = bridge.start()
    report_stop = weekly.start_scheduler()
    try:
        yield
    finally:
        if report_stop:
            report_stop.set()
        if bridge_worker:
            bridge_stop, worker = bridge_worker
            bridge_stop.set()
            bridge.wake.set()
            await asyncio.to_thread(worker.join)


app = FastAPI(title="Aqua API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(farms.router)
app.include_router(readings.router)
app.include_router(chat.router)
app.include_router(worker_chat.router)
app.include_router(workers.router)
app.include_router(water.router)
app.include_router(weather.router)
app.include_router(market.router)
app.include_router(jobs.router)
app.include_router(devices.router)
app.include_router(profiles.router)
app.include_router(onboarding.router)
app.include_router(cv.router)
app.include_router(discovery.router)
app.include_router(engagements.router)
app.include_router(messages.router)
app.include_router(home.router)
app.include_router(farmlife.router)
app.include_router(weeklyreports.router)
app.include_router(videos_router.router)
app.include_router(reports.router)
app.mount("/uploads", StaticFiles(directory=market.uploads_dir().parent), name="uploads")


@app.get("/health")
def health():
    return {"ok": True}


if settings.web_dir and Path(settings.web_dir).is_dir():
    app.mount("/", StaticFiles(directory=settings.web_dir, html=True), name="web")
