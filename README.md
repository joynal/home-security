# Aegis Vision AI

Real-time home security system with AI-powered face recognition. Monitors live camera
feeds, identifies known faces, records everything to disk, and alerts you when unknown
people are detected — with a cascading detection pipeline that keeps CPU usage low.

```
Frame → Motion Detect → YOLO Person → ByteTrack → ArcFace Recognize → Zones → Alert
        (<1ms, CPU)     (only if motion)  (track IDs)  (only new/unknown)    ↓
                                                                  SQLite event log + thumbnails
```

Each stage filters the next: on a real-people test clip the pipeline skipped 26% of
frames at the motion gate and served 98% of identity lookups from the tracker cache —
ArcFace recognition ran for only 2% of person detections.

## Features

- **Multi-camera** — MacBook webcam, Tapo/RTSP IP cameras, or looping video files
  (dev), configured declaratively in `data/cameras.json`
- **Cascading detection** — MOG2 motion gate → YOLOv8n person filter → ByteTrack
  tracking → ArcFace recognition only when needed
- **Activity zones + loitering** — polygon zones per camera; alerts when unknown
  people linger in a zone
- **Recording & playback** — FFmpeg 15-minute MP4 segments via [go2rtc](https://github.com/AlexxIT/go2rtc),
  disk-aware retention (keeps footage while space allows, prunes oldest-first when low)
- **Event log** — every detection lands in SQLite with a cropped JPEG thumbnail,
  browsable in the dashboard
- **Alerts** — console, Telegram (photo), or ntfy.sh push; per-person cooldown so two
  different intruders both get their own alert
- **Dashboard** — React grid view (any number of cameras), live FPS/online status,
  event sidebar, recordings browser with in-browser playback, 5-pose face
  registration wizard
- **Ops** — JWT auth, Docker Compose (backend + go2rtc + frontend), launchd/systemd units

## Quick Start

```bash
# 1. Install dependencies
uv sync

# 2. Configure secrets
cp .env.example .env        # then edit: SECRET_KEY (required)

# 3. Create the admin login
uv run scripts/set_password.py

# 4. Start the backend (port 8000)
uv run main.py

# 5. Start the frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173** and log in.

> **macOS webcam**: the first run triggers a camera permission dialog for your
> terminal app — click Allow, or enable it under System Settings → Privacy &
> Security → Camera. Without it the webcam shows offline (the app keeps running).

## Configuration

### Cameras — `data/cameras.json`

Absent → falls back to the MacBook webcam. See `cameras.json.example`:

```json
[
  { "id": "macbook_webcam", "name": "MacBook Webcam", "type": "macbook",
    "record": { "enabled": false } },
  {
    "id": "front_door", "name": "Front Door", "type": "tapo",
    "rtsp_url": "rtsp://USER:PASSWORD@192.168.1.100:554/stream1",
    "record": { "enabled": true, "retain_days": 30 },
    "zones": [ { "name": "porch", "coordinates": [[0,0],[300,0],[300,360],[0,360]] } ]
  }
]
```

- Camera types: `"macbook"`, `"tapo"` / `"rtsp"`, `"file"` (looping MP4 — great for
  testing without hardware; generate clips with `uv run scripts/make_test_video.py`)
- The **first enabled camera is the registration camera** used by the face wizard
- `zones` enable activity filtering + loitering detection (threshold 120s)
- Recording retention is disk-aware by default: `delete_only_if_disk_full: true`
  keeps footage past `retain_days` while free space ≥ `min_disk_free_gb`

### Environment — `.env`

| Variable | Required | Purpose |
|----------|----------|---------|
| `SECRET_KEY` | ✅ | JWT signing key (32+ chars) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | for Telegram alerts | from @BotFather |
| `NTFY_TOPIC` | for ntfy.sh push | subscribe on your phone at `https://ntfy.sh/<topic>` |
| `RECORDINGS_DIR` / `THUMBNAILS_DIR` | NAS/external storage | defaults to `data/…` |
| `GO2RTC_HOST` | Docker Compose only | `go2rtc:8554` |

Alert channel is `ACTIVE_ALERT` in `src/config.py` (`console` / `telegram` / `ntfy`).

### IP cameras (Tapo)

1. Tapo app → Camera Settings → Advanced → Camera Account (set user/password)
2. `brew install go2rtc ffmpeg` — go2rtc proxies one RTSP connection per camera
   (Tapos crash under concurrent connections); ffmpeg records the stream
3. Add the camera to `data/cameras.json` (above) and restart

Without go2rtc/ffmpeg installed the app still runs — cameras stream, recording
degrades gracefully with a warning.

## Testing

```bash
uv run pytest tests/        # 60 tests, no camera hardware or network needed
uv run ruff check .         # lint
cd frontend && npm run lint && npm run build
```

The suite covers the retention policy, event DB (incl. concurrent access), motion
detector, zones, loitering, tracker identity cache, per-person alert cooldowns, and
the daily summary. YOLO tests use ultralytics' bundled sample image; `yolov8n.pt`
(~6MB) auto-downloads on first pipeline start.

## Deployment

```bash
docker compose up -d        # backend + go2rtc + frontend
```

Or bare-metal auto-start: `deploy/aegis-vision.plist` (macOS launchd) or
`deploy/aegis-vision.service` (Linux systemd). Copy go2rtc-docker.yaml.example →
go2rtc-docker.yaml with your streams for the compose setup.

## Project Layout

| Path | What |
|------|------|
| `main.py` | FastAPI entrypoint — wires routers, go2rtc, recorder, inference thread |
| `src/config.py` + `src/models.py` | Env vars, cameras.json loading, Pydantic config models |
| `src/api/` | Inference loop, shared state, routers (stream/events/recordings/faces/auth/register) |
| `src/detection/` | Cascading pipeline: motion, person, tracker, zones, loitering |
| `src/recognition/` | InsightFace ArcFace recognizer |
| `src/camera/` | Camera sources: webcam, Tapo RTSP, looping video file |
| `src/recording/` | FFmpeg segment recorder + retention |
| `src/events/` | SQLite event database |
| `src/alerts/` | Console / Telegram / ntfy + daily summary |
| `frontend/src/` | React dashboard, face manager, registration wizard, recordings page |
| `docs/` | Architecture diagram, research, implementation plan, progress tracker |

Further docs: [CLAUDE.md](./CLAUDE.md) (project index) · [docs/PROGRESS.md](./docs/PROGRESS.md)
(task state + verification log) · [LEARNINGS.md](./LEARNINGS.md) (gotchas)

## API Overview

`POST /auth/login` → JWT, then Bearer auth everywhere; media streams
(`/video_feed/{cam}`, `/events/{id}/thumbnail`, `/recordings/{cam}/{file}`) accept
`?token=` because browsers can't set headers on `<img>`/`<video>` tags.

Key endpoints: `/cameras` (+ `/{id}/status`), `/video_feed/{camera_id}`,
`/events` (+ `/summary`), `/recordings/{cam}` (+ `/storage`), `/faces`,
`/register/face_status` · `/register/capture`, `/diagnostics/pipeline`.
Full table in [CLAUDE.md](./CLAUDE.md).

## Security Notes

- JWT tokens appear in URLs for media endpoints — acceptable on a LAN, not exposed
  to the internet
- go2rtc's API/WebRTC ports bind to `127.0.0.1` (bare metal) and stay on the compose
  network (Docker) — publishing them means unauthenticated video access
- `data/` (credentials, face images, events, recordings) is gitignored; so are
  `go2rtc.yaml` (contains camera passwords) and `yolov8n.pt`
