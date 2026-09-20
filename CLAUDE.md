# CLAUDE.md — Project Index for Claude

## Project Overview

**Aegis Vision AI** — A real-time home security system with AI-powered face recognition.
Monitors live camera feeds, identifies known faces using deep learning (InsightFace / ArcFace),
and alerts when unknown individuals are detected. Full-stack: Python/FastAPI backend + React/Vite frontend.

## Tech Stack

| Layer       | Technology                                                     |
|-------------|----------------------------------------------------------------|
| Language    | Python 3.13, JavaScript (ES modules)                           |
| Backend     | FastAPI + Uvicorn (port 8000)                                  |
| Frontend    | React 19 + Vite 8 + React Router 6 + @emotion/react            |
| AI/ML       | InsightFace (buffalo_l) — RetinaFace detection + ArcFace 512-d embeddings |
| Detection   | Cascading pipeline: motion (MOG2) → YOLOv8n person → ByteTrack → ArcFace → zones |
| Runtime     | ONNX Runtime (CPU)                                             |
| Auth        | JWT (python-jose) + bcrypt (passlib) — file-based credentials  |
| Alerts      | Console + Telegram + ntfy.sh (per-person cooldown)             |
| Recording   | FFmpeg segment recorder + go2rtc stream proxy + disk-aware retention |
| Events      | SQLite (`data/events.db`) + JPEG thumbnails                   |
| Pkg Manager | `uv` (Python), `npm` (frontend)                               |
| Linting     | Ruff (Python), ESLint (JS)                                     |
| Tests       | pytest (`uv run pytest tests/`) — 60 tests, no hardware needed |

## Directory Structure

```
home-security/
├── main.py                          # FastAPI entrypoint — wires app, inference thread, routers
├── pyproject.toml                   # Python deps, ruff config, uv workspace
├── .env.example                     # Required env vars: SECRET_KEY, TELEGRAM_*
├── .python-version                  # 3.13
│
├── src/
│   ├── config.py                    # Central config: paths, env vars, cameras.json loading
│   ├── models.py                    # Pydantic config models (CameraConfig, RecordConfig, …)
│   ├── go2rtc.py                    # go2rtc config generator + process manager
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py                  # JWT auth: create/decode tokens, password verify, FastAPI deps
│   │   ├── inference.py             # Background thread: cameras → pipeline → events → alerts
│   │   ├── pose.py                  # Head-pose estimation from 5 facial keypoints
│   │   ├── state.py                 # Thread-safe shared state (frames, locks, queues, pipelines)
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth_router.py       # POST /auth/login, GET /auth/me
│   │       ├── faces.py             # GET /faces, DELETE /faces/{name}, GET /faces/{name}/img/{file}
│   │       ├── register.py          # GET /register/face_status, POST /register/capture
│   │       ├── stream.py            # GET /cameras, /video_feed[/grid|/{id}], /diagnostics/pipeline
│   │       ├── events.py            # GET /events, /events/summary, /events/{id}/thumbnail
│   │       └── recordings.py        # GET /recordings/storage, /recordings/{cam}[/{file}]
│   │
│   ├── camera/
│   │   ├── base.py                  # ABC: CameraSource (start, get_frame, stop)
│   │   ├── stream.py                # CameraStreamWrapper — threaded frame reader
│   │   ├── webcam.py                # MacbookWebcam — OpenCV VideoCapture
│   │   ├── tapo.py                  # TapoCamera — RTSP via OpenCV (url or components)
│   │   └── video_file.py            # VideoFileCamera — looping MP4 (dev/test "file" type)
│   │
│   ├── detection/                   # Cascading pipeline (one per camera)
│   │   ├── motion.py                # MOG2 background subtraction gatekeeper
│   │   ├── person.py                # YOLOv8n person detector (COCO class 0)
│   │   ├── tracker.py               # ByteTrack + identity cache (skip redundant recognition)
│   │   ├── zones.py                 # Polygon activity-zone filter
│   │   ├── behaviors.py             # LoiteringDetector (time-in-zone)
│   │   └── pipeline.py              # DetectionPipeline: motion → YOLO → track → ArcFace → zones
│   │
│   ├── recording/
│   │   └── recorder.py              # FFmpeg segment recorder + disk-aware retention
│   │
│   ├── events/
│   │   ├── models.py                # DetectionEvent dataclass (UTC timestamps)
│   │   └── database.py              # EventDatabase — SQLite, thread-safe
│   │
│   ├── alerts/
│   │   ├── base.py                  # ABC: AlertManager + per-person cooldown mixin
│   │   ├── console.py               # ConsoleAlert
│   │   ├── telegram.py              # TelegramAlert — async photo/text via Bot API
│   │   ├── ntfy.py                  # NtfyAlert — push notifications via ntfy.sh
│   │   └── summary.py               # Daily summary generation + scheduler
│   │
│   └── recognition/
│       └── face_ops.py              # FaceRecognizer — InsightFace pipeline, cosine similarity matching
│
├── tests/                           # pytest suite — 60 tests, hardware-free
├── scripts/
│   ├── set_password.py              # CLI to create/update admin credentials (bcrypt)
│   └── make_test_video.py           # Synthetic test clip generator
│
├── deploy/
│   ├── aegis-vision.plist           # macOS launchd auto-start
│   └── aegis-vision.service         # Linux systemd unit
│
├── Dockerfile                       # Backend image (python:3.13-slim + ffmpeg)
├── docker-compose.yml               # backend + go2rtc + frontend
├── cameras.json.example             # Typed camera config example
└── go2rtc.yaml.example              # Bare-metal go2rtc config example
│
├── scripts/
│   └── set_password.py              # CLI to create/update admin credentials (bcrypt)
│
├── frontend/
│   ├── package.json                 # React 19, react-router-dom 6, Vite 8, @emotion/react
│   ├── vite.config.js               # Vite + @vitejs/plugin-react (@emotion/babel-plugin)
│   ├── index.html                   # SPA shell
│   └── src/
│       ├── main.jsx                 # React root — BrowserRouter + AuthProvider + conditional render
│       ├── App.jsx                  # App shell with navigation rail (AppRail), routes
│       ├── LoginPage.jsx            # Login form with shield SVG art (Emotion styles)
│       ├── RegisterModal.jsx        # 5-step face registration wizard with pose detection (Emotion styles)
│       ├── index.css                # Global styles: tokens, resets, fonts, shell layout
│       ├── components/              # AppRail, CameraGrid, CameraTile, ImportModal, RecentEvents, TimelineRail
│       ├── pages/                   # CameraDetailPage, EventsPage, FacesPage
│       └── contexts/
│           └── AuthContext.jsx      # React Context: token/username in localStorage, login/logout
│
├── docs/
│   ├── architecture.jpg             # System architecture diagram
│   └── architecture.excalidraw      # Editable architecture diagram
│
└── data/                            # (gitignored) runtime data
    ├── credentials.json             # { username, hashed_password }
    └── known_faces/                 # Person subdirs with face images
        └── <person_name>/
            └── *.jpg / *.png
```

## Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           main.py (FastAPI)                             │
│  lifespan → starts inference_loop in daemon thread                      │
│  Mounts routers: auth, faces, stream, register                         │
│  CORS: allow all origins (dev)                                          │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
    ┌──────────▼──────────┐          ┌──────────────────────────┐
    │  inference_loop()   │──reads──▶│  CameraStreamWrapper     │
    │  (daemon thread)    │          │  (threaded frame grab)   │
    │                     │          └──────────────────────────┘
    │  For each frame:    │
    │  1. FaceRecognizer  │──uses───▶ InsightFace buffalo_l
    │     .process_frame()│          (RetinaFace + ArcFace)
    │  2. Annotate frame  │
    │  3. Alert if unknown│──fires──▶ AlertManager (console/telegram)
    │  4. Update state.*  │──writes─▶ state.py (thread-safe globals)
    │  5. Drain enrollment│
    └─────────────────────┘
               │
    ┌──────────▼──────────┐
    │  API Routers        │ ◀─── React frontend (http://localhost:5173)
    │  /video_feed        │      MJPEG stream via <img> tag
    │  /faces             │      Face management CRUD
    │  /register/capture  │      Snapshot + queue embedding
    │  /auth/login        │      JWT token exchange
    └─────────────────────┘
```

## Key Design Patterns

1. **Strategy Pattern**: Camera and Alert systems use ABCs (`CameraSource`, `AlertManager`) for swappable implementations.
2. **Thread-safe Shared State**: `src/api/state.py` holds all mutable cross-thread data behind `threading.Lock()`.
3. **Producer-Consumer Queue**: Registration captures go into `pending_embeddings` → inference loop drains them (avoids concurrent ONNX calls).
4. **Factory Functions**: `build_camera()` and `build_alert()` in `inference.py` instantiate from config dicts.
5. **Token Auth via Cookie/Header for Media**: Browser `<img src>` and `<video src>` authenticate via `HttpOnly` session cookies (or `Authorization: Bearer` header), eliminating `?token=` from URLs, server logs, and browser history.

## API Endpoints

| Method   | Path                          | Auth            | Description                        |
|----------|-------------------------------|-----------------|------------------------------------|
| `POST`   | `/auth/login`                 | None            | Returns JWT + sets session cookie  |
| `POST`   | `/auth/logout`                | None            | Clears session cookie              |
| `GET`    | `/auth/me`                    | Bearer / Cookie | Validate token, return username    |
| `GET`    | `/cameras`                    | Bearer / Cookie | List configured cameras            |
| `GET`    | `/video_feed[/grid]`          | Cookie / Bearer | Infinite MJPEG stream              |
| `GET`    | `/faces`                      | Bearer / Cookie | List registered faces + counts     |
| `GET`    | `/faces/{name}/img/{file}`    | Cookie / Bearer | Serve face image file              |
| `DELETE` | `/faces/{name}`               | Bearer / Cookie | Delete person from disk + model    |
| `GET`    | `/register/face_status`       | Bearer / Cookie | Current face pose (polled by UI)   |
| `GET`    | `/register/face_debug`        | Bearer / Cookie | Extended pose with calibration     |
| `POST`   | `/register/capture?name=&step=` | Bearer / Cookie | Snapshot frame, queue embedding  |

## Key Classes & Functions

### Backend

- **`FaceRecognizer`** (`src/recognition/face_ops.py`): Core AI class. Loads InsightFace buffalo_l, generates 512-d ArcFace embeddings, matches via cosine similarity (threshold: 0.40). Methods: `load_and_train()`, `process_frame()`, `add_face_embedding()`, `remove_person()`.
- **`CameraSource`** ABC (`src/camera/base.py`): `start()`, `get_frame() → np.ndarray`, `stop()`.
- **`CameraStreamWrapper`** (`src/camera/stream.py`): Wraps CameraSource with background thread for non-blocking frame reads.
- **`AlertManager`** ABC (`src/alerts/base.py`): `send_alert(message, image_frame=None)`.
- **`TelegramAlert`** (`src/alerts/telegram.py`): Async HTTP via httpx, schedules coroutines on FastAPI's event loop from the inference thread using `asyncio.run_coroutine_threadsafe()`.
- **`compute_pose()`** (`src/api/pose.py`): Determines head orientation (center/left/right/up/down) from 5 InsightFace keypoints using interocular-distance normalization.
- **`inference_loop()`** (`src/api/inference.py`): Main processing loop — runs in daemon thread, ~30 FPS.

### Frontend

- **`AuthContext`** (`contexts/AuthContext.jsx`): React Context providing `{ token, username, login, logout, authHeaders }`. Persists JWT in localStorage.
- **`App.jsx`**: App shell with navigation rail (`AppRail`). Routes: `/` (Live), `/events` (`EventsPage`), `/people` (`FacesPage`), `/cameras/:id` (`CameraDetailPage`).
- **`RegisterModal.jsx`**: 5-step guided face registration wizard. Polls `/register/face_status` every 350ms, auto-captures when correct pose held for 2s.
- **`FacesPage.jsx`** (`pages/FacesPage.jsx`): Grid of registered faces with thumbnails, gallery, delete, update, and photo import actions.
- **Styling Convention**: All component and page styles are co-located via `@emotion/react` (`css` prop). No separate `.css` files per component; only `index.css` is retained for global design tokens, resets, and layout shell classes.

## Configuration

### Environment Variables (`.env`)

```
SECRET_KEY=<32+ char string>           # REQUIRED — JWT signing key
TELEGRAM_BOT_TOKEN=<bot token>         # Optional — for Telegram alerts
TELEGRAM_CHAT_ID=<chat id>             # Optional — for Telegram alerts
```

### `src/config.py` Key Settings

- `ACTIVE_CAMERAS`: List of camera config dicts. Types: `"macbook"`, `"tapo"`.
- `ACTIVE_ALERT`: `"console"` or `"telegram"`.
- `KNOWN_FACES_DIR`: `data/known_faces/` — person subdirectories with face images.
- `similarity_threshold`: `0.40` (in FaceRecognizer) — cosine similarity cutoff.

## Development Commands

```bash
# Backend
uv sync                          # Install Python dependencies
uv run scripts/set_password.py   # Set admin password (required before first run)
uv run main.py                   # Start FastAPI on port 8000

# Frontend
cd frontend && npm install       # Install JS dependencies
cd frontend && npm run dev       # Start Vite dev server (port 5173)

# Linting
uv run ruff check .              # Python lint
uv run ruff format .             # Python format
cd frontend && npm run lint      # JS lint
```

## API Endpoints

| Method   | Path                          | Auth        | Description                        |
|----------|-------------------------------|-------------|------------------------------------|
| `POST`   | `/auth/login`                 | None            | Returns JWT + sets session cookie  |
| `POST`   | `/auth/logout`                | None            | Clears session cookie              |
| `GET`    | `/auth/me`                    | Bearer / Cookie | Validate token, return username    |
| `GET`    | `/cameras`                    | Bearer / Cookie | Cameras + live status (online/fps) |
| `GET`    | `/cameras/{id}/status`        | Bearer / Cookie | Single-camera detail incl. error   |
| `GET`    | `/video_feed`                 | Cookie / Bearer | MJPEG grid stream                  |
| `GET`    | `/video_feed/{id}`            | Cookie / Bearer | Per-camera MJPEG stream            |
| `GET`    | `/diagnostics/pipeline`       | Bearer / Cookie | Per-camera pipeline stats          |
| `GET`    | `/faces`                      | Bearer / Cookie | List registered faces + counts     |
| `GET`    | `/faces/{name}/img/{file}`    | Cookie / Bearer | Serve face image file              |
| `DELETE` | `/faces/{name}`               | Bearer / Cookie | Delete person from disk + model    |
| `GET`    | `/register/face_status`       | Bearer / Cookie | Current face pose (polled by UI)   |
| `POST`   | `/register/capture?name=&step=` | Bearer / Cookie | Snapshot frame, queue embedding  |
| `GET`    | `/events`                     | Bearer / Cookie | Detection events (filters, paging) |
| `GET`    | `/events/summary`             | Bearer / Cookie | Event counts by type               |
| `GET`    | `/events/{id}/thumbnail`      | Cookie / Bearer | Event thumbnail JPEG               |
| `GET`    | `/recordings/storage`         | Bearer / Cookie | Per-camera disk usage              |
| `GET`    | `/recordings/{cam}?date=`     | Bearer / Cookie | List MP4 segments                  |
| `GET`    | `/recordings/{cam}/{file}`    | Cookie / Bearer | Serve MP4 for playback             |

## Important Conventions

- **Tests run without hardware** — `uv run pytest tests/` (60 tests). New modules get tests written alongside them (see `docs/PROGRESS.md` protocol).
- **All camera I/O is threaded** — never call camera methods from the FastAPI async context directly.
- **ONNX calls are single-threaded** — enrollment goes through the pending queue, never call `app.get()` from multiple threads.
- **The `data/` directory is gitignored** — credentials, face images, events.db, recordings, dev `cameras.json`.
- **Ruff config**: line-length 100, target Python 3.13, single quotes, 2-space indentation, single-line imports. Note: no nested double quotes inside triple-quoted f-strings (CPython rejects them).
- **Frontend**: hardcoded `API = 'http://localhost:8000'` — no env-based API URL.
- **CSS / Styling**: All component and page styling is co-located directly inside JSX files using `@emotion/react` (`css` prop). Never create separate `.css` files per component; only `src/index.css` is retained for global design tokens (`:root`), base resets, font declarations, and layout shell classes.
- **Detection pipeline**: one `DetectionPipeline` per camera; the registration camera bypasses the motion gate and runs raw InsightFace (see `src/api/inference.py`).
- **Recording source**: always via go2rtc (`rtsp://$GO2RTC_HOST/{camera_id}`), never the camera directly.

## Ongoing Implementation Work (Evolution Plan)

The project is being evolved per [docs/implementation-plan.md](./docs/implementation-plan.md) (research: [docs/research.md](./docs/research.md)).

- **Before any implementation work**: read [docs/PROGRESS.md](./docs/PROGRESS.md) — it is the single source of truth for task state (what's done, blocked, or pending) across sessions.
- **Follow its protocol**: update task status in the same commit as the work, record verification evidence, commit per task (`task X.Y: <description>`), and never mark a task ✅ without executed verification.
- The "No tests exist yet" convention above is being superseded — new modules get pytest tests written alongside them (see Task 4.6).

## Learnings

See [LEARNINGS.md](./LEARNINGS.md) for project-specific knowledge, tricks, and gotchas discovered over time.
When you discover something non-obvious about this codebase, **append it there**.
