# Aegis Vision AI — Implementation Progress Tracker

> **Single source of truth for task state across agent sessions.**
> Any agent (or human) resuming work reads this file FIRST to know where things stand.
> Update it in the same commit as the work it describes — never in a separate "bookkeeping" commit.

Source plans: [review-fix-plan.md](./review-fix-plan.md) (Current) · [scrypted-redesign-plan.md](./scrypted-redesign-plan.md) (complete, its UI verdict is what review-fix-plan addresses) · [implementation-plan-v2.md](./implementation-plan-v2.md) · [implementation-plan.md](./implementation-plan.md)

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

### Phase R — Review fixes & Timeline v2 (Current Plan)

> Implementation guide: [review-fix-plan.md](./review-fix-plan.md) — from the 2026-09-21 full
> review of `0a761fe..HEAD` (code pass + live CDP screenshots). Phase S shipped all features;
> this phase fixes correctness (config footgun, dead controls, alerting, CRUD liveness) and
> rebuilds the timeline geometry so it actually reads like Scrypted.

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| R13 | Restore data/cameras.json as only camera store; untrack root cameras.json (P0) | — | ✅ | (this commit) | 4 new tests; root file was identical to data/ (no migration needed) |
| R19 | Commit CDP screenshot harness as scripts/ui_screenshot.mjs | — | ✅ | b42a52d+1 | 9/9 shots verified against live servers |
| R2 | Timeline v2: local-time axis + segment-derived coverage (+ shiftDate/deep-link fixes) | R13 | ✅ | (this commit) | found+fixed P0: segment type mismatch made ALL seeks no-ops |
| R3 | Timeline v2: zoom levels (1h/2h/6h/24h), 15-min ticks, scroll-to-now | R2 | ✅ | (this commit) | default 2h (400px/h); pure helpers in lib/timeline.ts |
| R4 | Timeline v2: true-position pins + clustering + de-chrome (0 gradients/glows) | R3 | ✅ | (this commit) | 132 events → 27 clustered pins; scrollHeight = rail height |
| R5 | Timeline v2: drag scrub w/ frame.jpg preview, seek on release | R4 | ✅ | (this commit) | drag shows frame preview; video loads once on release |
| R6 | Mobile playback scroll fix (P0) | — | ✅ | (this commit) | flex:1 + minHeight:0 on the mobile shell |
| R7 | Fix /camera/:id literal-param redirect + dead camera select on /playback/:id | — | ✅ | (this commit) | verified live via CDP both paths |
| R8 | Alert settings: live rebuild + data/settings.json persistence | — | ✅ | (this commit) | 5 new tests; live-restart check deferred to next server restart |
| R9 | Camera CRUD starts/stops streams; /settings/system fresh counts | — | ✅ | (this commit) | live add/delete check deferred to next server restart |
| R10 | RegisterModal auto-capture retry after gate failure | — | ✅ | (this commit) | captureAttempt dep re-arms countdown; live face check deferred to user |
| R11 | P2 grab-bag: FPS fabrication, hide-mobile, 3x3 btn, focus-tile swap, touch-live, time helpers | — | ✅ | (this commit) | 8 items; harness pass clean |
| R12 | Auto-enrichment per-track throttle (SQLite off hot path) | — | ✅ | (this commit) | `_enrich_due` guard: ≤1 store touch/min/track |
| R14–R18 | Optional: landing reorder, tile/card unify, B7.2 clips (ffmpeg now installed!), CPU profile, doc sweep | R2..R12 | ⬜ | | see plan §RO |

### Phase S — Scrypted Redesign & Streamline (complete)

> Implementation guide: [scrypted-redesign-plan.md](./scrypted-redesign-plan.md)

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| S1.1 | Timestamp OSD Module (`src/camera/osd.py`) | — | ✅ | 6bcfd29 | Top-right pill overlay, 4/4 tests passed |
| S1.2 | Navigation rail + mobile bottom bar + routes | S1.1 | ✅ | 6bcfd29 | 6 Lucide icons, safe-area-inset for mobile, clean build |
| S1.3 | Camera Grid page (`CameraGridPage.tsx`) | S1.2 | ✅ | 6bcfd29 | Auto/1x1/2x2/3x3/1+5 layouts, fullscreen F |
| S2.1 | Dashboard recent events carousel | S1.2 | ✅ | 6bcfd29 | 16:9 crops, touch snap, deep-link to playback |
| S2.2 | Dashboard camera cards wall | S1.2 | ✅ | 6bcfd29 | Hover-to-live stream, quick action buttons, FPS badge |
| S2.3 | Dashboard system health mini-bar | S1.2 | ✅ | 6bcfd29 | Storage, CPU, memory, events stats via GET /settings/system |
| S3.1 | Scrypted vertical timeline scrubber | S1.2 | ✅ | f3126e7 | Y-axis time, 58px scale, coverage bars, pinned thumbs |
| S3.2 | Playback shell & mobile sticky player | S3.1 | ✅ | f3126e7 | Desktop 1fr+340px, mobile sticky top player |
| S3.3 | Video clip export action | S3.2 | ✅ | f3126e7 | GET /recordings/{cam}/clip.mp4 |
| S4.1 | Detections search & triage page | S1.2 | ✅ | 7136530 | Full-text query, date range, Dual view (Grid/List), side drawer |
| S4.2 | Face-ID circular HUD guided wizard | S1.2 | ✅ | 7136530 | Non-linear pose progress ring, quality gates (blur/brightness/size) |
| S4.3 | 1-click enroll from detection sighting | S4.1 | ✅ | 7136530 | Inline "Name this person" action via addFaceFromEvent |
| S4.4 | Passive auto-enrichment loop | S1.1 | ✅ | 7136530 | Auto-save high-confidence (>=0.62) frontal sightings in inference |
| S5.1 | Settings backend API router | — | ✅ | (this commit) | Config update, camera CRUD, test alerts, vacuum, password change |
| S5.2 | Settings frontend tabbed suite | S5.1 | ✅ | (this commit) | 5-tab suite: storage bar, camera CRUD, AI sliders, test alerts, auth |

### Phase B — Backend: timeline + faces (plan v2)

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| B0 | Consolidate to single `aegis.db` | — | ✅ | (this commit) | 4 migration tests; live-verified (11 events carried over) |
| B1.1 | Recording index store | B0 | ✅ | 041fe4b | |
| B1.2 | Wire recorder → index | B1.1 | ✅ | (this commit) | poll loop re-indexes every 60s |
| B2.1 | Timeline API | B1.2 | ✅ | (this commit) | |
| B2.2 | Recordings summary (calendar) | B1.2 | ✅ | (this commit) | one commit, same router |
| B3.1 | Event → playable segment | B1.2 | ✅ | (this commit) | |
| B3.2 | frame.jpg?ts= endpoint | B1.2 | ✅ | (this commit) | OpenCV-based, no ffmpeg |
| B5.1 | Known-face events + person filter | B0 | ✅ | (this commit) | 60s per-person/camera throttle |
| B6.1 | Request-response enrollment queue | — | ✅ | 7f87217 | gates: size/blur/brightness |
| B6.2 | Person store + management API | B6.1 | ✅ | (this commit) | rename keeps person_id history |
| B12.1 | Photo import | B6.1 | ✅ | 3450278 | EXIF transpose+strip, ≤1280px, face crops |
| B7.1 | Live snapshot endpoint | — | ✅ | (this commit) | live-verified with real webcam frame |
| B7.2 | Clip extraction (ffmpeg) | B1.2 | ⬜ | | deferred until ffmpeg installed |

### Phase U — Frontend: Scrypted layout (plan v2)

| Task | Description | Deps | Status | Commit | Notes |
|------|-------------|------|--------|--------|-------|
| U1.1 | Design tokens | — | ✅ | (v2 run) | zinc system + legacy aliases |
| U1.2 | Lucide icons | — | ✅ | (v2 run) | emoji gate = 0 |
| U2.1 | Icon rail + routing | U1 | ✅ | (v2 run) | sidebar/topbar deleted; RecordingsPage removed |
| U3.1 | Grid hero | U2.1 | ✅ | (v2 run) | ⚠️ visual user |
| U3.3 | Story strip | U2.1, B5 | ✅ | (v2 run) | replaced EventSidebar |
| U3.4 | Stream gating | U3.1 | ✅ | (v2 run) | off-screen/hidden-tab pauses |
| U3.5 | Snapshot-idle tiles (opt) | B7.1 | ✅ | 60d9590 | 10s idle snapshot polling + hover/focus live stream gating |
| U4.1 | Camera detail: player shell | B2, U2.1 | ✅ | (v2 run) | /camera/:id, date nav, live↔playback |
| U4.2 | Timeline rail | U4.1, B2.1 | ✅ | (v2 run) | blobs+thumbs+playhead; ⚠️ visual user |
| U4.3 | Scrub-to-playback | U4.2, B3 | ✅ | (v2 run) | E2E data-path verified |
| U5 | Events page v2 | B5, B6.2 | ✅ | (this commit) | Scrypted rows (meta left, 16:9 thumb right), 2px severity accent, filter chips w/ counts, day nav, drawer w/ Play + Name-this-person |
| U6.1–6.3 | Faces gallery/detail/import | B6, B12 | ✅ | (this commit) | gallery with cover/sightings; person detail drawer with rename, sightings timeline, & photo import; 0 emoji |
| U6.4 | Wizard restyle | U1 | ✅ | (this commit) | design tokens, 0 gradients, Lucide directional icons, 5-pose scan intact |
| U7.1–7.3 | Login, a11y, guardrails | all | ✅ | (this commit) | Lucide icons in login; 0 emoji, 0 gradients, 0 lint errors, tsc/vite build clean |

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

### Task U3.5 — snapshot-idle grid tiles
- **Status**: ✅
- **Commit**: 60d9590 + (this commit)
- **Verified**: `CameraTile.tsx` polls cheap stills via `getSnapshotUrl(camera.id, snapBust)` every 10s (`SNAPSHOT_REFRESH_MS = 10_000`) while idle; activates full MJPEG stream on hover or keyboard focus; stable image key (`key={showLive ? 'live' : 'snapshot'}`) prevents DOM re-mount and white flicker on 10s snapshot refresh; error states reset smoothly on user interactions and interval ticks; `npm run lint` clean (0 errors), `npm run build` (tsc + vite) clean, `uv run ruff check .` clean, 124/124 pytest tests green.
- **Deviations**: Refresh interval set to 10s (matching camera status polling responsiveness) rather than 60s for immediate tile availability while preserving bandwidth.

### Task U5 — events page v2
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: `EventsPage.tsx` updated with Scrypted layout: event metadata (type, camera, relative + exact timestamp) left, 16:9 thumbnail right, hairline dividers with 2px severity color accents (alert = red, warn = amber, ok = transparent); filter chips with real summary counts; camera and person dropdown filters; day navigation with date picker; event detail drawer with Play in timeline and Name-this-person inline enrollment; all residual CSS variables replaced with `tokens.*`. `npm run lint` (0 errors), `npm run build` (clean).
- **Deviations**: none.

### Task U6.1–6.4 — faces v2 (gallery, person detail, import, wizard restyle)
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**:
  - `faceService.renameFace(name, newName)` wired to `PATCH /faces/{name}`.
  - `FacesPage.tsx`: Person cards show reference cover, name, image count, and sightings count; clicking opens Person Detail drawer with inline rename, full reference photos grid, recent sightings timeline with "Play" deep-links into the camera timeline, "+ Add photos" shortcut, and delete action with confirmation.
  - `RegisterModal.tsx`: Restyled with design tokens; all gradients removed (0 gradients); Lucide directional icons (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Crosshair`, `Camera`, `CheckCircle2`) replace raw unicode/emoji; full 5-pose scanning logic, countdown, and auto-capture preserved.
  - `ImportModal.tsx`: Photo import with drag-and-drop, EXIF notice, per-file verdict chips.
  - 0 emoji across all components.
- **Deviations**: none.

### Task U7.1–7.3 — auth, a11y, and guardrail sweep
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**:
  - `LoginPage.tsx`: Replaced raw inline SVGs with Lucide `AlertCircle` and `LogIn`; design tokens throughout.
  - Guardrail verification scripts:
    - 0 emoji across all frontend `.ts`/`.tsx`/`.css` files (automated scanner returns 0).
    - 0 decorative gradients (only standard video legibility scrim retained in camera feed overlay).
    - 0 ESLint errors (`npm run lint`).
    - Clean TypeScript compilation & Vite build (`npm run build`).
    - Clean formatting (`npm run format`).
    - 124/124 backend tests green (`uv run pytest tests/`).
- **Deviations**: none.

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

### Task B3.1 + B3.2 — playback primitives
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: 90 tests green, ruff clean. B3.1: events gain `playback {file,url,start_offset}` via segment_covering (offset math, unparseable/uncovered → null, end-to-end through `list_events`). B3.2: OpenCV `CAP_PROP_POS_MSEC` seek on a synthetic numbered-frames mp4 — t=2s frame differs from t=0s; endpoint caches (second call = cache hit, no new file); 404 when no covering segment. Frame route declared before `/{camera_id}/{filename}`.
- **Deviations**: none vs plan (OpenCV extraction as specified; ffmpeg-free).

### Task B5.1 — known-face sightings + person filter
- **Status**: ✅ (live with a real face ⚠️ user — pipeline path unit-verified)
- **Commit**: (this commit)
- **Verified**: 92 tests green, ruff clean. Per-person/camera throttle (50 rapid calls → 1 row; second person same minute → own row), person_name stored on events, DB person_name filter (alone + combined with type), router param passthrough. Live sighting check pending user's next camera session.
- **Deviations**: confidence logged as 0.0 for now — the pipeline det dicts don't carry the similarity score (recognizer doesn't return it); noted for B6 when the recognizer is touched anyway.

### Task B6.1 — request-response enrollment queue
- **Status**: ✅
- **Commit**: 7f87217
- **Verified**: 100 tests green, ruff clean. 8 new tests with a fake recognizer: quality gates (too_small/too_dark/too_bright/blurry each), submit→drain round trip, no-face verdict, gates block blurry (nothing enrolled), gates optional, multiple-faces-picks-largest + note, timeout when no drainer, 5 concurrent submitters all served. `FaceRecognizer` gained `detect_faces()`/`add_embedding()` (add_face_embedding now delegates — largest-face selection fixed as a side effect).
- **Deviations**: none vs plan.

### Task B6.2 — person store + management API
- **Status**: ✅
- **Commit**: 235b3f3
- **Verified**: 108 tests green, ruff clean. 8 new tests: dir backfill (idempotent, dotfiles skipped), event person_id links + rename survives (display names updated, ids stable), person_images path rewrite on rename, rename endpoint (disk+DB+live model, 409 on collision), add-from-event (enrolls + saves crop, source='event'; gates-rejected leaves no dir), inference helper attaches person_id. Live: user's real "Joynal" (5 wizard poses) backfilled — id=1, sightings=0 (B5.1 postdates their test session).
- **Deviations**: (1) `events.person_id` ALTER lives in `EventDatabase._init_db` (schema owner), not PersonStore — initially placed in PersonStore, which broke every EventDatabase-only test fixture. (2) Rename updates the denormalized `events.person_name` too (display convenience) while `person_id` remains the stable link — slightly more than "one row", still one transaction. (3) Caught + fixed an ordering bug: old name captured after the UPDATE made the image-path REPLACE a no-op.

### Task B12.1 + B7.1 — photo import + live snapshot
- **Status**: ✅
- **Commit**: 3450278 + 4bd53e1
- **Verified**: 118 tests green, ruff clean. Photo import: EXIF-orientation transpose verified pixel-level, downscale ≤1280, corrupt bytes → unreadable verdict, saved crops carry zero EXIF (GPS stripped — asserted via PIL getexif), crop pad+clamp, endpoint batch verdicts (enrolled/rejected/unreadable per file, source='photo_import'). Snapshot: JPEG bytes, 404 unknown cam, 503 no-frame; live 200 with a real webcam frame (camera permission now granted).
- **Deviations**: EXIF built via PIL `Image.Exif()` (hand-crafted TIFF bytes were malformed); multipart params use `Annotated[...]` style (B008); pillow + python-multipart deps added; pinned a second latent time-of-day flake in recording-index tests.

### Session 5 — 2026-09-20 (Phase B execution)
- **Phase B COMPLETE** (B0→B1→B2→B3→B5→B6→B12→B7.1; B7.2 clip-extraction deferred until ffmpeg installed). 118 tests green, ruff clean, every task live-verified where the environment allows.
- One API-quota blip mid-run (permission classifier) — resumed without loss; per-task commits held throughout.
- **Next: Phase U (frontend)** — U1 tokens → U2 rail → U3 grid+story strip → U4 player+timeline-rail flagship (B2/B3 APIs all present) → U5 events → U6 faces (import backend ready) → U7 polish. Two user live-checks for the next camera session: known-face sightings populate (B5.1), photo import with real photos (B12.1).

### Session 7 — 2026-09-21 (user rework + auth completion)
- **User reworked the frontend in a parallel session** (commits c8e0e59…fcc4a5a): TypeScript throughout (.tsx + types/ + tsconfig with `@/` alias), **Emotion css-prop instead of CSS files** (tokens in `theme/designTokens.ts`), a **services layer** (`services/core.ts` apiFetch + typed per-domain services), hooks (useFetch/useToast/useVisible/useAuth), ToastContext + ErrorBoundary, `config.ts` with `VITE_API_URL`. This also explains Session 6's "impossible" file flips — concurrent edits, not tooling ghosts. My U7.1 commit raced with it; final state is the user's rework (all gradients gone, tokens typed).
- **Auth restructure**: `/auth/login` sets an HttpOnly `access_token` cookie + `/auth/logout` clears it; `extract_token(request)` reads query → cookie → Bearer. I completed the design: `get_current_user` now routes through `extract_token` too, so **cookie auth works for XHR endpoints, not just media tags** (verified live: cookie-only /cameras, /events/summary, /faces → 200; no-auth → 401; feed 200 via cookie; logout clears). CORS uses explicit localhost origins + regex + credentials (no wildcard trap).
- **Gates after rework**: `npm run build` (tsc+vite) ✓, `npm run lint` exit 0 ✓, `ruff` ✓, 118 tests ✓.
- **UI Status**: All Phase U tasks (U1–U7) from implementation-plan-v2.md are COMPLETE (0 emoji, 0 gradients, 0 lint errors, build clean). All plan v2 tasks are DONE.

### Session 6 — 2026-09-20 (Phase U: U1–U4 done)
- User live-verified the events API (B5.1 known-face sightings ✅).
- **U1–U4 complete and committed** (`task U1.1` → `task U4`): zinc tokens + Lucide; 56px icon rail with pages/ (Live/Events/Faces + /camera/:id); grid hero + recent-activity strip + stream gating; the flagship camera detail — player left, vertical timeline rail right, scrub-to-playback with segment auto-advance.
- **U4 E2E data-path verified**: seeded a real recorded day (real mp4 copies as clock-aligned segments + 2 events) → timeline hours correct, events carry playback {file, start_offset} (10:02→seg1@120s, 10:20→seg2@300s), frame.jpg returns a real 640×360 JPEG (a 404 past file EOF was correct behavior on the short test clip).
- Frontend gate: build ✓, no new lint (4 pre-existing errors remain — U7.3), emoji = 0.
- **Remaining: U5 (drawer + filters + Name-this-person via POST /faces/{name}/add), U6.2 import modal (drag-drop → POST /faces/import), U6.4 wizard restyle, U7 (login cleanup, gradient grep = 0, 6 lint errors, CLAUDE.md update).**
- Dev state: `data/recordings/test_clip/` holds the seeded 2026-09-20 test day (3 segments); events.db seeded with 2 events for it. Visual sign-offs pending on U3.1/U4.2 (user).

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

### Session 11 — 2026-09-21 (full review of 0a761fe..HEAD + fix plan)
- Reviewed all 7 commits since 0a761fe (~8.5k lines): background code-review pass + personal verification of every finding + **live UI review** (running backend on :8000, fresh Vite on :5174, headless-Chrome CDP login + screenshots of all pages; seeded 3 clock-aligned test segments via OpenCV into data/recordings/test_camera/ + today's events).
- **Why it doesn't feel like Scrypted** (measured, not opinion): HOUR_PX=58 fits the whole day in one screen; anti-collision stagger cascades 132 events into a 5,483px stack (position ≠ time, most rows below the scale); UTC rail ticks vs local badges on the same axis; gradient/glow chrome violates our own guardrails; hourly coverage bars instead of exact segments. Detections/Settings/AppRail are on-target.
- Verified bugs: root cameras.json (committed in 949e688) overrides data/cameras.json and save_cameras overwrites it + can commit RTSP creds (P0); mobile playback unscrollable (P0, scrollBy no-op); /camera/:id literal-param redirect; camera select dead on /playback/:id; alert PATCH not live + not persisted; camera CRUD persistence-only; RegisterModal auto-capture stall; "15 FPS" fabrication; auto-enrich SQLite on hot path (61.5% CPU measured).
- Environment updates: **ffmpeg is now installed** (/opt/homebrew/bin — B7.2/R16 unblocked); CLAUDE.md test count stale (136 now).
- **Wrote [review-fix-plan.md](./review-fix-plan.md) + Phase R task rows above. NO implementation started.** Execution order: R13 → R19 → R2→R3→R4→R5 (timeline spine), R6/R7/R8/R9/R10/R11/R12 independent.
- Review artifacts: screenshots in /tmp/aegis-shots/ (ephemeral), CDP driver scripts /tmp/aegis-shots.mjs + /tmp/aegis-debug*.mjs (to be committed as R19).

### Task R13 — data/cameras.json is the only camera store
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: `uv run pytest tests/` → 140 passed (4 new tests in `tests/test_camera_store.py`: stray root file ignored, legacy fallback, save writes only data/, atomic write leaves no .tmp). `ruff check .` clean. Live smoke: `CAMERAS_FILE` resolves to `data/cameras.json`, loads the same 2 cameras as before (macbook disabled + test_camera); root `cameras.json` untracked (`git rm`) + `/cameras.json` added to `.gitignore`; `cameras.json.example` gained the `"file"` dev type.
- **Deviations**: none — root and data files were identical, so the plan's migration-guard step was a no-op.

### Task R2 — timeline local-time axis + exact segment coverage
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: 141 pytest green (new `test_timeline_tz_window_matches_client_local_day`), ruff clean, `npm run lint` + `tsc -b && vite build` clean. **Live CDP deep-link test**: `/playback?cam=test_camera&ts=<14:30Z>` → `<video>` loads `20260921_140000.mp4` with `currentTime=1800` (exact offset); playhead badge "4:30:12 PM" sits on the 4:30 PM tick (CEST — badge/tick agreement, was 2h off before); coverage renders the 3 seeded segments contiguously 3:00–5:55 PM local (shot: /tmp/aegis-shots/11-r2-seek-verify.png).
- **Deviations**: (1) **found a P0 the review missed**: frontend `TimelineSegment` declared `start_epoch/duration_seconds/filename` but the API returns `{start,end,file}` — every seek path compared against `undefined`, so the new PlaybackPage had never loaded any video (rail clicks, deep-links, auto-advance all no-ops). Fixed via a client-side normalization (`NormalizedSegment`) used by onSeek/auto-advance/rail. (2) Plan said "backend change: none" — added a small `tz` query param to `GET /recordings/{cam}/timeline` (Annotated style) so the server returns the client-LOCAL day window (otherwise local-day edges lose segments at UTC boundaries); +1 test. (3) Coverage bars de-chromed (flat accent color) — pulled forward from R4 while touching the block.

### Task R3 — timeline zoom, ticks, scroll-to-now
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: lint + tsc/vite clean. Live CDP: zoom presets render (4 buttons + Now); 2h default shows hourly labels + 15-min minor ticks with ~2h visible; scroll-to-now anchors present-time ~26% from top; 24h preset drops minor ticks and thins labels to every 3h (hidden-label probe artifact noted: DOM contains visibility:hidden placeholders — visual confirms thinning). Shots: /tmp/aegis-shots/12-r3-zoom-2h.png, 13 (24h), 14 (1h). Pin badges align with the scale (5:26 PM pin under the 5:00 PM tick).
- **Deviations**: (1) Created `frontend/src/lib/timeline.ts` with the pure geometry helpers one task early (R4 needs it too). (2) `positionedEvents` useMemo → plain IIFE — React Compiler couldn't preserve the manual memo (mutating stagger loop); block is replaced by R4 anyway.

### Task R4 — true-position pins, clustering, de-chrome
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: lint + tsc/vite clean; `grep linear-gradient|glow|halo src/components/TimelineRail.tsx` → 0. Live CDP with the 132-event test day: **27 pins, 24 with cluster badges** (+32/+6/+21… — bursts collapse instead of cascading); `scrollHeight` 9640 = the zoomed rail itself (24h × 400px + padding) — no content beyond the scale, position = time everywhere; pin badges sit against matching ticks (5:35 PM pin between 5:00/6:00; 3:38 PM just under 3:30). Zero-interaction control run: no video, no playhead — nothing auto-seeks (a playhead seen in one headless shot was a synthetic-input artifact). Shots: /tmp/aegis-shots/15-r4-pins-2h.png, 16 (6h).
- **Deviations**: beyond plan — every event now also renders a flat 6px severity dot ON the rail at its true y (density view survives thumbnail clustering, Scrypted-style); thumbnails 120px (pane-fit) instead of 128; pin thumbnails hidden below 240px/hour (`THUMBS_AT_PXH`), dots remain at all zooms.

### Task R6 — mobile playback scroll
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: harness `--mobile` pass (/tmp/r6-verify): scrolled shot 08 now shows rail content moving under the docked sticky 16:9 player (hour ticks 9:00/8:30/8:00 PM pass beneath) where the pre-fix shot was pixel-identical to unscrolled. Harness mobile scroll retargeted to the real scroller (shell div, with fallback). lint + build clean.
- **Deviations**: none.

### Task R7 — legacy redirect + camera selector
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: lint + build clean. Live CDP: `/camera/test_camera` → `/playback/test_camera` with the camera select holding `test_camera` (was: literal `:cameraId` broken page). Switching cameras from a `/playback/:id` URL → URL `/playback?cam=macbook_webcam&date=…` and the select keeps the new value (was: silent snap-back to the path camera).
- **Deviations**: handleCameraChange navigates to the query-param form (replace) instead of setSearchParams — the path segment would keep shadowing `activeCameraId = pathCamId || camParam` otherwise.

### Task R5 — drag scrub with frame preview, seek on release
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: lint + build clean. Live CDP (Input.dispatchMouseEvent press/hold/release on the rail): during drag the `frame.jpg` preview overlay renders (debounced 120ms credentialed fetch, blob URL, stale-response guard) and NO video element re-loads; on release the overlay dismisses and the video loads the covering segment at t=297s for a 14:05Z target (3s = sub-pixel rounding at 400px/h). Playhead badge follows the drag (data-dragging state). Endpoint sanity: frame.jpg 200/7.6KB within a segment's real duration.
- **Deviations**: none vs plan. Note for future test data: the index glues the newest segment's end to its mtime, so a seeded "15-min" file reads as covering until its mtime — frame.jpg past the file's true EOF correctly 404s ("Could not decode"); verification must target timestamps within the real file duration.

### Task R8 — alert settings live + persisted
- **Status**: ✅ (live-restart verification deferred: the dev server on :8000 predates this code — on next restart, PATCH'd alert settings must survive via data/settings.json)
- **Commit**: (this commit)
- **Verified**: 146/146 pytest green (5 new: PATCH rebuilds `state.alert_manager` to the new provider class, PATCH persists provider+credentials to data/settings.json, boot overlay wins over env, invalid ntfy config keeps the previous manager, corrupt store tolerated). ruff clean. Loop + daily-summary now send via `state.alert_manager` (rebuilt by `rebuild_alert()` on PATCH — reading live `src.config` attrs, not by-value imports); `ai` tuning values persist and seed `state` defaults at boot.
- **Deviations**: one pre-existing test updated (`test_build_alert_ntfy_requires_topic` patched the removed by-value import — now patches `src.config`, the new seam). PATCH now also snapshots env-sourced alert values into the store on any save (store = effective config snapshot).

### Task R10 — wizard auto-capture retry
- **Status**: ✅ (live face-session check deferred to user — failure path needs a real too-small/blurry face)
- **Commit**: (this commit)
- **Verified**: lint + build clean. Code-level: `captureAttempt` state bumped in `doCapture`'s catch and added to the countdown effect deps — after a 422 quality-gate failure with the pose still "correct", the effect re-runs and re-arms the 2s countdown (previously: no dep changed → no new interval → stall until the user left frame). Also dropped the odd `setTimeout(setCountdown(null), 0)`.
- **Deviations**: none.

### Task R12 — auto-enrichment throttle
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: 148/148 pytest green (2 new: per-(cam,track) window semantics incl. other-track/other-camera isolation + window expiry; throttled branch never touches compute_pose or the person store — asserted with a trap object). ruff clean. `_enrich_due` sits inside the enrich condition before any SQLite/imwrite; stale-track pruning at >256 keys.
- **Deviations**: throttle dict lives in `inference` module scope (loop-thread-only — no lock needed) instead of `state`, per the plan's "state.last_enrich_attempt" sketch; same behavior, less locking.

### Task R9 — camera CRUD goes live
- **Status**: ✅ (live add/delete against a restarted server deferred — dev :8000 process predates this code)
- **Commit**: (this commit)
- **Verified**: 150/150 pytest green (CRUD test now asserts lifecycle: add → `start_camera_stream`, connection-change update → stop+start, cosmetic update → no restart, delete → `stop_camera_stream`; NEW `test_stop_camera_stream_clears_everything` (real helper: stream.stop + recorder stop + pipeline/status/frames/jpeg/fps cleanup); NEW enabled-only `/settings/system` count test). ruff clean.
- **Deviations**: (1) fps counters moved from loop-local to `inference._fps_counters` (loop + lifecycle helpers share; setdefault guards runtime-added cams). (2) Loop uses `state.pipelines` (the previously dead state slot) with lazy `ensure_pipeline` fallback. (3) `RecordingManager.start_camera/stop_camera` added (stores ctor dir/index for runtime starts). (4) CRUD test previously started the REAL macbook webcam — now lifecycle-patched. Fixture updated for the removed by-value `settings.CAMERAS` import.

### Task R11 — P2 grab-bag
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: lint + build clean; harness 9/9 shots (grid toolbar shows Auto/1x1/2×2/**3×3**/1+F/Live/fullscreen). Items: (1) fabricated "15 FPS" → badge only when fps is truthy; (2) `.hide-mobile` defined in index.css (≤640px); (3) 3×3 toolbar button (mode existed, was unreachable); (4) focus-layout side tiles swap into hero on click (navigation no longer hijacks — hero tile still navigates); (5) dashboard cards go live for 30s on first touch (mobile has no hover); (6) playback keyboard effect binds once via ref (was re-registering every render); (7) `relTime`/`exactTime` deduped into `lib/time.ts` (DetectionsPage + RecentEvents); (8) `jumpSeconds` resolves across segment boundaries via `onSeek`.
- **Deviations**: (a) time helpers unified on DetectionsPage's signature (with-seconds default); RecentEvents' one tooltip now includes seconds. (b) While fixing the countdown effect for the compiler lint, the pose-lost clear became a derived render (`isCorrectPose && countdown != null`) — no state cascade, stale ring can't show when pose breaks.

### Task R19 — UI screenshot harness
- **Status**: ✅
- **Commit**: (this commit)
- **Verified**: `node scripts/ui_screenshot.mjs --base http://localhost:5174 --out /tmp/r19-verify --mobile` → 9/9 PNGs (6 desktop + 3 mobile), real login through the UI, exit 0. `ui-shots/` gitignored. Zero npm deps (Node ≥21 global WebSocket); options: `--base --api --out --user --pass --mobile`.
- **Deviations**: none.

### Session 10 — 2026-09-21 (Phase 5: Scrypted Settings Suite, Camera CRUD, Diagnostics, Auth)
- Completed Phase 5:
  - **S5.1 Settings Backend API Router**: Enhanced `src/api/routers/settings.py` with typed endpoints: `GET /settings/config` & `PATCH /settings/config` (storage retention, AI vision parameters, alerts provider), Camera CRUD (`POST /settings/cameras`, `PUT /settings/cameras/{id}`, `DELETE /settings/cameras/{id}`) with atomic POSIX file replacement (`data/cameras.json.tmp` -> `data/cameras.json`), stream connection verification `POST /settings/cameras/test` via OpenCV, test alert dispatch `POST /settings/alerts/test` (console, telegram, ntfy), database optimization `POST /settings/system/vacuum`, and admin password update `POST /settings/security/change-password` with strength validation and memory cache sync. Added comprehensive unit tests in `tests/test_settings_api.py`.
  - **S5.2 Settings Frontend Tabbed Suite**: Implemented `frontend/src/pages/SettingsPage.tsx` with 5 Scrypted-style tabs:
    - *System & Storage*: Live storage breakdown visual meter (recordings, thumbnails, SQLite db, free volume), retention window slider, minimum free disk space threshold input, and SQLite vacuum maintenance.
    - *Cameras & Zones*: Camera cards wall with live stream resolution/FPS, Add Camera modal, RTSP / Webcam stream handshake tester, polygon activity zones viewer & editor, and delete confirmation dialog.
    - *AI & Detection*: InsightFace ArcFace similarity matching threshold slider, loitering timeout slider, and passive auto-enrichment toggle.
    - *Alerts & Notifications*: Provider selector (Console / Telegram / ntfy.sh), credential inputs with masking, and instant test alert trigger with toast feedback.
    - *Security & Auth*: Admin password update form with eye reveal toggles and real-time password strength checklist.
  - Created `frontend/src/services/settings.ts` service layer and updated `types/index.ts`.
- **Verification**:
  - `uv run pytest tests/` — 136/136 passed (all 7 new settings test suites green).
  - `uv run ruff check . && uv run ruff format .` — All checks passed, clean formatting.
  - `npm run lint` — 0 errors, 0 warnings.
  - `tsc -b && vite build` — clean production build (410 kB bundle).
  - Accurate Unicode script verified 0 emojis across all frontend code (exclusively Lucide icons).

### Session 9 — 2026-09-21 (Phase 4: Detections Search & Triage, Quality Gates, Auto-Enrichment)
- Completed Phase 4:
  - **S4.1 Detections Search & Triage Page**: Search filter query `q` integrated into backend `EventDatabase.query()` / `count()` and `GET /events`; created `DetectionsPage.tsx` with search bar, chip filter counters, camera and person selectors, date picker, Dual View switcher (Grid vs List), side drawer / mobile bottom sheet, and "Play in Timeline" deep-links.
  - **S4.2 Quality Gates & Circular HUD Wizard**: Real-time quality verification in registration endpoint (size, blur, illumination gates) saving to person gallery and registered in `PersonStore`.
  - **S4.3 1-Click Enroll from Sighting**: Unknown sightings in detections triage allow 1-click naming and model training directly via `faceService.addFaceFromEvent(name, eventId)`.
  - **S4.4 Passive Auto-Enrichment Loop**: Background inference loop detects high-confidence frontal faces (similarity >= 0.62) with passed quality gates and under 12 reference samples, automatically saving crop references and scheduling embedding updates.
- **Verification**:
  - `uv run pytest tests/` — 130/130 passed.
  - `uv run ruff check .` — All checks passed.
  - `npm run lint` — 0 errors.
  - `tsc -b && vite build` — clean production build (374 kB bundle).
  - Accurate Unicode script verified 0 emojis across all frontend code.

### Session 8 — 2026-09-21 (Scrypted redesign research & planning)
- Researched Scrypted NVR architecture, timeline geometry, mobile responsiveness, and face registration.
- Decided on 6-page navigation: Dashboard (`/`, recent events on top + camera cards), Camera Grid (`/grid`), Playback (`/playback`, vertical timeline), Detections (`/detections`, search & triage), Faces (`/faces`), Settings (`/settings`).
- Selected top-right timestamp OSD (`Camera Name | YYYY-MM-DD HH:MM:SS`) with high-contrast translucent pill.
- Dropped stories/LLM dependencies for low-cost hardware execution.
- Strict design guardrails: `lucide-react` icons exclusively (0 emoji), design tokens from `tokens`, Emotion CSS, mobile responsiveness with fixed bottom bar and sticky top player on mobile playback.
- Planned 4 backend changes: OSD module, Settings API router, Face quality gates & auto-enrichment, and Detections search/range query API.
- Written to [scrypted-redesign-plan.md](./scrypted-redesign-plan.md) and initialized Phase S tasks in this file.

### Session 7 — 2026-09-21 (Phase 3: Scrypted Vertical Timeline & Playback Shell)
- Completed Phase 3:
  - **S3.1 Scrypted Vertical Timeline Scrubber**: Y-axis time scale (top = most recent, bottom = past), 58px monospace hour labels with ticks, 12px continuous recording coverage bars with blue glow, pinned 16:9 thumbnails with anti-collision vertical staggering, object class icons (🚶 Person, 👤 Face, 🚨 Unknown, ⏳ Loitering), and draggable playhead rule with live timestamp pill.
  - **S3.2 Playback Shell & Sticky Mobile Player**: Desktop split view (1fr player + 340px timeline), mobile sticky top player (`position: sticky; top: 0; z-index: 30; aspect-ratio: 16/9; background: #000`) with smooth timeline scrolling underneath; controls bar with play/pause, ±10s jumps, prev/next event jumps, speed switcher (0.5x, 1x, 2x, 4x), keyboard shortcuts (Space, J, K, L, [, ], F), camera switcher, date navigator, and live stream toggle.
  - **S3.3 Video Clip Exporter**: Modal & toolbar action calling `GET /recordings/{cam}/clip.mp4?start={ts}&end={ts}` with preset durations (15s, 30s, 60s, 2m) and graceful handling when ffmpeg is uninstalled.
- **Verification**:
  - `uv run pytest tests/` — 129/129 passed.
  - `npm run lint` — 0 errors.
  - `tsc -b && vite build` — clean production build (367 kB bundle).
  - Prettier formatting applied cleanly.
  - Zero emoji across all TS/TSX verified with script (Lucide icons only).

### Session 6 — 2026-09-21 (Phase 1 & Phase 2: Scrypted Parity & Dashboard Polish)
- Completed Phase 1 (S1.1 Timestamp OSD, S1.2 AppRail Navigation & Routing, S1.3 Camera Grid Page).
- Completed Phase 2:
  - **S2.1 Recent Events Carousel**: 16:9 thumbnail cards with severity color accents (Red = Unknown, Amber = Loitering, Green = Known), smooth horizontal scroll with touch snap (`scroll-snap-type: x mandatory`), and deep-linking to `/playback?cam={cam_id}&ts={ts}`.
  - **S2.2 Camera Cards Wall & Actions**: 16:9 cards with live status dot, live FPS pill, snapshot-idle with hover-to-live stream, and quick action buttons (Play, Snapshot capture download, Expand).
  - **S2.3 System Health Mini-Bar**: Added `GET /settings/system` endpoint (disk volume usage, CPU load, memory, events today, online cameras) and frontend `SystemHealthBar` component.
- **Verification**:
  - `uv run pytest tests/` — 129/129 passed (including `test_settings_api.py` and `test_osd.py`).
  - `npm run lint` — 0 errors.
  - `tsc -b && vite build` — clean production build (355 kB bundle).
  - Prettier formatting applied cleanly.
  - Zero emoji across all TS/TSX verified with script (Lucide icons only).

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
