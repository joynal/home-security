# Post-Review Fix Plan — Timeline v2 & Correctness

> **Project**: Aegis Vision AI
> **Source**: Full review of `0a761fe..HEAD` (2026-09-21) — code pass + live UI verification
> (backend on :8000, fresh Vite, CDP screenshots of every page, seeded test day).
> **Status**: Ready for execution. Task rows live in [PROGRESS.md](./PROGRESS.md) → **Phase R**.
> **Verdict that motivated this plan**: features are all there, but the UI doesn't *feel* like
> Scrypted because the signature element — the vertical timeline — is geometrically broken,
> timezones are mixed on one axis, and the rail violates our own zero-chrome guardrails.

Evidence artifacts from the review (reproducible):
- Screenshots: `/tmp/aegis-shots/*.png` (01-dashboard … 10-playback-debug)
- Key measurements: timeline `scrollHeight: 5483` vs `clientHeight: 728` at `HOUR_PX=58`;
  pin labeled 3:28 PM rendered next to the 10:00 AM tick; mobile `window.scrollBy(0,900)` is a no-op.

---

## 0. Guiding decisions (locked for this plan)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Timeline renders LOCAL time, end-to-end.** Storage stays UTC; the client converts. | Every non-UTC user currently sees rail ticks disagree with pin badges by their UTC offset (verified at UTC+2). Local is what DetectionsPage already shows, so the app becomes consistent. |
| D2 | **Coverage renders from `segments` (exact start/end), not hourly `segment_minutes` buckets.** | The timeline API already returns exact segments (`recordings.py:156`). Hourly buckets lose the contiguous-rail look that is Scrypted's signature. Backend change: **none**. |
| D3 | **Pins never move off their true timestamp.** Colliding events collapse into a cluster counter on the neighbor pin / rail blob. | The current 38px anti-collision stagger displaced pins by *hours* (verified) and pushed ~95% of rows below the scale into unreachable overflow. Position = time is the whole point. |
| D4 | **Zoom is a first-class control.** The 24h-overview shows blobs only; thumbnails appear when zoomed in. | At any single px/hour value you either can't fit the day or can't fit thumbnails. Scrypted solves this with zoom; so do we. |
| D5 | **Settings persistence = `data/settings.json`** (atomic write, gitignored). `.env` stays bootstrap-only; `SECRET_KEY` never leaves `.env`. | The current PATCH mutates module attrs that `inference.py` imported **by value** at startup — alert changes never reach the live loop and revert on restart. |
| D6 | Root `cameras.json` goes away; `data/cameras.json` is the only camera store again. | A git-tracked camera file with test sim + `save_cameras()` syncing root→data destroys real deployments and can commit RTSP credentials. |

Guardrails that stay in force: Lucide icons only (0 emoji), Emotion + `designTokens.ts` only,
**0 decorative gradients** (video-legibility scrims excepted), `npm run lint` / `tsc -b && vite build` /
`uv run pytest` / `ruff` green before any task flips to ✅.

---

## Phase RT — Timeline v2 (the "make it feel like Scrypted" phase)

> Frontend-only (backend APIs already sufficient). Executes as R2 → R3 → R4 → R5, in order.

### R2 — Local-time axis + segment-derived coverage (absorbs the `shiftDate` bug)

**Problem** (`TimelineRail.tsx:268-271`, `PlaybackPage.tsx:286-290, 490-495`):
`dayStartEpoch()` uses `Date.UTC` while badges use `toLocaleTimeString` → mixed timezones on one
axis. `dayRange()`/`shiftDate()` do UTC-midnight ↔ local-string math → the next-day arrow is a
silent no-op in negative UTC offsets (entire Americas).

**Changes**
1. `frontend/src/components/TimelineRail.tsx`
   - Replace `dayStartEpoch(date)` with local-midnight: `new Date(y, m-1, d).getTime()/1000`.
   - Delete the `hours.map` coverage block (`:418-431`); render coverage from a new
     `segments` prop: for each segment intersecting the local day, `y1 = tsToY(startMs)`,
     `y2 = tsToY(endMs)` → one absolutely-positioned bar per segment (contiguous runs merge
     visually by construction; gaps = dead time).
   - Hour tick labels from the local day (unchanged `fmtHour`, now fed local hours — automatic
     once `day0` is local midnight).
2. `frontend/src/pages/PlaybackPage.tsx`
   - `dayRange()`: local midnight → `.toISOString()` for the API (server compares UTC instants — correct).
   - `shiftDate()`: `new Date(y, m-1, d + delta)` (local) → `localDateStr(next)`.
   - Deep-link fix: if `?ts=` is present, derive `date` from the ts when no explicit `date` param
     (dashboard cards link `/playback?cam&ts` without a date — seeks into an empty day today).
3. `frontend/src/components/TimelineRail.tsx` props: add `segments: TimelineSegment[]`; drop
   `hours` (keep the API field — Detections summary still uses hour data).

**Tests/verification**: `npm run lint && npm run build`; CDP screenshot with the seeded day —
pin badges and the ticks they sit on must agree (badge 3:28 PM on the 3:00–3:30 PM band, CEST);
date-forward/backward arrows change the date once per click.

---

### R3 — Geometry: zoom levels, ticks, scroll-to-now

**Problem** (`TimelineRail.tsx:27`): `HOUR_PX = 58` → the whole day is 1,392px. No scrubbing
feel, no room for pins, everything crammed.

**Changes**
1. New constants + state (lift into `PlaybackPage`, passed down):
   - `pxPerHour` (default **400** ≈ 2h visible in the ~790px pane).
   - Zoom presets in the timeline header: `1h · 2h · 6h · 24h` → 800 / 400 / 132 / 33 px/h.
2. Tick system: major tick + monospace label every hour; minor tick every **15 min**
   (the research doc's spec — currently missing entirely). At 33px/h (overview) labels every 3h
   to avoid overlap.
3. Canvas height = `24 * pxPerHour + 2*TOP_PAD`; the pane scrolls (already does once content
   exceeds it).
4. **Scroll-to-now**: on mount, date change, and zoom change, set the scroll container's
   `scrollTop` so that "now" (or the newest segment end, whichever is earlier) sits ~30% from
   the top. Expose a small "Now" button in the timeline header doing the same.
5. Playhead math (`tsToY`/`yToTs`) becomes zoom-aware (single `pxPerHour` factor — no other change).

**Tests/verification**: build + CDP at each preset — 1h/2h show hour+15-min ticks with
thumbnails; 24h overview shows the full day in one screenful with blobs only; "Now" scrolls.

---

### R4 — True-position pins, clustering, de-chrome

**Problem**: anti-collision stagger (`TimelineRail.tsx:338-347`) displaced pins by hours and
pushed ~127/132 rows below the canvas (5,483px scrollHeight). Visual chrome (gradient+glow bars
`:97-99`, halo blobs `:129`, bordered icon chips `:142-162`, 64px thumbs) violates the
zero-gradient/zero-chrome guardrails.

**Changes** — replacement placement algorithm (pure function, extract to
`frontend/src/lib/timeline.ts` so it is unit-testable later):

```ts
// Newest-first pass; a pin either owns its exact y or joins the neighbor's cluster.
const MIN_GAP = THUMB_H + 8;           // THUMB_H ≈ 72px (128px-wide 16:9)
for (const ev of eventsSortedDesc) {
  const y = tsToY(ev.tsMs);
  const last = placed[placed.length - 1];
  if (last && Math.abs(last.y - y) < MIN_GAP) { last.cluster += 1; continue; }
  placed.push({ y, ev, cluster: 0 });
}
```

- Render `+N` badge on clustered pins; clicking a clustered pin seeks to the *cluster's newest*
  event (detail lives in Detections, not the rail).
- Thumbnails **128px** wide (16:9 ≈ 72px tall). Hover: `scale(1.15)` + z-index (exists today).
- Pin rule per D4: thumbnails render only when `pxPerHour >= 240`; below that, severity dots on
  the rail only.
- De-chrome sweep in `TimelineRail.tsx`:
  - coverage bar: flat `tokens.colors.accent.primary`, no gradient, no `boxShadow`.
  - event marker: 8px flat severity dot **on the rail**, no halo ring, no glow.
  - connector: 1px `tokens.colors.border.strong` (keep).
  - object icon: bare Lucide icon 12px in its severity color — delete the bordered chip wrapper.
  - labels: keep two-line (name + `tnum` time), 11px/10px.
- Rail density (optional in this task, cheap): brighten/heighten the coverage bar in 15-min
  windows that contain events (data already in `events`).

**Tests/verification**: build + CDP: with the seeded 132-event day, no pin sits >1 tick from
its badge time; `scrollHeight` ≤ canvas height + one screen (no runaway stack); grep
`linear-gradient` in TimelineRail → 0 matches; screenshots before/after compared.

---

### R5 — Drag-to-scrub with frame preview

**Problem**: `handlePointerMove` calls `onSeek` on every move (`TimelineRail.tsx:359-365`) →
video element re-keyed and re-buffered continuously; scrubbing is janky and gives no visual
feedback until a segment loads.

**Changes**
1. Split drag from seek: during drag, update only the playhead badge time (local state).
2. On drag (debounced ~120ms, cancel stale), fetch
   `GET /recordings/{cam}/frame.jpg?ts=` (exists — Task B3.2) and show it as a translucent
   preview overlay in the player area (`PlaybackPage`), with the badge time.
3. `onSeek` fires on `pointerup` only.
4. Keyboard `ArrowUp/Down` (exists) keeps working; add `Shift` = ±1h jumps at high zoom.

**Tests/verification**: build + manual/CDP: dragging across a coverage gap shows black preview +
moving badge without any video reload; release loads the right segment at the right offset
(cross-check `?ts=` deep-link lands on the same frame).

---

## Phase RC — Correctness fixes (independent of RT; any order)

### R6 — Mobile playback scroll (P0)

**Problem** (`PlaybackPage.tsx:146-152`): mobile `shellStyles` = `height: auto` +
`overflowY: auto` inside `.app-shell__main` (`display:flex; column; overflow:hidden`) — a flex
child without `min-height: 0` cannot shrink below content, so the 5k-px timeline is clipped and
**unscrollable** (verified: `scrollBy` no-op; header never moves).

**Changes**: mobile branch of `shellStyles`: add `flex: 1`, `minHeight: 0`, keep
`overflowY: auto`; the player pane keeps `position: sticky; top: 0` — sticky now works because
the shell is the real scroll container. Verify the bottom nav safe-area still clears.

**Tests/verification**: CDP at 390×844: scroll moves the header off-screen while the player
stays docked (re-shoot `07/08-playback-mobile`).

### R7 — Legacy redirect + dead camera selector

**Problem**: `App.tsx:33` `<Navigate to="/playback/:cameraId">` navigates to the *literal*
string `:cameraId`. And `PlaybackPage.tsx:304` `pathCamId || camParam` means the select only
mutating `?cam=` never changes cameras on `/playback/:id` URLs (the path Grid links to).

**Changes**
1. `App.tsx`: replace the `Navigate` with a 5-line wrapper:
   `const Redirect = () => { const { cameraId } = useParams(); return <Navigate to={`/playback/${cameraId}`} replace />; }`.
2. `PlaybackPage.tsx` `handleCameraChange`: `navigate('/playback', { state: … })` — simplest
   correct fix is to leave the path-param route but, on user camera change, `setSearchParams`
   **and** drop the path segment via `navigate(\`/playback?cam=…&date=…\`, { replace: true })`
   so `pathCamId` no longer shadows the selection.

**Tests/verification**: navigate `/camera/test_camera` → lands on working playback; change
camera in the select from a `/playback/:id` URL → feed and timeline switch.

### R8 — Alert settings: live rebuild + persistence (D5)

**Problem** (`settings.py:246-257`, `inference.py:29-33,64-72`): PATCH mutates
`src.config` attrs, but `inference.py` imported `ACTIVE_ALERT`/`TELEGRAM_*` **by value** at
module load; the alert manager is built once and never rebuilt. UI toasts success while real
alerts keep the old channel until restart; nothing persists → reverts after restart.

**Changes**
1. `src/api/state.py`: add `alert_manager` (+ `alert_lock`).
2. `src/api/inference.py`: `build_alert()` reads `import src.config as config` attrs (live);
   the loop reads alerts via `state.alert_manager`; export `rebuild_alert()` (build + swap
   under lock).
3. New `src/settings_store.py`: `load()/save()` of `data/settings.json`
   (`active_alert`, `telegram_bot_token`, `telegram_chat_id`, `ntfy_topic`,
   `ai{similarity_threshold, loitering_seconds, auto_enrichment}`) with the same
   atomic tmp+`os.replace` pattern as `save_cameras`.
4. `src/config.py`: after env load, overlay `data/settings.json` (file wins over env for these
   five keys; `SECRET_KEY` never read from here).
5. `settings.py` PATCH: mutate config attrs (as today) **+** `save()` the store **+**
   `rebuild_alert()`.
6. `GET /settings/config` returns the effective (file-overlaid) values, secrets masked (today).

**Tests** (`tests/test_settings_api.py`): overlay precedence (env vs file), PATCH →
`state.alert_manager` swapped to the new provider class, file round-trip, SECRET_KEY absent.

**Live verification**: PATCH to console → trigger unknown-face event → console (not telegram);
restart backend → provider still console.

### R9 — Camera CRUD goes live + fresh system counts

**Problem** (`settings.py:283-332`): `add_camera` never starts a stream (new camera "offline"
until restart); `delete_camera` never stops the running stream — the inference loop keeps
analyzing/recording/alerting for a deleted camera and re-populates the status entry the router
popped. `get_system_health` (`settings.py:38,143`) counts cameras from a stale import-time
`CAMERAS`.

**Changes**
1. `src/api/inference.py`: extract `start_camera_stream(cfg)` /
   `stop_camera_stream(cam_id)` (stream wrapper + `state.active_streams` + status entry; stop
   also stops the camera's recorder if `state.recording_manager` has one). Startup uses them.
2. Pipelines: the loop currently fills a local `pipelines` dict at startup (`:273`) while
   `state.pipelines` sits unused — unify on `state.pipelines` with lazy creation
   (`if cam_id not in state.pipelines: build`) so cameras added at runtime get one on their
   next frame.
3. Routers: `add_camera` → `start_camera_stream(cam)`; `delete_camera` →
   `stop_camera_stream(id)` before cleanup; `update_camera` → stop+start when
   `rtsp_url`/`camera_index`/`type` changed.
4. `settings.py`: `import src.config as config` everywhere (kill the by-value `CAMERAS` import
   at `:38`); `cameras_total` counts only `enabled` cameras.

**Tests**: add/update/delete with fake wrappers — stream started, stream stopped + recorder
stopped, status keys gone, `/settings/system` counts match `config.CAMERAS`.

**Live verification**: add a `file` camera pointing at `data/test_clip.mp4` via the UI → tile
comes online without restart; delete it → frames/status/events stop.

### R10 — Register wizard auto-capture stall

**Problem** (`RegisterModal.tsx:758-776`): effect deps `[isCorrectPose, phase, doCapture]` —
a failed capture (422 `too_small`/`blurry` from the S4.2 gates) doesn't flip `isCorrectPose`,
so no new countdown interval is ever created; the wizard silently freezes until the user
steps out of frame.

**Change**: add `const [captureSeq, setCaptureSeq] = useState(0)`; bump it in `doCapture`'s
`finally`; add to the effect deps. (Also drop the pointless `setTimeout(() => setCountdown(null), 0)`.)

**Tests/verification**: manual wizard run with a deliberately small face → error shows, then
auto-capture retries once the pose is re-held (no re-mount needed).

### R11 — P2 grab-bag (small, independent)

| Item | File:line | Fix |
|------|-----------|-----|
| Fabricated "15 FPS" | `CameraCard.tsx:263` | render fps only when truthy; else no badge (never fake data) |
| `.hide-mobile` undefined | `CameraGridPage.tsx:202+`, `index.css` | add the media-query rule to `index.css` (or remove the class) |
| 3×3 layout unreachable | `CameraGridPage.tsx` | add the button (mode already implemented) |
| Focus-tile click navigates instead of swapping | `CameraGridPage.tsx:281-297` | side tiles: `onSelect → setFocusIndex(idx)`; remove wrapper `onClick`; keep a separate expand affordance for navigation |
| Touch devices never go live | `CameraCard.tsx` | treat first `touchstart` as hover-start (30s timeout) — grid page already covers the wall use-case |
| Keyboard effect re-binds every render | `PlaybackPage.tsx:538` | give the effect a dep array; handlers via refs |
| `relTime`/`exactTime` duplicated ×3 | RecentEvents/DetectionsPage/CameraCard | extract `frontend/src/lib/time.ts` |
| `jumpSeconds` doesn't cross segments | `PlaybackPage.tsx:432` | clamp then, if out of segment, `onSeek(startEpoch + currentTime + delta)` |

**Verification**: build + lint + targeted screenshots (grid toolbar at 390px, focus swap).

### R12 — Auto-enrichment throttle

**Problem** (`inference.py:411-437`): for every detection dict with `similarity ≥ 0.62`, every
frame, the loop runs `person_store.get_person()` + `images_for()` (locked SQLite) before any
cap check — ~60 queries/sec with someone standing in view, on the real-time thread.

**Change**: `state.last_enrich_attempt: dict[(cam_id, track_id), float]`; check 60s TTL **before**
any DB call; also reuse the existing `known:{cam}:{name}` event throttle bucket. Record the
attempt (success *or* fail) so a failing gate doesn't retry every frame either.

**Tests**: fake person store counting calls — one person, 100 frames → ≤ 1 call per 60s.

### R13 — Config safety: restore `data/cameras.json` as the only store (D6) — **do first**

**Problem** (`config.py:23,95-98`, root `cameras.json` committed in 949e688): root file wins over
`data/cameras.json`; `save_cameras()` then **overwrites** `data/cameras.json` with the test-sim
config; Settings CRUD writes RTSP credentials into a git-tracked file.

**Changes**
1. `config.py`: `CAMERAS_FILE = DATA_CAMERAS_FILE`; delete the root→data sync block in
   `save_cameras()`.
2. Migration guard during the change: diff root vs `data/cameras.json` (both exist now) — copy
   root → data if data is stale, so the running dev setup keeps its cameras.
3. Repo: `git rm cameras.json`, add `cameras.json` to `.gitignore` (data/ pattern alone no
   longer covers it), regenerate `cameras.json.example` including the `"file"` test type.
4. `tests/`: load-precedence test (data wins even if a stray root file exists).

**Verification**: `uv run pytest`; boot picks `data/cameras.json` (log line); `git status`
clean of camera credentials; Settings save writes only `data/cameras.json`.

---

## Phase RO — Optional / deferred (pick up after RT+RC land)

| Task | Description |
|------|-------------|
| R14 | **Landing page choice** — three variants: (a) keep Dashboard as-is, (b) reorder: camera wall above events strip (recommended, smallest change), (c) redirect `/` → `/grid`. Taste call → decide with a screenshot side-by-side. |
| R15 | Unify `CameraCard`/`CameraTile` (~90% duplicated hover-live/snapshot logic) — `CameraCard` becomes `CameraTile` + optional HUD/actions props. |
| R16 | B7.2 clip extraction is now **unblocked** (ffmpeg installed — `PROGRESS.md` env table is stale). Wire `GET /recordings/{cam}/clip.mp4` end-to-end + Export Clip toast. |
| R17 | CPU profiling of the inference loop (61.5% / ~5.5 cores on one 640×360 test clip — check whether `detect.fps=5` is honored by the file camera path and where the burn is) before any Pi-class deployment. |
| R18 | Doc sweep: `CLAUDE.md` test count (136 now), `PROGRESS.md` env table (ffmpeg present), record the CDP screenshot harness below as the UI verification tool. |
| R19 | Commit the CDP harness as `scripts/ui_screenshot.mjs` (+ `scripts/README` note: `node scripts/ui_screenshot.mjs --base http://localhost:5174`) so every Phase RT task has reproducible visual evidence. **Recommended early** — it's the verification instrument for R2–R6. |

---

## Execution order & sizing

```
R13 (S) ──► R19 (S) ──► R2 (M) ──► R3 (M) ──► R4 (L) ──► R5 (M)     ← Timeline v2 spine
                          │
                          └─► R6 (S) · R7 (S) · R10 (S) · R11 (M)   ← anytime, independent
R8 (M) · R9 (M) · R12 (S)                                              ← backend, independent
R14–R18                                                                 ← after RT+RC
```

S < 1h · M 1–3h · L 3h+ (agent-session sizing).

**Per-task gates** (all tasks): `uv run ruff check .` + `uv run pytest` (backend tasks add new
tests first), `cd frontend && npm run lint && npm run build` (frontend tasks), plus the task's
own verification row. UI tasks attach before/after screenshots from the R19 harness as evidence
in `PROGRESS.md` — same protocol as every prior phase: status flip + evidence in the same
commit, commit message `task R4: …`.

## Out of scope (explicitly)

HLS/VOD playlists (Range seeking is fine at this scale) · WebRTC playback · vitest component
infra (extracting pure helpers to `lib/` keeps that door open without adding deps now) · any
redesign of Detections/Settings/AppRail — review found them on-target.
