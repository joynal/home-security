"""
main.py — Aegis Vision AI
─────────────────────────
Entry point: wires together FastAPI, the inference thread, and the API routers.
All business logic lives in src/api/.
"""

import threading
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import src.api.state as state
from src.api.inference import inference_loop
from src.api.routers import faces, register, stream
from src.api.routers.auth_router import router as auth_router
from src.api.routers.events import router as events_router
from src.api.routers.recordings import router as recordings_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    from src.config import CAMERAS, RECORDINGS_DIR
    from src.events.database import EventDatabase
    from src.go2rtc import start_go2rtc, stop_go2rtc
    from src.recording.index import RecordingIndex
    from src.recording.recorder import RecordingManager

    # Capture the main FastAPI event loop so background threads can schedule async tasks safely
    state.main_loop = asyncio.get_running_loop()

    # go2rtc stream proxy — required for RTSP cameras (single connection per camera)
    go2rtc_proc = start_go2rtc()

    # Shared app database (events now; recordings index; person metadata later)
    # + segment index backfilled from disk — for ALL cameras, so footage stays
    # browsable even for cameras with recording currently disabled.
    state.event_db = EventDatabase()
    state.recording_index = RecordingIndex(
      state.event_db._conn, state.event_db._lock, RECORDINGS_DIR  # noqa: SLF001 — shared by design
    )
    state.recording_index.scan_directory()

    # Recording manager — FFmpeg per camera, retention piggybacked on rotation
    recording_manager = RecordingManager(CAMERAS, index=state.recording_index)
    recording_manager.cleanup_all()  # startup sweep for stragglers from downtime
    recording_manager.start_all()
    state.recording_manager = recording_manager

    # Start the AI inference loop in a background daemon thread
    thread = threading.Thread(target=inference_loop, daemon=True, name="inference")
    thread.start()
    yield
    # Graceful shutdown
    print("\nShutting down cameras…")
    recording_manager.stop_all()
    for s in state.active_streams.values():
        s.stop()
    stop_go2rtc(go2rtc_proc)


app = FastAPI(title="Aegis Vision AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(faces.router)
app.include_router(stream.router)
app.include_router(register.router)
app.include_router(events_router)
app.include_router(recordings_router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
