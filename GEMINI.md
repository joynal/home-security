# Gemini Project Index

## Identity

- **Project**: Aegis Vision AI (Home Security System)
- **Repository**: `home-security`
- **Purpose**: Real-time video monitoring with AI face recognition — identifies known people and alerts on unknown faces

## Tech Stack

- **Backend**: Python 3.13 · FastAPI · Uvicorn · InsightFace (buffalo_l: RetinaFace + ArcFace) · ONNX Runtime (CPU)
- **Frontend**: React 19 · Vite 8 · React Router 6 · @emotion/react (embedded component styles) · CSS design tokens & shell in `index.css` (dark theme)
- **Auth**: JWT via python-jose · bcrypt via passlib · file-based credentials (`data/credentials.json`)
- **Alerts**: Console (stdout) or Telegram (async httpx)
- **Package Management**: `uv` (Python) · `npm` (frontend)
- **Linting**: Ruff (Python, line-length 100, py313) · ESLint (JS)
- **Tests**: pytest (`uv run pytest tests/`)

## File Map

### Root
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app entrypoint — lifespan starts inference daemon thread, mounts CORS + 4 routers |
| `pyproject.toml` | Python project config, dependencies, ruff settings |
| `.env.example` | Required: `SECRET_KEY`; Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `.python-version` | `3.13` |

### `src/config.py` — Central Configuration
Loads `.env`, defines `BASE_DIR`, `DATA_DIR`, `KNOWN_FACES_DIR`, `SECRET_KEY`, `ACTIVE_CAMERAS` (list of camera dicts), `ACTIVE_ALERT` ("console"/"telegram"), Telegram credentials.

### `src/recognition/face_ops.py` — AI Core
**`FaceRecognizer` class**: Loads InsightFace buffalo_l model pack. Scans `data/known_faces/<person>/` to build 512-d ArcFace embedding vectors. Uses cosine similarity (threshold 0.40) to match live faces.
- `load_and_train()` — batch-load known face embeddings at startup
- `process_frame(frame)` → `[(x, y, w, h, name, is_known, landmarks), ...]`
- `add_face_embedding(name, frame)` → incrementally add without restart
- `remove_person(name)` → remove from live model
- `compute_sim(feat1, feat2)` → cosine similarity

### `src/api/` — API Layer

| File | Key Exports |
|------|-------------|
| `auth.py` | `create_access_token()`, `decode_token()`, `verify_password()`, `get_current_user` (FastAPI Depends), `verify_token_param()` |
| `state.py` | Thread-safe shared globals: `latest_grid_frame`, `latest_raw_frame`, `latest_face_status`, `pending_embeddings`, `recognizer`, `active_streams`, `main_loop` — all with `threading.Lock()` |
| `inference.py` | `inference_loop()` — daemon thread: grabs frames → runs InsightFace → annotates → alerts → updates state → drains enrollment queue. Also: `build_camera()`, `build_alert()` factories, `stack_frames()` |
| `pose.py` | `compute_pose(kps_array, bbox)` → `{pose, offset_x, offset_y}` using interocular-distance normalization |

### `src/api/routers/` — HTTP Endpoints

| Router | Prefix | Endpoints |
|--------|--------|-----------|
| `auth_router.py` | `/auth` | `POST /auth/login` → JWT + session cookie; `POST /auth/logout` → clear cookie; `GET /auth/me` → validate token |
| `stream.py` | `/` | `GET /cameras` → camera list; `GET /video_feed[/grid|/{id}]` → MJPEG stream |
| `faces.py` | `/faces` | `GET /faces` → list with counts; `GET /faces/{name}/img/{file}` → serve image; `DELETE /faces/{name}` → remove from disk + model |
| `events.py` | `/events` | `GET /events` → event history; `GET /events/{id}/thumbnail` → serve thumbnail JPEG |
| `recordings.py` | `/recordings` | `GET /recordings/{cam}/{file}` → MP4 segment; `GET /recordings/{cam}/frame.jpg` → hover frame |
| `register.py` | `/register` | `GET /register/face_status` → pose data (polled); `GET /register/face_debug` → extended; `POST /register/capture?name=&step=` → save + queue embedding |

### `src/camera/` — Camera Abstraction

| File | Class | Description |
|------|-------|-------------|
| `base.py` | `CameraSource` (ABC) | Interface: `start()`, `get_frame() → np.ndarray`, `stop()` |
| `webcam.py` | `MacbookWebcam` | OpenCV VideoCapture by index |
| `tapo.py` | `TapoCamera` | RTSP via OpenCV (`rtsp://user:pass@ip:554/stream1`) |
| `stream.py` | `CameraStreamWrapper` | Wraps any CameraSource with background thread for non-blocking reads |

### `src/alerts/` — Alert Abstraction

| File | Class | Description |
|------|-------|-------------|
| `base.py` | `AlertManager` (ABC) | Interface: `send_alert(message, image_frame=None)` |
| `console.py` | `ConsoleAlert` | Terminal print with cooldown timer |
| `telegram.py` | `TelegramAlert` | Async photo/text via Telegram Bot API, schedules on FastAPI event loop |

### `scripts/`
| File | Purpose |
|------|---------|
| `set_password.py` | CLI to create/update `data/credentials.json` with bcrypt hash. Validates: min 8 chars, uppercase, lowercase, digit. |

### `frontend/src/` — React SPA

| File | Role |
|------|------|
| `main.jsx` | Root: `BrowserRouter` → `AuthProvider` → conditional `App` or `LoginPage` |
| `contexts/AuthContext.jsx` | React Context: `{ token, username, login, logout, authHeaders }`, persists in localStorage |
| `App.jsx` | App shell with navigation rail (`AppRail`), routes: `/` (Live), `/events` (`EventsPage`), `/people` (`FacesPage`), `/cameras/:id` (`CameraDetailPage`) |
| `LoginPage.jsx` | Login form with shield SVG illustration (Emotion styles) |
| `RegisterModal.jsx` | 5-step wizard (center/left/right/up/down) — polls face_status every 350ms, auto-captures on 2s hold (Emotion styles) |
| `components/` | Modular UI components (`AppRail`, `CameraGrid`, `CameraTile`, `ImportModal`, `RecentEvents`, `TimelineRail`) with co-located Emotion styles |
| `pages/` | Page components (`CameraDetailPage`, `EventsPage`, `FacesPage`) with co-located Emotion styles |
| `services/` | API abstraction layer (`core.js` with `apiFetch`, plus `auth`, `cameras`, `events`, `faces`, `recordings`, `register`) |
| `hooks/` | Custom hooks: `useFetch.js` (data fetching with abort control), `useVisible.js` (viewport visibility) |
| `config.js` | Frontend config: exports `API` based on `VITE_API_URL` |
| `index.css` | Global stylesheet: design tokens (`:root`), base resets, font declarations, and common layout shell classes (`.app-shell`, `.page-header`, `.page-body`) |

## Architecture Pattern

```
React SPA (Vite :5173)  ───HTTP───▶  FastAPI (:8000)
                                         │
                                    ┌────┴─────┐
                                    │ Routers   │  (auth, faces, stream, register)
                                    └────┬─────┘
                                         │
                                    ┌────▼─────┐
                                    │  state   │  Thread-safe shared globals
                                    └────┬─────┘
                                         │
                              ┌──────────▼──────────┐
                              │  inference_loop()   │  Daemon thread
                              │  ~30 FPS cycle:     │
                              │  camera → detect →  │
                              │  recognize → alert  │
                              └──────────┬──────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                    CameraSource   FaceRecognizer   AlertManager
                    (Strategy)     (InsightFace)    (Strategy)
```

## Critical Implementation Details

1. **Single-threaded ONNX**: All InsightFace `app.get()` calls happen in the inference thread only. Registration uses a `pending_embeddings` queue.
2. **Thread safety**: Every shared variable in `state.py` has a corresponding `threading.Lock()`.
3. **Cookie / Header Authentication for Media**: Media endpoints (`/video_feed`, `/faces/{name}/img`, `/events/{id}/thumbnail`, `/recordings/...`) authenticate via `HttpOnly` session cookies (or `Authorization: Bearer` header) so JWT tokens are never leaked in URL query strings, server logs, or browser history. `?token=` is retained only as an optional fallback.
4. **Async from sync thread**: `TelegramAlert` uses `asyncio.run_coroutine_threadsafe(coro, state.main_loop)` to post from the inference thread.
5. **Testing**: Hardware-free pytest test suite in `tests/` (`uv run pytest tests/`).
6. **Frontend Service Layer & API Abstraction**: Frontend abstracts all backend interaction behind a domain service layer (`src/services/`) and a generic `apiFetch` client in `src/services/core.js` (with a reusable `useFetch` hook). UI components never import `API` directly, and URL helpers provide media links for `<img>` and `<video>` tags.
7. **Data directory gitignored**: `data/` (credentials, face images) is not tracked.
8. **Component Styling with Emotion**: All component and page styling MUST be embedded directly in JSX using `@emotion/react` (`css` prop or objects). Do NOT create separate `.css` files. Only global tokens, resets, and layout shell classes belong in `src/index.css`.

## Development

```bash
# Setup
uv sync                              # Python deps
cd frontend && npm install            # JS deps
cp .env.example .env                  # Configure SECRET_KEY
uv run scripts/set_password.py        # Create admin password

# Run
uv run main.py                        # Backend on :8000
cd frontend && npm run dev            # Frontend on :5173

# Lint
uv run ruff check . && uv run ruff format .
cd frontend && npm run lint
```

## Learnings

See [LEARNINGS.md](./LEARNINGS.md) for project-specific knowledge, tricks, and gotchas discovered over time.
When you discover something non-obvious about this codebase, **append it there**.
