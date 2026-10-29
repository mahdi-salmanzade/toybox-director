# Toybox Director

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, Vite, Three.js, IndexedDB, and a local Node/Express server. The server uses the official Comfy SDK for generation and FFmpeg for film assembly. The production build and API share localhost port 3001; development uses Vite on port 5173. The repository began empty. Public hosting has not been requested.

## Users

Independent filmmakers and creative builders who want to stage short cinematic shots using simple objects and share remixable projects.

## Product Purpose

An open-source filmmaking studio for Comfy's Open Source Higgsfield challenge: direct shots by staging them in 3D, then render them with open-weight models in your own ComfyUI.

## Positioning

Compose a miniature stage, assign cinematic identities to props, set beginning/middle/end poses, preview the motion, and render through a Comfy workflow. Keep alternative takes, edit them into a short film, and share the editable direction alongside downloaded media.

## Capabilities and Constraints

Version 0.2 supports a virtual stage, three to eight keyframes per shot at times the director sets, keyframe editing in words, an HD (LTX-Video 13B) starter workflow, three cinematic worlds, photo inputs, multiple autosaved projects, import/export, and server-side Comfy integration. Projects live in browser IndexedDB and are separate for each origin and port. Export/import is the migration path between development and production addresses or browsers.

The render library persists metadata, source inputs, workflows, job IDs, and output files under `.toybox`. It recovers accepted jobs after API restarts and indexes older local output folders. Batch rendering can queue up to 12 shots; users can stop adding shots, cancel individual active jobs, retry failed/canceled renders, and explicitly delete completed media. No automatic output pruning occurs.

The film editor orders and trims up to 24 completed video clips into a silent 24 fps H.264 MP4, with a five-minute maximum. FFmpeg and FFprobe are required. Film edits are stored with projects, but their references depend on the local render library; project JSON does not bundle generated videos.

The bundled LTX workflow guides generation with every keyframe and the shot's camera move, captured from the 3D world. Guides are strong but not pixel-exact. Concept artwork remains labelled. API credentials stay server-side. The studio is a single-user local application, not a hosted service.

## Brand Commitments

The interface treats a miniature stage as a useful filmmaking instrument, with clear differences between staging, reference artwork, and generated footage.

## Evidence on Hand

Local ComfyUI and the official API proxy were installed with pinned model sources and verified hashes. Real LTX renders, browser workflows on desktop and mobile, persistent project and render recovery, and actual FFmpeg film export have been tested. The current pass reports 110 automated tests and a guided-versus-unguided render comparison. Detailed results belong in `docs/VERIFICATION.md`; installation and model licensing remain in `docs/LOCAL-RUNTIME.md`.

## Product Principles

- Show the stage as an editable creative instrument.
- Preserve projects, takes, and the inputs needed to retry a failed render.
- Make creative projects shareable and explain when film media must travel separately.
- Clearly distinguish a stage preview, a concept still, and completed generated video.
- Give useful setup and failure states instead of simulated render success.
