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

### Token in Query Params for Images
> Browsers can't set HTTP headers on `<img src>` or MJPEG streams.

`/video_feed` and `/faces/{name}/img/{file}` accept `?token=` as a query parameter. This is intentional, not a security oversight — it's the only way to authenticate media URLs loaded by the browser directly.

### Hardcoded API URL
> `const API = 'http://localhost:8000'` appears in 4 files.

Files: `App.jsx`, `ManageFacesPage.jsx`, `RegisterModal.jsx`, `AuthContext.jsx`. If the API URL needs to change, all four must be updated. Consider centralizing to an env variable or shared constant.

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

---

<!-- 
  AGENTS: Append new learnings above this line.
  Keep entries concise and actionable.
  Date your entries if the learning is time-sensitive.
-->
