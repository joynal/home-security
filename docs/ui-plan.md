# Aegis Vision — UI Redesign Implementation Plan ⚠️ SUPERSEDED by v2

> **Superseded** by [implementation-plan-v2.md](./implementation-plan-v2.md) (Scrypted-style
> layout + supporting backend). v1's foundation/polish phases (U1, U2, U7) carried into v2;
> layout tasks were replaced. Kept for reference (also in git @ `4fd04e3`).

> Task-by-task plan for the redesign defined in [ui-research.md](./ui-research.md).
> Same protocol as [implementation-plan.md](./implementation-plan.md): commit per task
> (`task U1.1: …`), tracker updated in the same commit, never ✅ without evidence.
> **Frontend-only — no API or behavior changes.** Not started until approved.

**Guardrails for every task:** `npm run build` passes · no new ESLint errors ·
`grep -rn "linear-gradient\|radial-gradient" frontend/src --include="*.css"` → 0 matches
(by end of U6) · emoji-icon grep → 0 matches · all existing API calls unchanged.

---

## Phase U1 — Foundation

### Task U1.1: Design tokens
**Files:** `frontend/src/index.css` (rewrite `:root` + reset), delete per-component token drift.

Replace the current tokens with the zinc system from ui-research.md §5 (bg `#09090B`,
surface steps `#101014/#18181B/#27272A`, border `rgba(255,255,255,0.08)`, text
`#FAFAFA/#A1A1AA/#71717A`, accent `#3B82F6`, live/alert/warn semantics, `--radius: 10px`
+ derived scale, 4px spacing vars, 120/200ms motion vars). Add
`font-feature-settings: "tnum"` for `.tnum` utility. Delete `--accent-glow`.
**Verify:** build passes; old token names (`--text1`, `--surface2`, `--accent-glow`) gone.

### Task U1.2: Lucide icon system
**Files:** `package.json` (`lucide-react`), all JSX files (replace 14 emoji spots).

Mapping (verified names): rail/logo `cctv` + `shield-check` · events `bell` · faces
`scan-face` · recordings `video` · live dot context `radio` · offline `video-off` ·
alerts `triangle-alert` · logout `log-out` · register person `user-plus` · settings
`settings`. 16px in chrome, 20px in content, stroke 1.75.
**Verify:** `grep -rn "🛡\|💻\|📷\|🎥\|🎬\|📋\|📹\|👥\|🚨\|🚶\|🌀\|👤\|●\|＋" frontend/src --include="*.jsx"` → 0.

---

## Phase U2 — App shell

### Task U2.1: Icon rail + page routing
**Create:** `frontend/src/components/AppRail.jsx` + `.css`, `frontend/src/pages/` dir.
**Modify:** `App.jsx` (becomes router shell only), `index.css` (delete sidebar CSS).

```
┌────┐ ┌──────────────────────────────────────────┐
│ ⌂  │ │ Live                    2/2 · ⦿  user ▾ │  ← slim page header
│▤ ▤ │ │                                          │
│☺   │ │            (page content)                │
│▷   │ │                                          │
│    │ │                                          │
│⎋   │ │                                          │
└────┘ └──────────────────────────────────────────┘
 56px                          fullbleed content
```

- Rail: logo mark (`cctv` icon) top; nav icons with tooltips + `aria-label`:
  Live `/`, Events `/events`, Faces `/faces`, Recordings `/recordings`; spacer; user
  menu (logout) bottom. Active item = accent icon + 2px left indicator — no pill.
- Routes: move Dashboard → `pages/LivePage.jsx`, ManageFacesPage → `pages/FacesPage.jsx`
  (rename exports/imports), RecordingsPage → `pages/RecordingsPage.jsx`, add stub
  `pages/EventsPage.jsx` (filled in U4).
- Page header per page: title (16–18px semibold) + one status element + user dropdown.
  No badges, no pills.
- **Delete:** 270px sidebar, sidebar camera list, "CAMERAS" label, armed pill.
**Verify:** build; all four routes render; keyboard: rail is tab-navigable with visible
focus; no sidebar CSS remains (`grep -n "sidebar__" frontend/src/index.css` → 0).

---

## Phase U3 — Live page (the hero)

### Task U3.1: Camera grid redesign
**Modify:** `pages/LivePage.jsx`, `components/CameraGrid.jsx/.css`, `components/CameraTile.jsx/.css`.

```
┌ Live ────────────────────────── 2/2 online · [High ▾] ┐
│ (recent activity strip — U3.3)                        │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ │
│ │Front Door  ⦿live                              │ │ │
│ │                 (video, black)                │ │ │
│ └───────────────┘ └───────────────┘ └───────────────┘ │
└───────────────────────────────────────────────────────┘
```

- Grid: CSS grid, `repeat(auto-fill, minmax(340px, 1fr))`, `gap: 8px`, tiles
  `aspect-ratio: 16/9`, `background: #000`, `border-radius: 10px`, **no borders, no
  card chrome, no shadows**.
- Tile overlays (top corners only): name (13px, 500) bottom-left of a subtle scrim;
  status = 8px dot + word ("Live"/"Offline") top-right. Nothing else — FPS and type
  move to the focused view.
- Offline tile: `video-off` icon (muted, centered) + name + "Offline" + last-frame
  time. Calm zinc, never red (red = alerts only).
- Click tile → focused view (U3.2). Header shows `N/M online` as dot + text.
**Verify:** build; grid renders 1→N cameras; offline state styled; visual check ⚠️ user.

### Task U3.2: Focused camera view
**Create:** `components/CameraFocus.jsx`.
**Modify:** `LivePage.jsx` (tile click sets `location.hash = cameraId`; render focus when
hash present; hashchange/`Esc`/back returns to grid — URL-state pattern from Frigate).

```
┌ ‹ All cameras   Front Door        [MacBook ▾]  ⦿ Live · 7 fps   ⛶ ┐
│                          single stream, ~85vh, black                │
└─────────────────────────────────────────────────────────────────────┘
```

One full-rate stream; camera switcher dropdown (keyboard-navigable); fps + type shown
HERE (context-appropriate metadata); fullscreen button (Fullscreen API).
**Verify:** build; hash deep-link `/#front_door` opens focused; Esc returns; switcher
changes stream; ⚠️ visual user.

### Task U3.3: Recent activity strip
**Create:** `components/RecentEvents.jsx/.css`.
**Uses:** existing `GET /events?limit=8` + `/events/{id}/thumbnail` — no backend change.

Horizontal scroll row of recent-event thumbnails above the grid: 16:9 crop ~160px wide,
severity = 2px bottom border color only (alert red / warn amber / neutral), caption
"12m ago · Front Door" (12px, muted). Empty state: one line, muted — "No recent
activity". Hidden entirely when zero events and zero cameras online? No — keep visible
with empty text (quiet states are designed states).
**Verify:** build; renders with seeded events; severity colors correct; ⚠️ visual user.

### Task U3.4: Stream gating (perf)
**Create:** `hooks/useVisible.jsx` (IntersectionObserver + `document.visibilitychange`).
**Modify:** `CameraTile.jsx` — when tile not visible OR tab hidden: drop the `<img src>`
(store last URL, restore on visible). Prevents N background MJPEG streams from eating
bandwidth when scrolled away or tabbed out.
**Verify:** with devtools network tab, scrolling a tile out of view stops its stream
requests; tab blur stops all. ⚠️ visual user.

> Optional follow-up (needs a small backend endpoint, NOT in this plan): a
> `/snapshot/{cam}.jpg` still-image endpoint to enable snapshot-idle grid tiles
> (Frigate's biggest bandwidth win) and a global Low/High quality toggle (SS9 pattern).

---

## Phase U4 — Events page

### Task U4.1: Events browser
**Create:** `pages/EventsPage.jsx/.css` (replaces the dashboard's EventSidebar —
component deleted at end of task).

```
┌ Events ── [All 12] [Unknown 3] [Known 8] [Loitering 1]   [Camera ▾] [Date] ┐
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                              │
│ │[thumb] │ │[thumb] │ │[thumb] │ │[thumb] │   thumbnail grid, 16:9,      │
│ │12m · FD│ │1h · BY │ │3h · FD │ │5h · KP│   severity = 2px bottom border│
│ └────────┘ └────────┘ └────────┘ └────────┘                              │
└──────────────────────────────────────────────────────────────────────────┘
```

- Filter chips with counts (`/events/summary` + type filter); camera dropdown, date
  picker (existing query params). Chrome monochrome — thumbnails are the only color.
- Card anatomy (Frigate/Scrypted): thumbnail; bottom scrim with relative · absolute
  time ("12m ago · Sep 19, 2:31 PM", tnum); camera name 12px muted.
- Click → side drawer (keeps grid context): large thumbnail, all metadata (type,
  camera, track id, confidence), link "View camera live".
- Pagination (API `limit/offset` already supports it) — "Load more" button.
**Verify:** build; filters hit correct API params; drawer opens/closes; pagination;
⚠️ visual user.

---

## Phase U5 — Faces & Recordings

### Task U5.1: Faces page restyle
**Modify:** `pages/FacesPage.jsx/.css` (logic unchanged).
Gallery grid of person cards (thumbnail, name, count, delete on hover with confirm);
`user-plus` primary button (the only filled-accent button per view); empty state with
`scan-face` icon + "No registered faces" + action.
**Verify:** build; register/delete flows still work (API unchanged); ⚠️ visual user.

### Task U5.2: Recordings restyle
**Modify:** `pages/RecordingsPage.jsx/.css`.
Keep split layout (player left / segments right — already the Google-Home-endorsed
pattern); restyle: hairline segment rows with duration + size (tnum), active = accent
left indicator, storage chip in header (dot + "1.2 GB"), date/camera controls
restyled to token inputs.
**Verify:** build; playback still works; ⚠️ visual user.

---

## Phase U6 — Auth surfaces

### Task U6.1: Login page
**Modify:** `LoginPage.jsx/.css`.
Delete: SVG shield art, radial gradient blobs, gradient button. New: centered card on
zinc canvas, `shield-check` icon + "Aegis Vision" wordmark (plain text-1, no gradient),
email/password inputs (token style), one accent button, error state inline (alert
color text + icon, no toast).
**Verify:** build; login/logout round-trip works; ⚠️ visual user.

### Task U6.2: Register modal restyle
**Modify:** `RegisterModal.jsx/.css` (flow + polling logic UNTOUCHED).
Restyle to tokens: progress = 5 plain steps (done = accent check, current = filled,
future = muted — no gradient bar); replace scan-line oval animation with a static
outline + subtle pulse ONLY on the active pose target; lucide icons; keep the pose
debug text.
**Verify:** build; **full 5-pose registration still works with a real face** ⚠️ user
(this exercises the carve-out — highest-risk regression).

---

## Phase U7 — Polish & guardrails

### Task U7.1: Motion, focus, accessibility
Global pass: `:focus-visible` = 2px accent ring everywhere; rail/buttons aria-labels;
transition tokens (120ms controls / 200ms panels, ease-out; nothing looping); honor
`prefers-reduced-motion`; contrast spot-check (text-2 on bg ≥ 4.5:1 — zinc-400 on
zinc-950 passes).
**Verify:** keyboard-only walk of all pages (tab/enter/esc); axe-devtools pass or
manual contrast check.

### Task U7.2: Guardrail sweep + lint debt
- Grep gates (all must be 0): `linear-gradient|radial-gradient` in css ·
  `box-shadow` outside overlay/modal rules · emoji list in jsx · dead CSS
  (`camera-card|stats-strip|sidebar__|topbar__badge`).
- Fix the 6 pre-existing ESLint errors (RegisterModal `useCallback` deps +
  setState-in-effect, AuthContext export split, main.jsx react-refresh) — flagged since
  Phase 1 of the evolution plan.
- Delete `EventSidebar` remnants and unused CSS files.
**Verify:** `npm run lint` → 0 errors · `npm run build` clean · `uv run pytest tests/`
still 60 (sanity that nothing backend broke).

---

## Definition of done

- [ ] All grep gates pass (no emoji icons, no gradients, no glow shadows, no dead CSS)
- [ ] `npm run lint` 0 errors · `npm run build` clean
- [ ] Four pages + focused camera view render and navigate (rail + hash + back button)
- [ ] Registration wizard completes end-to-end with a real face ⚠️
- [ ] Events browsing + filters + drawer works; thumbnails render
- [ ] Recordings playback works; Faces register/delete works
- [ ] Stream gating pauses off-screen/hidden-tab streams (network tab)
- [ ] Keyboard-only walkthrough of every page succeeds
- [ ] CLAUDE.md frontend section + PROGRESS.md updated to reflect the new UI
- [ ] User visual sign-off on all ⚠️ items

## Explicitly out of scope (future)
Snapshot-idle grid tiles + Low/High quality toggle (needs `/snapshot/{cam}.jpg`
backend endpoint) · WebRTC playback · light theme (tokens make it cheap later) ·
timeline scrubber on the player (needs recordings↔events linking in the backend) ·
drag-and-drop grid layout persistence.
