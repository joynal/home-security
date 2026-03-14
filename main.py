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
from src.api.routers import register, stream


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Start the AI inference loop in a background daemon thread
    thread = threading.Thread(target=inference_loop, daemon=True, name="inference")
    thread.start()
    yield
    # Graceful shutdown
    print("\nShutting down cameras…")
    for s in state.active_streams:
        s.stop()


app = FastAPI(title="Aegis Vision AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stream.router)
app.include_router(register.router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
