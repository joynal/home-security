# Scrypted-Style Redesign — Deep Research (timeline, backend gaps, face UX)

> Companion to [ui-research.md](./ui-research.md) (design language) — this doc covers the
> Scrypted-specific deep-dive: what their product actually does, **what our backend must
> add** to support a Scrypted-class UI, and a **face enrollment/management redesign**.
> Method note: subagent research hit API rate limits mid-run; primary research was done
> directly — docs.scrypted.app and docs.frigate.video fetched, Frigate API source read
> (`frigate/api/record.py`, `media.py`, `preview.py`), pixel-level analysis of Scrypted's
> timeline screenshot. Face-ID/Nest/Photos flows are cited from public documentation and
> well-established patterns. Research date: 2026-09-19.

---

## 1. Scrypted NVR — what it actually is

Feature set (from docs.scrypted.app/scrypted-nvr/features):

| Feature | What they do | Do we have it? |
|---------|--------------|----------------|
| Smart Detections | person/car/package/animal events power Timeline + Events | ⚠️ person + face only (YOLO class filtering is one line — we run `classes=[0]`) |
| **Timeline** | vertical time-rail UI over 24/7 recordings | ❌ the core gap (below) |
| Events | thumbnail feed of detections | ✅ (SQLite + thumbnails) but no browse-by-day |
| **Face Recognition** | "Tag and recognize faces for use in automations" | ✅ **ours is stronger**: ArcFace buffalo_l ≈ their top model tier; we do enrollment + live ID |
| License Plate Recognition | recognize + search plates | ❌ future (YOLO/PaddleOCR) |
| Rich Notifications | push with detection thumbnail (iOS/Android/Web) | ⚠️ Telegram/ntfy photos — no in-app notification surface |
| AI Search | natural-language search across history | ❌ out of scope for now |
| AI Summaries / Stories | auto-generated narrative titles + photo collages ("Dogs Exploring Your Home · Kitchen, Living Room and Back Yard · 19m ago") | ⚠️ we have daily text summary; no collage/story cards |
| Adaptive Bitrate | substream switching per network | ⚠️ go2rtc gives us streams; no adaptive player |

**Answering the open question: yes, Scrypted ships face recognition for known people**
("Tag and recognize faces"), and **Frigate added it too** (docs: FaceNet "small" /
ArcFace "large" models, person must be detected first, name applied as a `sub_label`,
with a `save_attempts` setting that *saves recognized-face images to improve training
over time* — passive enrichment). Our InsightFace pipeline is recognition-equal or
better; what they have that we lack is **integration**: recognized names flow into
events/filters/notifications, and their face library improves itself from sightings.

### Scrypted's timeline — the piece to replicate (pixel analysis of their screenshot)

```
 09:15 PM ─┐        ┌──────────────────┐
            │  🚗🚶──┤  [thumbnail]     │   time is the Y-AXIS:
 09:00 PM ─┤  ═════──┤  [thumbnail]     │   newest at top; gaps between
            │  🚶────┤  [thumbnail]     │   thumbnails = dead time
 08:45 PM ─┤        │                  │
     …     │  (rail) │  (pinned thumbs) │
 ──────────[Jul 9 / 08:53:50 PM]────────  ← draggable playhead badge
```

Exact mechanics worth copying:
- **Vertical rail** (~16px) with **event "blobs"** — contiguous blue segments where
  activity happened; gaps where nothing did (a density heatmap)
- **Thumbnails pinned to timestamps** — vertical position *is* time encoding; not an
  evenly-spaced list
- **Thin connector lines** rail→thumbnail with small gray **object-class icons** inline
- **Playhead badge** (date + hh:mm:ss, monospace) with a full-width rule — draggable
- **Monospace timestamps**, 15-min major ticks with labels, seconds precision
- No card chrome, no dividers — whitespace + connectors do the structure
- Hover/selected state enlarges the thumbnail
- (Their screenshot is light-mode; we render the same geometry in our zinc dark theme
  — mechanics, not the blue-on-white palette, are the IP here)

Their **events view**: single-column rows — metadata left (time, duration in muted
gray, object icons), rounded 16:9 thumbnail right, hairline dividers, chrome
monochrome so thumbnails are the only color (from round-1 research, docs.scrypted.app).

## 2. Frigate's backend — the reference data model (read from source)

Frigate's timeline is powered by exactly three things we don't have:

1. **A `Recordings` SQLite table indexing every segment**: `camera, path, start_time,
   end_time, duration, motion_count, object_count` — the timeline renders from SQL,
   never from directory scans. (`frigate/api/record.py`)
2. **Summary APIs**: `/recordings/summary` → day→bool (for calendar), and
   `/{camera}/recordings/summary` → per day, per hour: `{hour, events, motion,
   objects, duration}` — the exact shape a scrubber needs. Same file.
3. **Time-range media**: `/{camera}/recordings/preview/{start}/{end}` returns
   **pre-generated short mp4 preview clips** overlapping the range (scrub previews);
   `/vod/{camera}/start/{ts}/end/{ts}` builds an **HLS playlist on the fly** over the
   indexed segments with keyframe-aware in/out clipping (nginx-vod-module); a simpler
   `clip.mp4` endpoint extracts clips via **ffmpeg stream-copy at serve time**.

Also notable: Frigate's face recognition stores `save_attempts` images per person
(auto-appends good sightings — the enrichment loop), and applies names only after
`min_faces` recognitions (debounce against flicker mis-IDs).

## 3. Our backend gap analysis + additions spec

What we already have (verified live this session): MP4 serving with **HTTP Range**
(Starlette FileResponse → 206/`accept-ranges` — seeking inside a 15-min segment works
today), clock-aligned segment filenames (`YYYYMMDD_HHMMSS.mp4` → start time is
derivable), `events.db` with an **unpopulated** `recording_segment` column, and
per-event thumbnails.

### Backend additions — ranked

**MUST (unlocks the Scrypted UI):**

| # | Addition | Spec |
|---|----------|------|
| B1 | **Recordings index table** | New SQLite table `recordings(camera_id, path, start_time, end_time, duration, size_bytes)` — populated on FFmpeg segment rotation (recorder knows the boundary) + startup directory scan (backfills from filenames + ffprobe duration). This is Frigate's foundation. |
| B2 | **Timeline API** | `GET /recordings/{cam}/timeline?date=YYYYMMDD` → `{ hours: [{hour, segment_minutes, events, unknowns}], segments: [{start, end, path}] }`. Powers the rail blobs + scrub resolution. |
| B3 | **Event→segment resolution** | Helper `segment_for(camera_id, ts)` over B1. Event detail "Play" = load segment file at `#t=` offset (works today via Range seeking — **no HLS needed for v1**). |
| B4 | **Frame-at-time endpoint** | `GET /recordings/{cam}/frame.jpg?ts=` → ffmpeg `-ss {t} -i segment -frames:v 1` (cached). Timeline hover previews. |
| B5 | **Log known-face events** | Inference loop currently logs `unknown_face` only. Log `known_face` with `person_name` + `confidence` too (own cooldown, e.g. 60s/person/cam) → per-person sighting history. Add `person_name` filter to `/events`. |
| B6 | **Person management API** | `PATCH /faces/{name}` (rename), `POST /faces/{name}/add` (add reference image from event/frame — enroll-from-detection), per-person image listing already exists. |

**NICE (polish + parity):**

| # | Addition | Spec |
|---|----------|------|
| B7 | **Clip extraction** | `GET /recordings/{cam}/clip.mp4?start=&end=&padding=5` — ffmpeg stream-copy, serve (Frigate's clip.mp4 pattern). Event playback with lead-in + share/export. |
| B8 | **Live snapshot endpoint** | `GET /cameras/{cam}/snapshot.jpg` from `state.latest_frames` → snapshot-idle grid tiles + notifications. |
| B9 | **Story cards** | Aggregate events per time-window into `{title?, cameras[], thumbnail collage, ts}` — our daily-summary generator extended; v1 can be mechanical ("3 unknown visits · Front Door") without AI. |
| B10 | **Per-segment event counts** | Increment `events`/`unknowns` counters on the recordings row when an event lands inside it (Frigate's `motion`/`objects` columns) — makes B2 hour-buckets cheap. |
| B11 | **Loitering/motion on timeline** | Event types already distinguishable; render amber/red blobs vs blue. |

**Explicitly not needed for v1**: HLS/nginx-vod (Range seeking + segment playlists
covers a home deployment; revisit if playback gaps at 15-min boundaries annoy),
WebRTC playback, LLM AI-search, license plates.

## 4. Face enrollment & management — redesign

### Research findings

- **Apple Face ID** (the guided-enrollment gold standard): animated head-orbit target,
  progressive fill as captures land, two passes, explicit recovery guidance
  ("move more slowly", "hold iPhone lower") — *guidance + instant confirmation*, never
  a bare "capture" button. (support.apple.com Face ID setup; pattern universally documented.)
- **Google Nest Familiar Faces**: enrollment happens **from live detections** — the
  camera recognizes an unknown face, you confirm and name it; the library grows from
  real sightings, not studio captures.
- **Google Photos people album** (management pattern): auto-clustered person grid,
  "Who is this?" naming prompt, **merge people**, **remove wrong photo**, cover-photo
  choice — corrections are first-class, one tap from the mistake.
- **Frigate's approach** (source: their face-recognition docs): quality gates
  (`min_area` 750px, detection threshold 0.7), recognition debounce (`min_faces` before
  naming), and **`save_attempts`**: keep N good sighting crops per person to retrain —
  accuracy compounds passively.
- **Technical (matching/embeddings)**: our current scheme — one embedding per reference
  image, max-cosine over all — is the recommended approach for small galleries
  (naive averaging degrades ArcFace discrimination); the wins come from *better and
  more diverse references*, not fancier matching. Quality gates at capture: blur
  (Laplacian variance), face size, brightness, pose — **we already compute pose**
  (`compute_pose`) for the wizard; it doubles as a diversity/quality criterion.

### Proposed flow v2

**Enrollment — keep the wizard skeleton, add gates + feedback:**
1. Same 5 poses (center/left/right/up/down) — `compute_pose` already drives it
2. **Quality gate before capture counts**: face size ≥ ~96px, blur (Laplacian var
   threshold), brightness in range, pose-hold 2s (existing). Failed gate = specific
   hint ("closer", "more light", "hold still") — Face-ID-style guidance, not silence
3. **Instant confirmation per pose**: check-mark + captured-frame thumbnail strip
   (5 slots fill up) — progress is always visible; any pose skippable, re-takeable
4. On finish: embeddings stored per-image (unchanged), person appears in Faces

**Passive enrichment (Frigate's save_attempts, adopted):**
5. When a **known** person is recognized with high confidence (e.g. sim ≥ 0.55) and
   their reference count < cap (12), save the crop + embedding automatically
   (guardrail: only if pose is near-frontal and quality gates pass — avoids appending
   bad angles/mis-detections; never from low-light/blurry frames)

**Enroll-from-event (Nest pattern):**
6. Unknown-face event card → **"Name this person"** → name input → embeds from the
   event's stored frame/thumbnail (re-run InsightFace on the full-res crop) → person
   created from a real sighting

**Faces page v2 (Google-Photos pattern):**
7. Person cards: cover image (best sighting), name, `last seen`, sighting count
8. Person detail: sighting timeline (B5 events by person_name), reference gallery,
   **add more photos** (from sightings or live), rename, delete
9. Correction loop (later phase): on a sighting card "Not [name]" / merge two people

All of 6–9 ride on B5/B6. The wizard (1–4) is frontend + a small quality-gate helper.

## 5. What this changes in ui-plan.md

The design-language foundation (tokens, Lucide, zinc, no gradients) **stands**. The
layout section is superseded by the Scrypted geometry:

- Camera detail view = **player left + vertical timeline rail right** (§1 mechanics)
  instead of a plain focused player — this is now the flagship screen
- Events page = their events-row pattern (round-1 description) + day navigation
  (needs B2)
- Home = live grid + **story/recent strip** (their nvr-summary pattern, B9)
- Faces page = §4 gallery + person detail
- Settings page: **deferred** — it implies a config-write API (cameras.json editor);
  separate proposal later

`ui-plan.md` will be revised to v2 (phases U-B: backend B1–B6 first, then the revised
frontend tasks) — pending your go-ahead. Nothing has been implemented.
