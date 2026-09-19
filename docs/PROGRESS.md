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

### Phase B — Backend: timeline + faces (plan v2)

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| B0 | Consolidate to single `aegis.db` | — | ✅ | (this commit) | 4 migration tests; live-verified (11 events carried over) |
| B1.1 | Recording index store | B0 | ✅ | 041fe4b | |
| B1.2 | Wire recorder → index | B1.1 | ✅ | (this commit) | poll loop re-indexes every 60s |
| B2.1 | Timeline API | B1.2 | ✅ | (this commit) | |
| B2.2 | Recordings summary (calendar) | B1.2 | ✅ | (this commit) | one commit, same router |
| B3.1 | Event → playable segment | B1.2 | ⬜ | | |
| B3.2 | frame.jpg?ts= endpoint | B1.2 | ⬜ | | |
| B5.1 | Known-face events + person filter | B0 | ⬜ | | |
| B6.1 | Request-response enrollment queue | — | ⬜ | | |
| B6.2 | Person store + management API | B6.1 | ⬜ | | |
| B12.1 | Photo import | B6.1 | ⬜ | | |
| B7.1 | Live snapshot endpoint | — | ⬜ | | |
| B7.2 | Clip extraction (ffmpeg) | B1.2 | ⬜ | | deferred until ffmpeg installed |

### Phase U — Frontend: Scrypted layout (plan v2)

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| U1.1 | Design tokens | — | ⬜ | | |
| U1.2 | Lucide icons | — | ⬜ | | |
| U2.1 | Icon rail + routing | U1 | ⬜ | | |
| U3.1 | Grid hero | U2.1 | ⬜ | | |
| U3.3 | Story strip | U2.1, B5 | ⬜ | | |
| U3.4 | Stream gating | U3.1 | ⬜ | | |
| U3.5 | Snapshot-idle tiles (opt) | B7.1 | ⬜ | | |
| U4.1 | Camera detail: player shell | B2, U2.1 | ⬜ | | |
| U4.2 | Timeline rail | U4.1, B2.1 | ⬜ | | |
| U4.3 | Scrub-to-playback | U4.2, B3 | ⬜ | | |
| U5 | Events page v2 | B5, B6.2 | ⬜ | | |
| U6.1–6.3 | Faces gallery/detail/import | B6, B12 | ⬜ | | |
| U6.4 | Wizard restyle | U1 | ⬜ | | |
| U7.1–7.3 | Login, a11y, guardrails | all | ⬜ | | |

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
| 3.1 | Add ultralytics + supervision deps | — | ✅ | — | supervision pinned <0.31 |
| 3.2 | Motion detection module | — | ✅ | — | |
| 3.3 | YOLO person detector | 3.1 | ✅ | — | verified on bundled bus.jpg |
| 3.4 | ByteTrack object tracker | 3.1 | ✅ | — | |
| 3.5 | Cascading detection pipeline | 3.2, 3.3, 3.4 | ✅ | — | live-verified: 98% cache hit rate |
| 3.6 | Activity zones | 3.5, 1.1 | ✅ | — | zone module + tests done; pipeline integration in 3.5 |
| 3.7 | Pipeline stats API | 3.5 | ✅ | — | |

### Phase 4 — Advanced Features

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| 4.1 | Loitering detection | 3.5, 3.6 | ✅ | — | 6 tests; live path fires via pipeline flag |
| 4.2 | Event thumbnails & snapshots | 2.3 | ✅ | — | bbox-cropped + padded; retention sweep every 15 min |
| 4.3 | Daily summary | 2.3 | ✅ | — | scheduler daemon at 08:00 local; own cooldown bucket |
| 4.4 | Mobile push via ntfy.sh | 1.3 | ✅ | — | ⚠️ live push needs a real topic + phone — user manual check |
| 4.5 | Per-person alert cooldown | 3.5 | ✅ | — | 7 tests incl. the two-unknowns regression |
| 4.6 | Test suite | (continuous) | ✅ | — | 60 tests written alongside each module |
| 4.7 | Deployment & ops | 1.8, 2.1 | ✅ | — | ⚠️ docker absent here — compose up is a user manual check | |

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

### Task B0 — single aegis.db
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: 4 new migration tests (copy+rename, idempotency, no-clobber, post-migration inserts) + full suite 64 passed, ruff clean. Live: app start migrated the dev `data/events.db` (11 events from manual testing) → `data/aegis.db`, legacy renamed `events.db.migrated`, `/events/summary` returns all 11 rows.
- **Deviations**: none vs plan. Class name `EventDatabase` kept (it's now the app DB; a rename would churn every caller for zero behavior change — noted for a future tidy-up).

### Task B1.1 + B1.2 — recordings index + recorder wiring
- **Status**: ✅ (live rotation verification ⚠️ deferred until ffmpeg installed — unit-verified with simulated rotations)
- **Commit**: 041fe4b + (this commit)
- **Verified**: 78 tests green, ruff clean. B1.1: filename parsing, backfill (gap trade-off documented), idempotent + size-aware rescans, covering/overlap queries, days list, delete paths. B1.2: start-backfill (runs before+independent of the ffmpeg check — caught by test), simulated rotation picked up by rescan, retention drops index rows for deleted files, index optional for standalone recorders, live startup clean (`Started 0 recorders` — dev cams have recording off).
- **Deviations**: (1) recorder monitor loop changed from blocking `wait()` to a 60s poll that rescans the directory — rotation lands in the index within ~a minute and the in-progress segment's end/size stay fresh (growing mtime). (2) `EventDatabase` now created in lifespan (before recorders) instead of the inference thread; the loop falls back to creating it if absent. (3) `RecordingIndex.delete_path()` added (retention sync).

### Task B2.1 + B2.2 — timeline + calendar APIs
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: 84 tests green, ruff clean. 6 new tests: hour buckets (segment-minutes incl. cross-hour clipping, events/unknowns per hour, camera isolation, quiet-hour zeros), empty day, bad-date 422 ×3 shapes, summary days, summary empty. Live: `/recordings/summary` → `{"days":["2026-09-18"]}`; timeline returns the two dev segments with correct grid + per-hour minutes.
- **Deviations**: (1) startup backfill moved from recorder-start to lifespan `scan_directory()` for ALL cameras — otherwise footage from cameras with recording disabled was invisible (found in live verification). (2) Fixed a latent time-of-day flake in a B1.1 test (unpinned mtime inflated the newest segment's end). (3) `EventDatabase.query_raw()` read-only escape hatch added for the GROUP BY.

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

### Task 3.1–3.4 + 3.6 (modules) — motion, YOLO, ByteTrack, zones
- **Status**: ✅ (3.6's pipeline integration lands with 3.5)
- **Commit**: (this commit)
- **Verified**: `uv run pytest tests/` → 42 passed. Motion: static scene → no motion, moving box detected, sub-min-area specks ignored. YOLO: ≥3 people detected in ultralytics' bundled `bus.jpg` (real detection, real bboxes/conf), blank frame → 0, supervision format carries only class 0. Tracker: stable ID across smooth motion, NEW ID after 60 empty frames, cache cooldown + expiry (mocked clock) + stale cleanup. Zones: inside/outside/multi-zone/tagging/passthrough.
- **Deviations**: (1) supervision pins `<0.31` — ByteTrack is deprecated (removal in 0.31) with no in-package replacement yet; warning filtered at our import site with an upgrade note. (2) tracker import uses `supervision.tracker.ByteTrack`. (3) tracker test feeds 3 consecutive re-entry frames because ByteTrack confirms new tracks over a couple of frames.

### Task 3.5 + 3.7 — cascading pipeline + diagnostics API
- **Status**: ✅
- **Commit**: (this commit)
- **Verified** (live server, 40s run, real-people clip `data/test_people.mp4` built from ultralytics' bus.jpg): `/diagnostics/pipeline` shows the cascade working end-to-end — 244 frames → 63 motion-skipped (25.8%) → 181 with persons → **7 recognition calls vs 353 cached (98.1% cache hit)**. 2 unknown_face events logged (30s cooldown) with `{"track_id": 2}` metadata + JPEG thumbnails on disk, served via `/events/{id}/thumbnail` (200 image/jpeg). Registration camera carve-out confirmed: `frames_skipped_no_motion=0` on the registration cam (motion gate off), raw InsightFace path feeds face_status. Both cams ~7 fps. 42 unit tests green, ruff clean.
- **Deviations**: pipeline annotation adds `[zone]` to labels when zones configured (part of 3.6 integration). Events carry track_id in `metadata` JSON. Registration-cam carve-out runs BOTH pipeline + raw InsightFace per plan's WARNING block (extra compute accepted).

### Task 4.1–4.5 — loitering, thumbnails, summary, ntfy, per-person cooldown
- **Status**: ✅ (ntfy live push + visual checks deferred to user)
- **Commit**: (this commit)
- **Verified**: 60 tests green, ruff clean. Loitering: 6 state-machine tests (threshold, once-only, known-exempt, zone-exit reset, cleanup). Thumbnails: bbox+20px-pad crop test, independent throttle keys (loitering vs unknown). Summary: counts/busiest camera/hour/empty-db/window-exclusion tests. Cooldown: two different unknowns both fire (the old global-cooldown bug), same person suppressed, expiry via mocked clock, ntfy no-op without main loop. `generate_daily_summary` avoids CPython's triple-quoted-f-string quote nesting SyntaxError.
- **Deviations**: per-person cooldown lives in `AlertManager` base (shared dict) rather than duplicated per implementation; alerts pass `person_key=f"unknown#{track_id}"`; daily summary uses its own cooldown bucket so a 07:59:55 alert can't suppress the 08:00 summary.

### Task 4.6 — test suite
- **Status**: ✅ (done continuously, as the tracker protocol requires)
- **Commit**: spread across all task commits
- **Verified**: `uv run pytest tests/` → 60 passed in ~11s, no hardware, no network (YOLO test uses the bundled bus.jpg; model downloaded once at first run).
- **Deviations**: none.

### Task 4.7 — deployment & ops
- **Status**: ✅ (compose up deferred — docker not installed on this machine)
- **Commit**: (this commit)
- **Verified**: `plutil -lint deploy/aegis-vision.plist` → OK. Dockerfile/docker-compose/frontend Dockerfile written; `GO2RTC_HOST` env added to recorder so the backend reaches go2rtc by service name in compose (fixes the Task 1.8 networking note). go2rtc-docker.yaml.example binds 0.0.0.0 (compose-internal only, nothing published). systemd unit includes hardening (ProtectSystem=strict, ReadWritePaths=data).
- **Deviations**: separate `go2rtc-docker.yaml` (0.0.0.0 binds) vs bare-metal `go2rtc.yaml` (127.0.0.1 binds) — containerized go2rtc can't bind loopback for inter-container traffic.

---

## Maintenance watch

| Item | Trigger | Action |
|------|---------|--------|
| supervision ByteTrack removal | supervision 0.31 ships (0.30.4 is latest as of 2026-09-19; we pin `<0.31`) | Migrate `src/detection/tracker.py` to the external `trackers` package (Roboflow's documented successor, v2.6.0, active) — swap import + adapt `update()`, same tests. Fallbacks: vendor supervision's byte_tracker module (Apache-2.0, pure numpy) or BoxMot. |
| InsightFace model cache | fresh machine / clean deploy | buffalo_l (~330MB) auto-downloads to `~/.insightface/models` on first run; yolov8n.pt (~6MB) to project root. Both need internet once. |
| Frontend lint debt | next frontend touch | 6 pre-existing React Compiler errors in RegisterModal/AuthContext/main.jsx (predate this work) |

## Session log

> One entry per agent session: what was worked on, where things stopped, anything the next session needs to know.

### Session 3 — 2026-09-19 (UI redesign research)
- User verified manual testing end-to-end (face registration + detection) ✅.
- UI dissatisfaction: "generic AI bloat", sidebar list instead of grid hero, emoji icons → full research run (3 parallel research agents + pixel-level analysis of Synology SS9 and Netguru PSIM screenshots).
- **Wrote [ui-research.md](./ui-research.md) + [ui-plan.md](./ui-plan.md). NO implementation done — plan awaits user approval.** Execute with the same per-task protocol (tasks U1.1–U7.2). Note: user's `format fix` commit (single-quote reformat) is the current baseline; `ruff check` + 60 tests still pass on it.

### Session 4 — 2026-09-19 (Scrypted deep-dive)
- User chose Scrypted as the design target (timeline, events, settings, mobile) + wants smoother face management → deep research.
- Subagent API hit a 5h rate limit mid-run; research completed directly via curl (docs.scrypted.app, docs.frigate.video, Frigate API source `frigate/api/record.py`+`media.py`+`preview.py`) + pixel analysis of Scrypted timeline screenshot.
- Key answers: **Scrypted HAS face recognition for known people** (docs) — ours is recognition-equal-or-better, behind on integration. Frigate's timeline is powered by a SQLite recordings index + summary APIs + frame-at-time/clip endpoints; our MP4 serving already supports Range seeking (verified: 206).
- **Wrote [scrypted-research.md](./scrypted-research.md): backend additions spec (B1–B6 must, B7–B11 nice) + face enrollment v2 (quality gates, passive enrichment, enroll-from-event, Faces gallery v2) + timeline UI mechanics. NOT implemented.** ui-plan.md §layout superseded → v2 pending user approval.
- MCP search quotas (Z.ai web-search/web-reader) exhausted until 2026-10-13; use curl/WebSearch fallbacks in future sessions.
- User added scope: **enroll from photos** (B12) — spec'd in scrypted-research.md §4a (request-response over the pending queue keeps ONNX single-threaded; EXIF strip for privacy).
- **[implementation-plan-v2.md](./implementation-plan-v2.md) written and approved for execution** — phases B1–B7 (backend: recordings index, timeline API, playback primitives, known-face events, faces API v2 + photo import) then U1–U7 (Scrypted-layout frontend: rail, grid+story strip, player+timeline-rail flagship, events v2, faces v2, polish). ui-plan.md marked superseded. Execution order: B1 first; U1/U2 may interleave.

> One entry per agent session: what was worked on, where things stopped, anything the next session needs to know.

### Session 2 — 2026-09-18 (implementation run)
- **All 26 tasks across all 4 phases implemented and committed** (baseline `f8420fa` docs commit → per-task commits through Task 4.7).
- Final state: 60 pytest tests green · ruff clean · frontend builds · full-system live checkpoint passed (all endpoints 200, pipeline 98% cache-hit, events with thumbnails flowing).
- Environment limits hit (and worked around): no webcam permission (macOS dialog — file-camera stand-in), no ffmpeg, no go2rtc binary, no Tapo hardware, no docker.
- Dev conveniences added: `data/cameras.json` with two `file`-type cameras (`test_clip` + `test_people`), test clips in `data/`, dev credentials `admin`/`DevPass123`.

#### ⚠️ Manual verification backlog for the human (trial-and-error welcome)
1. **Webcam**: grant Terminal camera permission → swap `data/cameras.json` to a `macbook` camera → live feed in grid.
2. **Registration wizard**: 5-pose flow with a real face (`/register/face_status` + capture).
3. **Tapo camera**: add to `cameras.json` with real RTSP creds → detection + grid tile.
4. **go2rtc + ffmpeg**: `brew install go2rtc ffmpeg` → recording segments appear in `data/recordings/<cam>/`, playback page plays them.
5. **Telegram alerts**: real `TELEGRAM_BOT_TOKEN`/`CHAT_ID` in `.env` → phone gets photo alerts; two unknown people → two alerts (not cross-suppressed).
6. **ntfy**: set `NTFY_TOPIC` + `ACTIVE_ALERT=ntfy` in config → subscribe on phone, verify push with image.
7. **Frontend visuals**: grid layout, expand-on-click, event sidebar collapse, recordings page nav (all API-verified; rendering unseen).
8. **Docker**: `docker compose up -d` on a machine with docker.
9. **Real loitering**: configure a zone on a camera, stand in it past the threshold → one loitering alert + event.

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
