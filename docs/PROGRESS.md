# Aegis Vision AI — Implementation Progress Tracker

> **Single source of truth for task state across agent sessions.**
> Any agent (or human) resuming work reads this file FIRST to know where things stand.
> Update it in the same commit as the work it describes — never in a separate "bookkeeping" commit.

Source plan: [implementation-plan.md](./implementation-plan.md) · Research: [research.md](./research.md)

---

## Protocol (for any agent executing the plan)

1. **On session start**: read this file. Resume from the first non-✅ task whose dependencies are all ✅ (or ⏭️).
2. **Before starting a task**: flip its status to 🔄 and note the date in the Session Log.
3. **After verification passes**: set status to ✅, record the commit SHA, the verification commands you ran, and their results. If you deviated from the plan (different approach, extra files), record it under "Deviations".
4. **If blocked**: set status to ⛔ with what you tried and what's needed to unblock. Move on to the next unblocked independent task — do not stall the whole run on one blocker.
5. **Commit per task** (or per tightly-coupled task group). Commit message format: `task 1.3: refactor inference loop for multi-camera`. Include code + this file together.
6. **Never mark ✅ without evidence.** Every verification step in the plan must be either executed, replaced by an automated test, or explicitly recorded as "manual-only, deferred to human" with a ⚠️ note.
7. **Write tests alongside the module, not after** (see Task 4.6 — its test files should be created in the same task as the module they test whenever possible).

### Status legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Pending — not started |
| 🔄 | In progress — started, not verified |
| ✅ | Done — implemented AND verified, evidence recorded |
| ⛔ | Blocked — cannot proceed, reason recorded |
| ⏭️ | Skipped — deliberately not doing, reason recorded |

---

## Environment notes (verify before relying on these)

| Check | Status (as of 2026-09-18) |
|-------|---------------------------|
| `uv` + Python 3.13 | ✅ working |
| ffmpeg | ❌ **not installed** — Phase 2 recording tasks can be implemented + unit-tested (mock subprocess / temp files) but NOT end-to-end verified on this machine |
| go2rtc | ❌ **not installed** — Task 1.8 degrades gracefully per plan; WebRTC/proxy verification deferred |
| Tapo/RTSP camera | ❌ not available — only macbook webcam; use `record.source_url` dev override + test video clips for pipeline verification |
| Frontend npm | ✅ working |

Re-check with `which ffmpeg go2rtc` when resuming.

---

## Task status

### Phase 1 — Foundation (Multi-Camera + Streaming)

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| 1.1 | Refactor camera configuration (`src/models.py`, cameras.json) | — | ✅ | — | example lives at repo root `cameras.json.example` (data/ is gitignored) |
| 1.2 | Add pydantic dependency | — | ✅ | — | done with 1.1 |
| 1.3 | Refactor inference loop for multi-camera | 1.1, 1.2 | ✅ | — | |
| 1.4 | Camera list & status API endpoints | 1.3 | ✅ | — | |
| 1.5 | Per-camera video feed endpoints | 1.3 | ✅ | — | jpeg-bytes cache implemented |
| 1.6 | Frontend multi-camera grid view | 1.5 | ✅ | — | ⚠️ visual check deferred to user |
| 1.7 | Frontend sidebar camera status (polling) | 1.4, 1.6 | ✅ | — | ⚠️ visual check deferred to user |
| 1.8 | go2rtc integration (required for Phase 2) | 1.1 | ✅ | — | ⚠️ binary not installed — fallback verified; live proxy check deferred |

### Phase 2 — Recording & Playback

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| 2.1 | FFmpeg recording manager | 1.1, 1.2, (1.8) | ✅ | — | ⚠️ ffmpeg missing — unit-tested with mocks; live recording deferred |
| 2.2 | Retention strategy (disk-space controlled) | 2.1, 2.3 | ✅ | — | retention ships inside 2.1's cleanup; full matrix unit-tested |
| 2.3 | SQLite event database | 1.3 | ✅ | — | done before 2.1/2.2 per ordering note |
| 2.4 | Events API endpoints | 2.3 | ✅ | — | |
| 2.5 | Recordings API endpoints | 2.1 | ✅ | — | |
| 2.6 | Frontend event sidebar | 2.4, 1.6 | ✅ | — | ⚠️ visual check deferred to user |
| 2.7 | Frontend recording playback | 2.5, 1.6 | ✅ | — | ⚠️ visual check deferred to user |

### Phase 3 — Smart Detection Pipeline

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| 3.1 | Add ultralytics + supervision deps | — | ⬜ | — | first YOLO run downloads ~6MB model |
| 3.2 | Motion detection module | — | ⬜ | — | write tests/test_motion.py in this task |
| 3.3 | YOLO person detector | 3.1 | ⬜ | — | verify with static test image/video, not live person |
| 3.4 | ByteTrack object tracker | 3.1 | ⬜ | — | |
| 3.5 | Cascading detection pipeline | 3.2, 3.3, 3.4 | ⬜ | — | ⚠️ registration-camera carve-out — read the plan's WARNING block |
| 3.6 | Activity zones | 3.5, 1.1 | ⬜ | — | write tests/test_zones.py in this task |
| 3.7 | Pipeline stats API | 3.5 | ⬜ | — | |

### Phase 4 — Advanced Features

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| 4.1 | Loitering detection | 3.5, 3.6 | ⬜ | — | write tests/test_loitering.py in this task |
| 4.2 | Event thumbnails & snapshots | 2.3 | ⬜ | — | use `THUMBNAILS_DIR` from config, not hardcoded DATA_DIR path |
| 4.3 | Daily summary | 2.3 | ⬜ | — | |
| 4.4 | Mobile push via ntfy.sh | 1.3 | ⬜ | — | |
| 4.5 | Per-person alert cooldown | 3.5 | ⬜ | — | |
| 4.6 | Test suite | (continuous) | ⬜ | — | ⚠️ do incrementally per-module instead of all at the end |
| 4.7 | Deployment & ops | 1.8, 2.1 | ⬜ | — | |

---

## Per-task verification log

> Append an entry per completed/blocked task. Newest last.

<!-- Template:
### Task X.Y — <description>
- **Status**: ✅ / ⛔ / ⏭️
- **Commit**: <sha>
- **Verified**: <commands run + results, or "manual-only, deferred">
- **Deviations**: <none | what changed vs plan and why>
-->

### Task 1.1 + 1.2 — camera config refactor + pydantic
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: `uv run ruff check src/models.py src/config.py` → All checks passed. Python smoke test: legacy fallback yields `macbook_webcam/MacBook_Webcam/macbook` with `rtsp_url=None`; `cameras.json.example` parses into 2 `CameraConfig`s (`source_url` field present, zones parse); `RECORDINGS_DIR`/`THUMBNAILS_DIR` created. Live app-start check deferred to end-of-Phase-1 checkpoint (heavy: loads InsightFace model + webcam).
- **Deviations**: example file at repo root `cameras.json.example` instead of `data/cameras.json.example` — `data/` is fully gitignored so the plan's location would never be committed. `.env.example` also gained `NTFY_TOPIC` (used by Task 4.4) in the same pass.

### Task 1.3 — multi-camera inference loop
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: `uv run ruff check .` → clean (after fixing 6 pre-existing lint errors in main.py/telegram.py/state.py — the plan's "existing codebase passes ruff" prerequisite did not hold). Full `import main` OK (0.9s). `build_camera` handles macbook/rtsp/tapo + raises on missing rtsp_url; `_FpsCounter` measures >0 fps; `state.active_streams` is a dict; registration camera pinned via `state.registration_camera_id` (first enabled camera).
- **Deviations**: camera start failure no longer `return`s out of the loop — marks camera offline in `state.camera_status` and continues (plan: "one failing camera doesn't crash others"). Dev credentials created (`admin` / `DevPass123`) in gitignored `data/credentials.json` for verification.

### Task 1.4 + 1.5 — camera status API + per-camera feeds
- **Status**: ✅
- **Commit**: (this commit)
- **Verified** (live server + curl): `/cameras` returns enriched list with online/fps/last_frame_at; `/cameras/{id}/status` returns detail incl. error; unknown id → 404; `/video_feed`, `/video_feed/grid`, `/video_feed/{id}` all 200 multipart; `/video_feed/{id}` serves real JPEG frames via the encode-once cache (436KB in 3s, JFIF bytes confirmed); bad token → 401. Webcam marked offline gracefully (macOS permission — ⚠️ manual check for user).
- **Deviations**: added `src/camera/video_file.py` (`VideoFileCamera`, type `"file"`, reuses `rtsp_url` as the path) + `scripts/make_test_video.py` — dev infrastructure so the whole pipeline is verifiable without hardware (plan's own dev-testing note suggests looped MP4s; extended to camera input). Dev `data/cameras.json` points at `data/test_clip.mp4` (gitignored).

### Task 1.6 + 1.7 — frontend grid + status polling
- **Status**: ✅ (visual check deferred to user)
- **Commit**: (this commit)
- **Verified**: `npm run build` passes (30 modules). New files lint-clean. Camera payload consumed by `CameraTile` matches the live `/cameras` response shape; feed URL pattern `/video_feed/{id}?token=` already curl-verified in Task 1.5. Polling every 10s per plan.
- **Deviations**: `npm run lint` has 6 **pre-existing** errors/warnings in `RegisterModal.jsx`, `AuthContext.jsx`, `main.jsx` (React Compiler strictness; untouched files) — the plan's "passes npm run lint" prerequisite did not hold. Left as-is: fixing requires restructuring registration logic, risky without browser testing. Flagged for user.

### Task 1.8 — go2rtc integration
- **Status**: ✅ (live proxy verification deferred — binary not installed)
- **Commit**: (this commit)
- **Verified**: config generation unit-checked (empty streams in dev, localhost binds for rtsp/webrtc/api); `go2rtc.yaml` gitignored (contains credentials); live app start shows `[WARN] go2rtc not found …` and continues cleanly; shutdown path terminates proc if present. `pyyaml` added.
- **Deviations**: `start_go2rtc()` skips launch when no RTSP cameras are configured (dev has none) — avoids a useless process. Added explicit `rtsp: listen 127.0.0.1:8554` to the generated config (plan's example omitted it; recorder depends on that port). Note for Task 4.7: Docker compose backend container can't reach go2rtc's `127.0.0.1` unless both use host networking — fix compose there.

### Task 2.3 — SQLite event database (done before 2.1/2.2 per ordering note)
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: `uv run pytest tests/` → 15 passed (11 DB tests incl. thread-safety 4×50 concurrent inserts, disk-aware delete, thumbnail cascade + 4 inference-wiring tests incl. cooldown flood prevention). Live: `data/events.db` created on app startup. Real-face event insertion is a ⚠️ user manual check (synthetic clips have no detectable faces).
- **Deviations**: (1) single persistent SQLite connection instead of per-call connects — plan's code broke `:memory:` tests (each connect() = separate empty DB) and contradicted its own "single connection with a lock" docstring. (2) Added 30s per-camera event cooldown — plan's snippet inserted an event per frame (~30/s) which would flood the DB. (3) ruff UP017 auto-migrated `timezone.utc` → `datetime.UTC` per project lint config.

### Task 2.1 + 2.2 — FFmpeg recorder + disk-aware retention
- **Status**: ✅ (live recording deferred — no ffmpeg binary)
- **Commit**: (this commit)
- **Verified**: `uv run pytest tests/` → 23 passed. Retention matrix covered: kept-when-space-available (60-day file preserved), oldest-purged-first under quota, free-space-threshold stop (dynamic disk mock), strict age mode, `source_url` override, ffmpeg cmd shape, disabled cameras skipped, graceful no-ffmpeg start. Live startup: `[RecordingManager] Started 0 recorders` (dev cameras have recording disabled) with no errors.
- **Deviations**: **fixed a plan bug found by testing** — the purge break condition used `AND` (free-space restored AND quota satisfied); with a genuinely tight volume a camera would delete its entire history even after returning under its quota. Changed to independent stops (`OR` semantics): volume threshold or per-camera cap each halt the purge. `RecordingManager`/`CameraRecorder` accept `recordings_dir` for testability.

### Task 2.4 + 2.5 — events + recordings API
- **Status**: ✅
- **Commit**: (this commit)
- **Verified** (live server, seeded data): `/events` list + camera/type filters + `/events/summary` counts; `/events/999/thumbnail` → 404; `/recordings/storage` per-camera stats; segment listing newest-first + date filter (match and no-match); segment file served; path-traversal attempt blocked (404 — no content leaked); unauthenticated → 401. Ruff clean.
- **Deviations**: none vs the errata-fixed plan. Dev-only: seeded 2 events into `data/events.db` + 2 fake MP4 segments under `data/recordings/test_clip/` for curl verification (gitignored).

### Task 2.6 + 2.7 — event sidebar + recordings playback UI
- **Status**: ✅ (visual check deferred to user)
- **Commit**: (this commit)
- **Verified**: `npm run build` passes; new files lint-clean (6 pre-existing issues unchanged). EventSidebar polls `/events?limit=50` every 15s, thumbnails via `/events/{id}/thumbnail?token=`, red/green coding, collapsible. RecordingsPage: camera/date selectors hit `/recordings/{id}?date=`, player + prev/next + segment list — all endpoints curl-verified in 2.4/2.5. Route `/recordings` + sidebar nav button added.
- **Deviations**: event sidebar is collapsible via header button (plan asked for toggleable; also collapses to a rail with live count).

---

## Session log

> One entry per agent session: what was worked on, where things stopped, anything the next session needs to know.

### Session 1 — 2026-09-18
- Reviewed research.md + implementation-plan.md against actual code; plan assumptions verified correct.
- Initialized this tracker. No implementation work started yet.
- Found plan errata during review; **all fixed in implementation-plan.md this session**:
  1. ✅ `RecordConfig` (Task 1.1) now declares `source_url: str | None = None` — previously Pydantic silently dropped the key, so Task 2.1's dev-testing escape hatch could never activate. Task 2.1 now uses direct attribute access.
  2. ✅ Task 1.5's state snippet now defines `latest_jpeg_bytes` (encode-once cache) alongside `latest_frames`, matching the perf note and the generator code.
  3. ✅ Tasks 2.3 and 4.2 now use env-overridable `THUMBNAILS_DIR` instead of hardcoded `DATA_DIR / "thumbnails"`.
  4. ✅ Same fix for recordings: Task 2.1 recorder and Task 2.5 router now import env-overridable `RECORDINGS_DIR` from config instead of hardcoding `DATA_DIR / "recordings"` (the documented NAS setup depended on this).
  5. ✅ Task 2.2 carries an ordering note (implement after Task 2.3, which it depends on).
  6. ✅ Removed obsolete `version: "3.8"` from the docker-compose sketch (Task 4.7).
