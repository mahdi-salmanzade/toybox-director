# Verification — October 17–19, 2026

Toybox Director 0.2 was tested as a local, single-user studio on macOS with Apple M5 Max / MPS. This verifies the implemented local filmmaking flow, not feature parity with any commercial platform.

## Automated checks

- `npm test`: **75 passing tests**. Covers project serialization and validation, IndexedDB storage and migration, quota failure, clone/reorder/delete behavior, film references and trims, clip-boundary idempotency, official SDK integration, persistent recovery across restarts, cancellation and retry, background media collection, bounded queues, actual FFmpeg assembly, and local HTTP/static-file boundaries.
- `npm run build`: TypeScript and production bundling pass. The Three.js-inclusive JavaScript bundle is approximately 1.26 MB / 355 KB gzip; Vite reports its large-chunk advisory.
- React Doctor inspected 18 frontend files in the final source-scoped scan. Both timer-cleanup errors were reviewed as false positives: `CameraPosition` calls R3F `invalidate()` once rather than registering an owned timer, and the render poll clears its timeout and prevents rescheduling after unmount. Other advisories concern component complexity, inexpensive ref initialization, explicit playback/drag dependency choices, capture-specific `flushSync`, intentional sequential batch capture, bounded polling, schema-validated lookups, and fixed procedural geometry keys. No rules were suppressed. The film playback effect was updated to observe clip-list changes during undo.
- Impeccable detector: zero anti-pattern failures. Palette/type inventory advisories remain; the design documentation records the shipped roles. A separate visual review confirmed its three material findings were resolved and returned `ship`.

## Actual browser checks

Used the running app, native media controls, and actual download/file chooser flows in a desktop browser:

- Created a separate project, renamed it, changed to the noir world, and verified matching scene defaults.
- Duplicated and reordered scenes; deleted a duplicate and restored it with Undo.
- Reloaded the page and recovered the active project, scene order, camera angle, and duration.
- Rendered a single shot from desktop and a two-scene batch from the mobile Director panel. Mobile captures were inspected at **1024 × 640** and contained the correct composed world, without editor controls.
- Restarted the Toybox API during the batch. The jobs resumed and their actual outputs appeared; older saved media received duration metadata on restart.
- Assembled the latest scene takes, played a three-clip sequence through to its final take, removed the extra clip, trimmed the opening take, reordered the cut, and exported an actual MP4.
- Pressed Space while a film video had focus: playback remained in Film edit rather than switching to stage playback.
- Exported `.toybox.json`, reimported it as a separate project, and verified its existing cross-project film references resolved and export remained enabled.
- Imported that project into the production origin at `http://127.0.0.1:3001/`, played the cut, exported it again, and downloaded the resulting MP4. No production console warnings/errors were observed.
- Inspected desktop at 1275 × 717 and mobile at 390 × 844. Film playback, clip selection, trims, and export are visible together on desktop. Mobile preview width is 327 px inside its panel; no horizontal document overflow.

Development and production have separate browser project libraries because storage is scoped by origin and port. Their server-side render library is shared. Export/import is the supported way to transfer editable projects between those origins.

## Real model and film outputs

All three new shots ran through the actual browser → Toybox API → official Comfy SDK → official API v2 proxy → local ComfyUI → LTX 2B pipeline. Each is a 512 × 320, 24 fps, 73-frame (3.041667-second) video:

| Shot | Local job ID |
| --- | --- |
| The last delivery, first take | `72a24d0d-9d63-401d-8cd2-c9abd846f251` |
| Neon overture, mobile batch | `0a99ef93-b1be-4b00-b785-bcafafacb7be` |
| The last delivery, mobile batch | `0b2ca83b-fb94-46ce-a2a8-204d4a968d1a` |

The finished **Midnight, in Miniature** film uses the opening take from 0.5–2.0 seconds followed by the complete final delivery take. FFprobe confirms H.264, 512 × 320, 24 fps, **109 frames / 4.541667 seconds**, with no audio track.

Local files: `.toybox/outputs/05c09ffc-71c8-4dd2-ba5c-c7a1e395b1e9/0.mp4` and the production export `.toybox/outputs/54ff188e-bab7-43ea-849f-234bd5276940/0.mp4`.

The prior October 16 desert render also remains available at `.toybox/outputs/0ca4cc91-8293-4363-bb42-fd74eeb7ddf0/0.mp4`.

## Follow-up verification and fixes

A separate verification pass exercised the production build on port 3001 and found defects beyond the original passing suite. The fixes now have regression coverage:

- Stage frame export uses the frozen playhead position, including time zero, and exports an uploaded photo only when that photo is displayed. Production CSP stays unchanged; inline image data is decoded directly to a validated Blob instead of fetched. Actual downloaded first/last PNGs were inspected at 1024 × 640; the time-zero capture is byte-identical to the first frame, and the last frame places the car at its final position. PNG, JPEG, and WebP byte/type checks are tested.
- Keyboard handling supports uppercase Shift+Z redo and project undo from focused buttons. Save works while a title field has focus; native text undo and button/media Space behavior are preserved.
- Workflow import/save operations are serialized and mappings cannot change while a save is pending. The installed workflow was saved successfully through the production browser.
- Render submissions reserve each queue slot exactly once. Twelve simultaneous submissions fit; the thirteenth is rejected. Library/detail reads stay responsive while an upstream submission stalls.
- Local Comfy can briefly report an active job as expired while it moves between queue and history. Toybox now confirms expiry for a bounded 30-second period, including across restart, and keeps accepted cancellation pending until Comfy explicitly confirms it. Tests cover transient cancellation/completion races, genuine expiry, and unconfirmed cancellation. A new real job (`eef51b5f-d26c-4ca8-b198-7f54be25e5d4`) visibly progressed through Stopping to Canceled; retry `708e41c8-306d-4104-8499-e2a43d8a82b0` then completed with a playable 3.041667-second video. The earlier reproduction remains as a failed diagnostic record in the test project.
- Render actions keep per-job guards across shelf navigation, preventing duplicate retries. Different jobs remain independent, and conflicting same-job actions receive a useful wait error.
- Preview port 4173 and a configured production PORT have exact loopback-origin allowances; unrelated origins remain denied. A live request through the Vite preview proxy returned 200 for its own origin and 403 for an unrelated origin.
- Maximum valid project text fits the compiled render request. Display names receive safe fallbacks while project/shot IDs retain their exact imported identity. Film title limits no longer prevent export of otherwise valid projects.

Additional checks: fresh-directory `npm ci` and production build; full suite on Node 26.0.0 and the declared minimum Node 22.18.0; full dependency audit with **zero known vulnerabilities**; local setup status/help; bundled workflow checked against the live node/model schema. The model installation was reused rather than reinstalled.

The production browser also verified malformed-project and corrupt-image error recovery, project persistence after reload, PNG/photo exports, Cmd+Z / Cmd+Shift+Z / Cmd+S, a real retried render, two-clip trimmed playback, MP4 export and download, and mobile layout at 390 × 844 without horizontal overflow. Test work is retained in the separate **Verification — October 17** project; existing projects were preserved.

The new successful real render is `c91f1c95-c92d-4e45-a3cc-8bb5b557f3ef`: H.264, 512 × 320, 24 fps, 73 frames / 3.041667 seconds. The new film `ce041f90-145f-4d5d-871a-17885cfd615d` joins the take from 0.5–1.5 seconds to a 2.041667-second recovered take. The downloaded MP4 is 543,405 bytes, H.264, 512 × 320, 24 fps, 73 frames / 3.041667 seconds, with no audio track.

## Creative extension verification

The Story sparks and Director’s dares extension passes **87 tests** and the production TypeScript/build checks. Twelve new tests cover three authored projects, independent identities and copies, valid portable data, meaningful pose/scale/camera changes, source photo preservation, and continuous named cast positions between scene cuts. The production JavaScript bundle is approximately 1.28 MB / 362 KB gzip, with the existing Vite chunk-size advisory.

Browser checks at desktop and 390 × 844 verified the three-story gallery, starting a new story while preserving the prior project, a scale-reversal take, Undo → Redo → Undo, and no horizontal mobile overflow. The new components produced no React Doctor diagnostics; App advisories concern the existing inexpensive ref initializer, component complexity, validated world lookups, capture-specific flushSync, and intentionally sequential batch capture. The production console contained no warnings or errors.

All three scenes of **A door looking for a home** were rendered with the actual local workflow, assembled, played through to the third clip, exported, and downloaded through the browser:

| Scene / export | Job ID |
| --- | --- |
| A door without an address | `08008a1b-acc9-45f1-96c6-b89912301e33` |
| The wrong room | `d14346eb-675f-401b-aba1-9e581eeff292` |
| Home has no walls | `1b6f3e0f-6334-461e-8675-06b48b8c3c20` |
| Complete film | `342c98fd-5040-4887-9080-12e4ca11d92c` |

FFprobe on the downloaded film confirms **H.264, 512 × 320, 24 fps, 219 frames / 9.125 seconds**, 495,412 bytes, and no audio. The local export is `.toybox/outputs/342c98fd-5040-4887-9080-12e4ca11d92c/0.mp4`. The downloaded editable project parses successfully with three scenes and three film clips. This verifies successful media production; the generated movement is not proof of strict pose or story adherence.

The detector found zero anti-pattern failures and five existing scene-prop color inventory advisories. The independent creative/visual review found the new surfaces coherent and their creative rules consequential. Its formal disposition remained **fix** solely because the earlier studio brief lacks independently retained FORM seed evidence. That inherited provenance gap was not repaired or represented as a passed gate; no new visual defect or redesign was identified. The current authoring bar is recorded in [CREATIVE-DIRECTION.md](CREATIVE-DIRECTION.md).

## Keyframe guidance — October 19, 2026

- `npm test`: **94 passing tests**, including camera-move geometry, plain-language motion prompts, guide-source selection, keyframe binding validation, guide bypass rewiring, and a real-SDK submission of the bundled keyframe workflow (asset uploads on nodes 5, 14, and 16; guide frames 36 and 72 for a 73-frame clip; retry keeps saved guides).
- Real local render from the production studio, driven in headless Chrome with GPU WebGL: clicking **Make it cinematic** captured three 1024×640 world frames with a push-in and submitted them with the shot direction. ComfyUI rendered the 145-frame, 512×320 clip in about 30 seconds on the M5 Max.
- Control render: the same saved request, seed, and prompt with both guides bypassed. The guided render follows the staged path and camera move; the first-frame-only render invents different scenery and motion. Frames 0, 72, and 144 of both are compared in `docs/media/keyframe-guides-comparison.jpg`.
- FFmpeg scene detection found no cuts in the guided clip; the car moves continuously and passes behind a tower.

## Keyframe restyling — October 27, 2026

- `npm test`: **100 passing tests**, adding restyle instructions and looks, the reveal's toy hold and guides, strip panel bounds, and a real-SDK submission of the bundled Qwen-Image-Edit graph with and without a look reference.
- Models: Qwen-Image-Edit-2511 bf16, Qwen2.5-VL 7B, the Qwen-Image VAE, and the 4-step Lightning LoRA, all Apache-2.0; SHA-256 values match `docs/LOCAL-RUNTIME.md`. A 1280×800 restyle takes about 35 seconds on the M5 Max once loaded.
- Driven through the production studio in headless Chrome: import, **Make keyframes real**, then **Make it cinematic**, for a reveal shot and a three-keyframe drive.
- What testing changed: long scene descriptions made the edit model recompose the shot, so instructions are short and literal. Restyling keyframes separately made the place change mid-shot, and passing a restyled keyframe as a reference made later keyframes copy its layout; editing all real keyframes as one side-by-side strip fixed both. A reveal that went straight from toy to real melted the toy, so the toy now holds through the middle keyframe.
- Remaining issue: a strip edit can still duplicate an object. One seed added a second car to the first keyframe; another seed did not. Shuffling the seed and restyling again is the recovery.

## Keyframe editing and in-betweens — October 29, 2026

- Automated: 106 tests pass (`npm test`), the typecheck is clean, and `npm run build` succeeds. New tests cover the edit source (this keyframe, the one before it, or the previous scene's last keyframe), photo-only prompts, three-to-eight keyframe shots and pose interpolation through every keyframe, spare guide slots, studio-sent positions (including retries), and strip grouping for restyles.
- Browser (headless Chrome over CDP against the production build): added keyframes up to eight, removed back down to three, selected keyframe 8 with its shortcut, and played the staging without console errors. On a 390-pixel mobile viewport, the edit bar wraps without horizontal overflow.
- Real renders (Apple M5 Max, local ComfyUI): a toy-to-real car shot built by chaining Qwen-Image-Edit-2511 edits, each from the previous keyframe, then rendered at 1024×576 and 24 fps for 10.7 seconds, with nine chained `LTXVAddGuide` guides. With only the toy, a dark tunnel, and the real car as guides, LTX cut from toy to car within one frame. Adding in-between edits (darker cabin, half-transformed ledge, dark tunnel road, lights coming up) made the change gradual. Every frame was reviewed around the morph and the tunnel exit. LTX-Video 2B distilled took about 4 minutes; 13B distilled 0.9.8 took about 9 minutes and gave the smoothest result. These runs used a script with the same guide chain; at the time, a shot in the studio held up to eight evenly spaced keyframes.

## Keyframe timing, edit from any keyframe, and the HD starter — October 29–30, 2026

- Automated: 110 tests pass (`npm test`), the typecheck is clean, and `npm run build` succeeds. New tests cover retiming (a keyframe stays between its neighbours, the first and last keyframes are fixed, an in-between lands halfway in a retimed shot, even spacing restores the defaults), pose interpolation through retimed keyframes, keyframe times on import (invalid and out-of-order times are rejected), guide sources at retimed positions, editing from any keyframe, and the starter routes (both starters install with all seven guide mappings; selecting a starter file through import brings its mappings; unknown and prototype-key ids return 404).
- The same toy-to-real shot was then made entirely in the studio, driven over CDP in headless Chrome against the production build and local ComfyUI, and screen-recorded:
  - **Render settings → Starter workflows → LTX keyframes HD.**
  - One car prop on a low camera, eight keyframes, retimed to 0, 2.3, 3.3, 3.6, 4.3, 4.6, 8.3, and 10 seconds.
  - Every keyframe photo came from the edit bar. Keyframe 1 was the stage plus an instruction; a second edit removed a car reflection from the window. Keyframes 2–4 were made from the previous keyframe, keyframe 6 from keyframe 2, and keyframes 5, 7, and 8 from keyframe 6. Each edit took 31–58 seconds.
- The first HD render (seed 42, 241 frames at 1024×576) ignored the 2.3-second dark-cabin keyframe, whose guide ran at strength 0.7. The HD starter now uses 0.8 for every guide; the standard starter is unchanged. The second render holds the toy in the tunnel's light, changes it in the dark between frames 80 and 88, and brings the tunnel lights up by frame 112. The largest frame-to-frame change is where the tunnel wall enters, not at the transformation.
- Each 13B render took about 9–12 minutes on the M5 Max. Every frame of the transformation and of the tunnel exit was reviewed. A brief camera swing smears the skyline around 8.7–9.2 seconds.

## Limits

The bundled workflow guides generation with every keyframe, but guides are soft: LTX can drift between them, and an uploaded opening photo disables stage-captured guides for frames without their own photo. Draft model output remains stylized and does not promise the reference artwork's appearance. Film export is silent, uses hard cuts, and supports up to 24 clips / five minutes. Arbitrary custom workflows, fresh runtime installation on other operating systems, other GPU hardware, Safari/Firefox, and public hosting have not been verified. Model licenses are separate from the app's MIT license.
