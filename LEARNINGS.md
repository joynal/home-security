# Learnings

Living document of project-specific knowledge, tricks, gotchas, and discoveries.
AI agents and developers should append new learnings here as they arise.

---

## How to Add a Learning

Append under the appropriate category. Use this format:

```
### Short Title
> Context or problem that led to this learning

Description of the trick, fix, or insight.
```

---

## Architecture & Threading

### ONNX Must Stay Single-Threaded
> InsightFace's `app.get()` is not thread-safe under ONNX Runtime.

All face detection/recognition calls MUST happen in the inference thread only. Registration works by pushing to `pending_embeddings` queue, which the inference loop drains. Never call `FaceRecognizer.process_frame()` or `add_face_embedding()` from a FastAPI route handler directly.

### Async from Sync Thread
> TelegramAlert needs to send HTTP requests but runs in the sync inference thread.

Use `asyncio.run_coroutine_threadsafe(coro, state.main_loop)` to schedule async work on FastAPI's event loop from the inference thread. The `main_loop` reference is captured during FastAPI's lifespan startup.

## Frontend

### Media Authentication via HttpOnly Cookies
> Browsers cannot set arbitrary custom headers (like `Authorization: Bearer`) on `<img>` or `<video>` tags, but query parameters leak into web server access logs and browser history.

FastAPI sets an `HttpOnly` session cookie (`access_token`) upon login (`POST /auth/login`). When the browser renders `<img src="/video_feed/..." crossOrigin="use-credentials">` or `<video src="/recordings/..." crossOrigin="use-credentials">`, the browser automatically includes the cookie in the HTTP `Cookie:` header. The backend checks `Authorization: Bearer` first, falls back to `request.cookies.get("access_token")`, and keeps `?token=` only as an optional legacy fallback. This keeps all access logs clean with zero token leakage.

### Frontend Service Layer & API Abstraction
> Direct `fetch` calls and raw `API` base URLs scattered across components created tight coupling, duplicated header/auth logic, and repetitive error handling.

Abstracted all API calls into domain services under `src/services/` (`auth`, `cameras`, `events`, `faces`, `recordings`, `register`) powered by a central `apiFetch` in `src/services/core.js`. `apiFetch` handles Bearer tokens, `credentials: 'include'`, default Content-Type, 401 unauthorization auto-logout, and FastAPI error decoding. Reusable `useFetch` hook (`src/hooks/useFetch.js`) provides `{ data, loading, error, refetch }` with abort safety. Media URLs (`getVideoFeedUrl`, `getThumbnailUrl`, `getRecordingUrl`, `getFaceImageUrl`) are provided by services, ensuring components never concatenate API URLs or import `API` directly.

### Component Styling Co-location with @emotion/react
> Separate `.css` files per component created unmanageable orphaned stylesheets upon refactoring or deletion.

All component and page-specific styles are embedded directly inside components via `@emotion/react` (`css` tagged template or style objects). Global tokens (`:root`), font declarations, and high-level layout shell classes (`.app-shell`, `.page-header`, `.page-body`) remain in `src/index.css`. Vite uses `@vitejs/plugin-react` with `jsxImportSource: '@emotion/react'` and `@emotion/babel-plugin`.

## AI / Face Recognition

### Cosine Similarity Threshold
> Too low → false positives; too high → fails to recognize at angles.

Current threshold is `0.40` in `FaceRecognizer`. This was calibrated for typical desk webcam distances. May need adjustment for different camera setups or lighting conditions.

### Head Pose Thresholds
> Interocular-distance normalization makes thresholds camera-distance-independent.

`pose.py` uses: horizontal turn `±0.40`, up `<1.05`, down `>1.90` (relative to eye-midpoint). These were tuned for MacBook webcam — may need recalibration for IP cameras at different angles.

## Development Environment

### First-Run Setup Order
> App crashes if you skip steps.

Must follow this exact order:
1. `uv sync`
2. `cp .env.example .env` + set `SECRET_KEY`
3. `uv run scripts/set_password.py`
4. `uv run main.py`

Skipping step 3 causes a `RuntimeError` at import time (auth.py loads credentials at module level).

### Camera Permissions on macOS
> First run triggers a macOS permission dialog.

Terminal app needs Camera access in System Settings > Privacy & Security > Camera. If denied, OpenCV silently fails to open the webcam — you get black frames, not an error.

## Multi-Camera & Detection Pipeline (2026-09-18)

### No-Quotes Inside Triple-Quoted f-Strings
> `f"""...{x.strftime("%Y")}..."""` is a SyntaxError, even on Python 3.13.

CPython (PEP 701) allows quote reuse in single-quoted f-strings but NOT inside triple-quoted ones. Compute the value into a variable before the f-string, or use implicit concatenation of smaller f-strings (`src/alerts/summary.py` does the latter).

### `:memory:` SQLite Needs One Persistent Connection
> `sqlite3.connect(":memory:")` per call creates a separate empty DB each time.

Each connection gets its own private in-memory database — schema created in one connection is invisible to the next. Use a single long-lived connection guarded by a lock (`EventDatabase` does this; `check_same_thread=False` + own lock).

### supervision's ByteTrack Is Deprecated (0.28–0.30)
> `sv.ByteTrack` warns FutureWarning everywhere; removal planned for 0.31.

Import from `supervision.tracker` and pin `supervision<0.31` in pyproject. No in-package replacement exists as of 0.30.4 — when 0.31 ships, adapt `src/detection/tracker.py`.

### Hardware-Free Verification: `file` Camera Type
> The whole pipeline is testable without any camera hardware.

`CameraConfig(type="file", rtsp_url="path.mp4")` loops any MP4 through the full stack via `VideoFileCamera`. Generate synthetic clips with `scripts/make_test_video.py`; build real-people clips by panning ultralytics' bundled `bus.jpg` into a video. This exercised motion→YOLO→ByteTrack→ArcFace end-to-end with a 98% recognition cache-hit rate.

### MJPEG: Encode Once per Camera, Serve Many Clients
> Re-encoding JPEG inside each streaming generator multiplies CPU by viewer count.

The inference loop encodes each camera's JPEG once per iteration into `state.latest_jpeg_bytes[cam_id]`; generators only yield cached bytes.

### Registration Camera Must Bypass the Motion Gate
> A person holding still for the 5-pose wizard generates zero motion.

The registration camera (first enabled camera, `state.registration_camera_id`) gets `enable_motion_filter=False` and runs raw InsightFace on the full frame — pipeline landmarks are crop-relative, which breaks `compute_pose()`.

### TypeScript with @emotion/react `css` Prop & Flat ESLint
> Using `@emotion/react` `css` prop in TSX often causes `Property 'css' does not exist on type 'HTMLAttributes<...>'` or Vite/Babel plugin conflicts.

In `tsconfig.app.json`, set `"jsxImportSource": "@emotion/react"`. In `src/vite-env.d.ts`, include `/// <reference types="@emotion/react/types/css-prop" />`. For `@vitejs/plugin-react` v6, the plugin directly accepts `jsxImportSource: '@emotion/react'` without `@emotion/babel-plugin`. In ESLint 9 flat config, use `reactHooks.configs.flat['recommended-latest']` rather than legacy string-plugin arrays, combined with `tseslint.configs.recommended`.

---

<!-- 
  AGENTS: Append new learnings above this line.
  Keep entries concise and actionable.
  Date your entries if the learning is time-sensitive.
-->
