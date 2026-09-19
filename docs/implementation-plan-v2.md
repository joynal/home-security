# Aegis Vision — Implementation Plan v2 (Scrypted-style UI + supporting backend)

> Executes the research in [scrypted-research.md](./scrypted-research.md) (backend gaps,
> timeline mechanics, face flow v2) on the design foundation of [ui-research.md](./ui-research.md)
> (zinc tokens, Lucide, icon rail, no gradients/glows/emoji). **Supersedes ui-plan.md v1**
> (preserved in git @ `4fd04e3`) — v1's foundation/polish phases carry over; its layout
> tasks are replaced by the Scrypted geometry (player + vertical timeline rail).
> Same protocol as v1 plans: commit per task (`task B2.1: …`), PROGRESS.md updated in
> the same commit, never ✅ without evidence, hardware/ffmpeg-dependent checks flagged ⚠️.

**Ordering:** Phase B (backend) first — the timeline UI is unbuilt-able without B1–B5.
U1/U2 (tokens, rail) can interleave. U4+ depend on their B counterparts.
**Dev-environment note:** ffmpeg/go2rtc are still not installed here — frame extraction
is specified with OpenCV (no external binary) so it stays verifiable; only clip-extraction
(B7.2) truly needs ffmpeg and is optional/deferred.

---

## Phase B1 — Recordings index (the foundation)

### Task B0: Consolidate to a single database
**Modify:** `src/events/database.py` → one canonical DB `data/aegis.db` holding ALL
tables (events, recordings, and anything later). One-time migration: if `events.db`
exists and `aegis.db` doesn't, copy tables over and rename the old file to
`events.db.migrated`. The existing single-connection + lock pattern already serializes
all writers (inference thread, recorder, API), so cross-table transactions are safe —
and the timeline API (B2.1) gets native SQL joins between events and recordings
(the reason one DB wins). Retention purges become atomic across tables.
**Verify:** migration test (old events.db → aegis.db with rows intact); all existing
DB tests repointed; `uv run pytest` green.

### Task B1.1: Recording index store
**Create:** `src/recording/index.py` (+ tests) — operates on the shared DB connection
via `state.event_db`. Table `recordings(camera_id, path, start_time, end_time,
duration, size_bytes)` + indexes on (camera_id, start_time).
`RecordingIndex` class:
`index_segment(camera, path, start, end)` · `scan_directory(cameras_dir)` backfill
(start from filename `YYYYMMDD_HHMMSS`, end = min(next segment start, file mtime)) ·
`segments_between(cam, start, end)` · `segment_covering(cam, ts)` ·
`days_with_recordings(cams)`. No ffmpeg needed anywhere.
**Verify:** unit tests on temp dirs with fake segment files (backfill correctness incl.
gap handling, boundary queries).

### Task B1.2: Wire recorder → index
**Modify:** `src/recording/recorder.py` (on rotation: index the finished segment —
recorder knows both boundaries), `main.py` lifespan (startup backfill sweep), `state.py`.
**Verify:** tests with mocked rotation; live run with `file`-camera recording via
`source_url` (no ffmpeg? recorder needs ffmpeg — use unit tests + ⚠️ user verify once
ffmpeg installed).

## Phase B2 — Timeline API

### Task B2.1: `GET /recordings/{cam}/timeline?date=YYYYMMDD`
**Create:** router method (in `recordings.py`). Response:
`{ hours: [{hour, segment_minutes, events, unknowns}], segments: [{start,end,file}] }`.
Hour buckets = **single SQL query joining events + recordings tables** in the shared
DB (native now that B0 consolidated them; no per-segment counters needed at our
scale — compute at query time).
**Verify:** unit tests (seeded index + events: bucket math, unknown vs known counts,
empty day); live curl.

### Task B2.2: `GET /recordings/summary` (calendar)
Days-with-recordings across all cameras (for the date picker's enabled days).
**Verify:** tests + curl.

## Phase B3 — Playback primitives

### Task B3.1: Event → playable segment
**Modify:** events router — event detail/response gains `playback: {url, start_offset}`
computed via `RecordingIndex.segment_covering(ts)` (frontend loads the MP4 at `#t=`;
Range seeking already works — verified 206).
**Verify:** tests linking seeded events to segments (correct file + offset math).

### Task B3.2: `GET /recordings/{cam}/frame.jpg?ts=` (hover previews)
**Create:** frame extractor using **OpenCV** (`cv2.VideoCapture` + `CAP_PROP_POS_MSEC`
seek — no ffmpeg binary), LRU cache dir under `data/thumbnails/frames/`.
**Verify:** test generates a synthetic mp4 (existing `make_test_video.py`), seeks to
mid-file, extracts a frame, asserts content differs from t=0 frame; endpoint serves JPEG.

## Phase B5 — Known-face events + person filters

### Task B5.1: Log known-face sightings
**Modify:** `inference.py` (on recognized face: `known_face` event with `person_name` +
`confidence`, own throttle key `known:{cam}:{person}`, 60s window); `events.py` router
(`person_name` filter param); `database.py` (query/count accept person_name).
**Verify:** unit tests (throttle per person, filter); ⚠️ live with a real face (user) —
check per-person sightings appear.

## Phase B6/B12 — Faces API v2 (three enrollment paths)

### Task B6.1: Request-response enrollment queue
**Create:** `src/api/enroll_jobs.py` — extends the pending-queue pattern: job =
`{name, frame, quality_gates, Event, result}`; inference loop drains, runs detection +
gates (face size ≥96px, blur Laplacian threshold, brightness), fills result;
`submit_job()` blocks ≤2s. ONNX stays single-threaded (project rule preserved).
**Verify:** tests with a fake recognizer; concurrency test (5 parallel submits).

### Task B6.2: Person store + management endpoints
**Create:** `persons(id, name, created_at, cover_image)` and
`person_images(person_id, path, source, quality, created_at)` tables in `aegis.db`
(one-time backfill from the existing directory structure). Architecture: **images on
disk stay the source of truth; embeddings stay derived in RAM (recomputed at boot);
the DB holds only metadata** — so no second truth to drift. `events.person_name`
backfilled to `person_id` → **rename becomes one row update** (directory rename +
live-embedding rekey), history survives. `source` ∈ {wizard, photo_import, enriched,
event} drives gallery + enrichment caps.
**Endpoints:** `PATCH /faces/{name}` (rename), `POST /faces/{name}/add` (JSON
`{event_id}` — enroll from an event's stored frame).
**Verify:** tests (backfill from dir; rename updates persons + dir + live embeddings
without touching event rows; add-from-event embeds and returns per-image verdict).

### Task B12.1: Photo import
**Add dep:** `pillow`. **Create:** `POST /faces/import` (multipart `name` + `files[]`):
EXIF-transpose (PIL), downscale ≤1280px, submit through B6.1 jobs, save **EXIF-stripped
face crop** (largest face; note when multiple), per-file verdicts
(`enrolled / no_face / low_quality / multiple_faces_used_largest`).
**Verify:** tests with synthetic face-free + face images (verdict mapping), EXIF-strip
assertion, multi-file batch; live via curl with real photos ⚠️ user.

### Task B7.1: Live snapshot endpoint
`GET /cameras/{cam}/snapshot.jpg` — encodes `state.latest_frames[cam]` on demand.
Unblocks snapshot-idle grid tiles. **Verify:** live curl returns JPEG.

### Task B7.2 (optional, needs ffmpeg): clip extraction
`GET /recordings/{cam}/clip.mp4?start&end&padding` via ffmpeg stream-copy. Graceful 503
when ffmpeg absent. **Defer until ffmpeg installed.**

---

## Phase U1 — Foundation (unchanged from v1)

**U1.1 Design tokens** — zinc system per ui-research §5; delete `--accent-glow`, old
token names. **U1.2 Lucide everywhere** — `lucide-react`; emoji grep gate = 0.
*Specs as in ui-plan.md v1 @ 4fd04e3.*

## Phase U2 — App shell (unchanged from v1, plus)

**U2.1 Icon rail + routing** — 56px rail: Live `/`, Events `/events`, Faces `/faces`;
logo top / user bottom. Pages move to `pages/`. **Recordings page is REMOVED** — its
function is absorbed by the camera-detail timeline (U4); storage info moves to a
future settings page. Page header: title + one status + user menu.

## Phase U3 — Live grid (hero)

**U3.1 Grid redesign** — black 16:9 tiles, 8px gaps, corner-only overlays (name + dot),
calm offline state. *As v1.*
**U3.2 Focused camera view → redirects to U4** (camera detail); no separate focus mode.
**U3.3 Story strip** — replaces v1's "recent events strip": horizontal cards, one per
recent notable window: title line ("3 unknown visits" / "Joynal seen"), camera list,
collage of 1–3 thumbnails, relative time (Scrypted nvr-summary pattern; mechanical
titles from events API — no AI). Click → Events page filtered.
**U3.4 Stream gating** — IntersectionObserver + visibilitychange pause. *As v1.*
**U3.5 (optional) Snapshot-idle tiles** — grid shows `snapshot.jpg` (B7.1) refreshing
~1/min; MJPEG only on hover/focus (Frigate's bandwidth win).

## Phase U4 — Camera detail: player + vertical timeline rail (the flagship)

```
┌ ‹ Live   Front Door        [camera ▾]   ⦿ Live | ▷ 08:53:50 PM   ⛶ ┐
│                                        ┌──┬───────────────────────┐ │
│                                        │09│  ══════┬──────────────│ │
│         <video>                        │15│   ──🚶─┤ [thumb]      │ │
│         (live MJPEG                    │09│       ├──────────────│ │
│          or recording                  │00│  ═════┤ [thumb]      │ │
│          at #t=offset)                 │45│       │              │ │
│                                        │PM│ (rail)│(pinned thumbs)│ │
│                                        └──┴───────────────────────┘ │
│  [date ◀ ▶  Sep 19 ▾]  ● rec  ▸ 7 fps                              │
└─────────────────────────────────────────────────────────────────────┘
```

**U4.1 Player shell** — split layout (player ~70% / rail ~30%, collapsible); hash
routing `/#cam=front_door&ts=...`; live↔playback toggle; camera switcher; date picker
(enabled days from B2.2); `f` fullscreen, `Esc` back.
**U4.2 Timeline rail component** — time-as-Y-axis (newest top): 15-min ticks +
monospace labels; **event blobs** on a ~16px rail (blue = activity; amber loitering;
red unknown) from B2.1 hours + events; **thumbnails pinned to timestamps** with thin
connector lines + object icons (`person`, `scan-face`); gaps = dead time; draggable
**playhead badge** (date + hh:mm:ss); hover → frame.jpg preview (B3.2) + enlarged thumb.
**U4.3 Scrub-to-playback** — click/drag rail or thumbnail → resolve segment
(B3.1) → `<video src=…#t=offset>`; auto-advance across segments while playing; click
event thumb = jump. Playhead follows video time; "Live" returns to MJPEG.
**Verify (phase):** build; with synthetic recorded day (generate segments from
`test_clip` via recorder `source_url` + seeded events) — blobs/hours correct, click
seeks, previews render. ⚠️ visual sign-off.

## Phase U5 — Events page v2

Day navigation (◀ ▶ + date picker) · Scrypted rows: metadata left (time, duration,
icons), 16:9 thumbnail right, hairline dividers, severity only as 2px left accent ·
filters: type chips w/ counts (All/Unknown/Known/Loitering), camera, **person** (B5.1) ·
row click → drawer: large thumb, metadata, **[▶ Play] (B3.1)** and
**[Name this person]** on unknown events (B6.2 enroll-from-event) · "Load more".
**Verify:** build + API params correct; ⚠️ visual.

## Phase U6 — Faces v2

**U6.1 Gallery** — person cards: cover (best sighting), name, last-seen, sighting count
(B5.1); primary action `user-plus` "Add person".
**U6.2 Add-person modal** — name + drag-drop multi-file (B12 import) with per-file
verdict chips + "or register with camera" link to the wizard.
**U6.3 Person detail** — sightings timeline (events by person), reference gallery,
"Add photos" dropzone, rename, delete.
**U6.4 Wizard restyle** — v1 U6.2 spec (gates + hints + 5-slot progress strip; logic
untouched; ⚠️ full 5-pose re-test).
**Verify:** build; import round-trip with real photos ⚠️; rename/delete flows.

## Phase U7 — Auth + polish (unchanged from v1)

**U7.1 Login cleanup** (shield art + blobs + gradient button out). **U7.2 Motion/
focus/a11y pass.** **U7.3 Guardrail sweep + lint debt** — grep gates (0 emoji, 0
gradients, 0 dead CSS incl. removed EventSidebar/RecordingsPage), fix the 6 pre-existing
ESLint errors, delete v1's orphaned components.

---

## Definition of done
- [ ] All B-phase unit tests green (`uv run pytest`); no ONNX calls outside inference thread
- [ ] Timeline renders a real recorded day; scrub-seek-preview loop works end-to-end
- [ ] Known-face sightings logged; person pages show real last-seen/counts
- [ ] Photo import round-trips (EXIF-stripped crops, per-file verdicts)
- [ ] Enroll-from-event creates a person that is subsequently recognized
- [ ] All v1 design guardrails (emoji=0, gradients=0, lint=0 errors, build clean)
- [ ] Registration wizard still passes a live 5-pose enrollment ⚠️
- [ ] CLAUDE.md / PROGRESS.md updated; user visual sign-off on ⚠️ items

## Sequencing summary
```
B1 → B2 → B3 ─────┐
B5 ────────────────┼→ U4 (timeline) → U5 (events)
B6.1 → B6.2, B12 ──┼→ U6 (faces)
B7.1 ──────────────┴→ U3.5 (snapshot tiles)
U1, U2 → U3.1/U3.3/U3.4 (independent of B)
U7 last
```
