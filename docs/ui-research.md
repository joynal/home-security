# Aegis Vision — UI Redesign Research

> Research foundation for modernizing the dashboard: what the best surveillance UIs
> (open-source and commercial) actually do, what design language reads as "simple and
> clean" in 2026, and a concrete critique of our current UI. Companion implementation
> plan: [ui-plan.md](./ui-plan.md). **No implementation yet — this document is the proposal.**

Research date: 2026-09-19. Method: three parallel research tracks (open-source NVR
frontends read at source level; commercial camera apps from release notes/reviews/docs;
design language from shadcn/Geist/Linear/Refactoring UI + Dribbble/Behance genre scan)
plus pixel-level visual analysis of two benchmark screenshots (Synology SS9 Monitor
Center, Netguru PSIM redesign).

---

## 1. Current-State Critique — why it reads as "generated AI bloat"

Audited: `frontend/src` (App.jsx, index.css, LoginPage, ManageFacesPage, RecordingsPage,
RegisterModal, components/).

| # | Problem | Evidence |
|---|---------|----------|
| 1 | **Emoji as icons** | 14 occurrences (🛡 💻 📷 🎥 📋 📹 👥 …) across sidebar, tiles, buttons, events. The single strongest "generated UI" tell — no designed product ships emoji chrome. |
| 2 | **The blue→purple gradient** | 10+ instances: logo text, buttons, login card, modal headers (`linear-gradient(135deg, #63b3ff, #9f7aea)` and variants). This exact gradient is the AI-tool default aesthetic. |
| 3 | **Glow & pulse decoration** | `--accent-glow` token, pulsing "System Armed" pill, box-shadow rings, animated scan-line in the register modal. Decoration that carries no information. |
| 4 | **Redundant navigation** | Cameras listed in a fixed 270px sidebar *and* shown in the main grid — two ways to do one thing. With a single camera the sidebar dominates and the feed looks like an afterthought (the user's actual complaint). |
| 5 | **Over-labeled chrome** | "CAMERAS" micro-label, type badges, FPS chips, armed pill, AI-model badges (some already removed by the user) — chrome competing with content. |
| 6 | **Meaningless art** | Hand-drawn SVG shield + radial gradient blobs on the login page. |
| 7 | **No design system** | 1,648 lines of one-off CSS, 6 font weights, 14px chunky radii, letter-spaced uppercase micro-labels, per-feature styling. |
| 8 | **Heavy tile chrome** | Tiles framed in bordered cards with status-badges, info strips, offline messages — the video is a small part of its own tile. |

Root cause: the layout treats **navigation and status as the product**. Every reference
below does the opposite.

---

## 2. What the best open-source NVRs do

*(Source-level reading of each project's frontend.)*

### Frigate — the modern benchmark (React 19 + Tailwind + shadcn/ui)
- **52px icon-only left rail.** Entire navigation is 4–6 icons: Live, Review, Explore, Export. **Home = the live camera grid.** No dashboard page, no sidebar camera list — the grid *is* the list.
- **Tiles are just video**: black rounded rectangles (`bg-black`, `rounded-lg→2xl`), aspect-ratio-driven grid, 8–16px gaps, **no card borders or title bars**. Overlays: camera name + status, top corners only. Everything else lives in a right-click context menu.
- **Snapshot-idle → live-on-demand**: idle tiles refresh a low-rate snapshot and only stream on hover/click; IntersectionObserver + tab-visibility pause off-screen streams. The single biggest perf lever for MJPEG walls.
- **"What just happened" filmstrip** above the grid: horizontal row of recent alert thumbnails — the highest-value element of a security dashboard.
- **Tokens**: near-grayscale dark theme (bg 0%, card 15%, border 32% lightness), ONE blue accent `hsl(228 89% 63%)`, saturated colors reserved exclusively for event severity (alert=red, detection=orange, motion=yellow). Inter font.

### Scrypted — triage-first events
- Vertical timeline rail with **event thumbnails tethered by thin connectors** + object-class icons; rows are metadata-left (time, duration) / thumbnail-right. Chrome deliberately monochrome so **thumbnails are the only color**.

### Viseron — state handling done right
- Camera card states: loading spinner → snapshot; disconnected = centered muted `VideoOff` icon on neutral background — **calm, not alarming**. Polling pauses off-screen/hidden-tab.
- Events page: two tabs over one dataset (list + timeline).
- Weakness: MUI default look; navy-not-black theme reads "template".

### Shinobi / ZoneMinder / AgentDVR — the counter-examples
- ZoneMinder's dashboard is literally a **table of monitors** (video as a row with "events this week" columns). Shinobi mixes three component systems with per-theme hardcoded hexes. AgentDVR shows map + thumbnails + viewer + timeline all at once. Lessons: video must be the hero; one component system; don't show every control simultaneously; dark mode must be tokens, not a bolted-on stylesheet.

### Moonfire NVR — minimalism reference
- 4 screens total, named live layouts, tiles carry only a name chip and a drop-shadowed timestamp. "Minimal by austerity" — the screen-count philosophy is the takeaway.

## 3. What commercial apps do

- **UniFi Protect** (the prosumer benchmark): the camera grid IS the app — all cameras live, one click to a camera's timeline. Video ≥90% of pixels, one blue accent, near-black canvas, zero promotional noise. 2026 releases doubled down on *cleaner* timelines (consolidated events) and customizable grid layouts.
- **Google Home web**: opens straight into a grid of live tiles; each tile shows **only name + status** ("Offline", "Idle"). Click → expanded player with camera switcher; history = split view, player left / event list right, dotted 24h timeline.
- **Apple Home**: static snapshot tiles (no autoplay-all), full-screen player with a swipeable bottom timeline. Maximum restraint: color only for state.
- **Synology SS9** (visual analysis): near-black `#1B1D20` canvas, one blue-cyan accent for selection/LIVE, **red exclusively for alerts**, amber exclusively for recorded data; letterboxed tiles with "LIVE" text badge; 3-step type scale (11/12/26px); icon-only ghost buttons. Its clutter: three stacked toolbar rows of ~20 unlabeled icons — the line where "professional" tips into "dense".
- **Ring / Wyze** (cautionary): commerce and social-feed patterns inside the security UI ("Discover" banners, "Stories", upsells) — the canonical trust-killers. Their engineering-driven "unified" redesigns were received as "a mess". Also: raw per-detection alerts bury users — coalescing is mandatory.

## 4. Design language for "simple and clean" (2026)

- **shadcn/ui** (the de-facto standard): semantic tokens (`background/card/muted/border/ring`), 2026 default base = **Neutral (zero-chroma)**, dark bg ≈ `#0a0a0a`, **border = white @ 10%**, single `--radius: 10px` with a derived scale, elevation = surface lightness steps, never shadows.
- **Zinc over slate** for neutrals — zero blue cast (slate's blue tint fights video content; Linear explicitly removed blue from neutrals).
- **Vercel Geist**: color ramps with *fixed role mapping* (steps 100–300 backgrounds, 400–600 borders, 900–1000 text) — "roles, not vibes".
- **Refactoring UI**: define 8–10 grey shades up front; no true black backgrounds; ≤2 primary colors; accents are semantic and sparse. "If two things are colored, one is wrong."
- **Lucide** icons (MIT, 24px grid, 2px stroke) — the standard replacement for emoji. Verified names for this project: `cctv`, `camera`, `video`, `film`, `shield-check`, `scan-face`, `users`, `triangle-alert`, `bell`, `clock`, `history`, `radio`, `settings`, `log-out`.
- **Dribbble/Behance genre scan**: the top-rated CCTV/security dashboard concepts (Netguru PSIM, Conceptzilla) are precisely the restrained ones — video grid as hero (70–90% of canvas), overlays-not-frames, one accent, timeline under the player. Visual analysis of Netguru's PSIM (the genre leader): 90% neutral / 10% accent, hairlines instead of shadows, **blue = interaction only; green/amber/red = state only**, hierarchy from size+weight, not color.

---

## 5. Synthesis — the convergent direction

Every independent source lands on the same seven decisions:

1. **Navigation: 52–64px icon rail** (Live · Events · Faces · Recordings; logo top, user bottom). Kill the 270px sidebar and the sidebar camera list. *(Frigate, PSIM, SS9)*
2. **Home = the live grid, edge to edge.** The grid is the camera list. Uniform 16:9 tiles, black, rounded, 8px gaps, tight overlays (name + one status dot). *(UniFi, Google, Frigate)*
3. **Color budget: zinc neutrals + ONE blue accent + semantics** (`live` green, `alert` red, `warn` amber) used only when the state is true. Red is never decoration. Gradients: zero. Glows: zero. *(all sources)*
4. **Lucide icons at consistent sizes** — every emoji replaced. *(shadcn-class products)*
5. **Status = 6–8px dot + short word**, color never alone; at most one pulsing element on screen (the single active alert). *(NN/g, Pencil & Paper, all apps)*
6. **Events as thumbnails, not text rows**: face-crop thumbnail + relative·absolute time + camera; severity color only on the event; full Events page with filters; a compact "recent activity" strip on the dashboard for what-just-happened. *(Frigate filmstrip, Scrypted tethers, UniFi thumbnails)*
7. **Calm empty/offline states** and **quiet motion** (100–150ms ease-out hovers, nothing looping). *(Viseron, Rauno, Pencil & Paper)*

### Design tokens (dark-first)

| Token | Value | Notes |
|-------|-------|-------|
| `--bg` | `#09090B` (zinc-950) | app canvas |
| `--surface` | `#101014` | rail, panels |
| `--surface-2` | `#18181B` (zinc-900) | cards, tiles' frame area |
| `--surface-3` | `#27272A` (zinc-800) | hover fills, popovers only |
| `--border` | `rgba(255,255,255,0.08)` | hairlines everywhere |
| `--text-1` / `-2` / `-3` | `#FAFAFA` / `#A1A1AA` / `#71717A` | values / labels / timestamps |
| `--accent` | `#3B82F6` (hover `#60A5FA`) | the ONLY interactive color; focus ring |
| `--live` | `#22C55E` | online/live dot + word |
| `--alert` | `#EF4444` | unknown-face/alarm only (+ 12% tint bg) |
| `--warn` | `#F59E0B` | loitering/degraded only |
| `--radius` | `10px` (derived: 6 / 8 / 10 / full for dots) | one source value |
| Type | Inter; 12 / 14 / 16–18px; `tnum` for times & counts | 3-step scale; no uppercase micro-labels |
| Spacing | 4px grid; tiles gap 8px; cards gap 16px; rail 56px | |
| Shadows | overlays only (`0 4px 24px rgba(0,0,0,.5)`) | elevation = surface step |
| Icons | Lucide, 16px chrome / 20px content, stroke 1.75 | one set, one weight |

### Information architecture

```
Rail (56px, icon-only)          Pages
┌──┬────────────────────────────────────────────────┐
│◧ │ LIVE      grid of tiles + recent-activity strip│
│▤ │ EVENTS    thumbnail browser + filters          │
│☺ │ FACES     known-people gallery                 │
│▷ │ RECORDINGS segment browser + player            │
│… │                                              │
│⚙ │ (settings later)                    user, ⎋   │
└──┴────────────────────────────────────────────────┘
Click a live tile → focused view (same route, camera in URL hash;
Esc/back returns; camera switcher in the focused top bar)
```

Dropped from the current UI: sidebar camera list (grid is the list), EventSidebar right
rail (becomes the recent-activity strip + full Events page), armed pill, type badges,
FPS chips (FPS moves to tile context/detail), login shield art, all gradients/glows.

### What we deliberately keep
- The **register wizard flow** (works well, just restyled) and the underlying API —
  this is a frontend-only redesign; zero backend changes.
- MJPEG feeds as-is, plus two cheap perf wins from the research: pause streams for
  off-screen tiles/hidden tab (IntersectionObserver + visibilitychange) and a global
  Low/High refresh toggle (SS9's global stream-profile pattern).

**Sources (primary):** Frigate repo `web/` (source-level) · frigate.video screenshots ·
Viseron repo `frontend/` · docs.scrypted.app · ZoneMinder/Shinobi repos (counter-examples) ·
blog.ui.com (Protect 6.0/7.0) · support.google.com (Home for web) · Apple support (cameras
in Home) · dongknows.com (SS9, screenshot analyzed) · behance.net/gallery/87379501 (Netguru
PSIM, screenshot analyzed) · ui.shadcn.com/docs/theming · tailwindcss.com/docs/colors ·
vercel.com/geist/colors · linear.app/blog (UI redesign) · lucide.dev ·
refactoringui.com (palette) · pencilandpaper.io (dashboard UX) · nngroup.com (dark mode) ·
docs.frigate.video (sub-stream/bandwidth) · rauno.me/craft (interaction).
