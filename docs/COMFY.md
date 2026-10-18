# Connect Toybox to Comfy

Toybox submits real ComfyUI API graphs using the official `@comfyorg/sdk` (pinned to 0.5.0). It supports local ComfyUI through the official Comfy API v2 proxy, Comfy Cloud, and Comfy serverless deployments. There is no simulated rendering fallback. Preview scenes and reference images in the studio are creative references; they are not returned as generated results.

## Local setup

Requires Node 22.18+, Python 3.12/3.13, Git, and a ComfyUI-capable GPU (Apple Silicon/MPS is supported by ComfyUI, but model compatibility and speed vary).

```sh
npm install
npm run setup:local
npm run setup:local -- --start
# In another terminal:
npm run dev
```

The setup command clones official ComfyUI at revision `bdc63e72f5ab29fde448c161db3057827148c0ef` into `.toybox/runtime/ComfyUI`, creates an isolated Python environment, installs its requirements and official `comfy-api-proxy==0.1.6`, and creates `.env` if absent. Existing ComfyUI checkouts are preserved. It does not silently download model weights. See [LOCAL-RUNTIME.md](./LOCAL-RUNTIME.md) for the models and workflow tested on this machine.

If you already run ComfyUI on port 8188, run its official proxy:

```sh
pip install comfy-api-proxy
comfy-api-proxy --comfyui http://127.0.0.1:8188 --host 127.0.0.1 --port 8189
```

Copy `.env.example` to `.env`, keep `COMFY_BASE_URL=http://127.0.0.1:8189`, and leave `COMFY_API_KEY` blank unless your proxy uses authentication. Restart Toybox after environment changes. Port 8188 is the original ComfyUI API; the SDK needs the **v2 proxy on port 8189**.

## Connect an image-to-video workflow

A verified LTX starter is included in [`workflows/`](../workflows/README.md). Local setup initializes it when no workflow has been saved. Its two model files must be present; the machine-specific setup and actual render verification are recorded in [LOCAL-RUNTIME.md](./LOCAL-RUNTIME.md). To use a different graph:

1. Open ComfyUI at `http://127.0.0.1:8188` and run your image-to-video workflow successfully. Install the exact models and custom nodes it needs.
2. Enable developer options if necessary and export the graph in **API format**. A visual editor save with a `nodes` array is a different format.
3. In Toybox's connection settings, import that JSON and map the widgets:
   - **Image:** a loader's filename widget, usually `LoadImage` → `image`. Do not select an IMAGE socket linked from another node.
   - **Prompt:** the positive text widget, usually `CLIPTextEncode` → `text`.
   - **Seed:** optional, the sampler's numeric seed/noise seed widget.
   - **Negative prompt:** optional, the negative encoder's text widget.
   - **Output node:** optional, the node that saves the final video/image. Leaving this empty collects supported media across output nodes.
4. Save the mappings. Place the shot, write the direction, and render. The first captured/uploaded image becomes the graph's image input.

Mapping example: [`workflows/bindings.example.json`](../workflows/bindings.example.json). These example IDs are illustrative, not universal. A workflow must contain its real image conditioning and video-generation nodes; the app cannot make a text-to-image graph produce video.

Duration is optional at the API layer. A normal mapping writes seconds directly to a numeric widget. For a native frame-count widget, use `{nodeId:"6",input:"length",unit:"frames",fps:24,frameStep:8}`: seconds become the nearest valid `8n+1` frames (5 seconds → 121 frames). Keep the graph's conditioning FPS and saved video's FPS at the mapped value. Use `frameStep:1` for unconstrained frame counts. `GET /api/workflow` reports whether duration is mapped, and `POST /api/render` returns the resulting `renderSeconds`. If duration is unmapped, the imported graph's length is retained and stage timing affects only the preview. The generic runner currently supplies one image; extra storyboard frames are retained in the creative project, but do not become model keyframes automatically.

## Cloud or a Comfy deployment

Use the same exported graph and mappings. Change `.env` and restart:

```dotenv
COMFY_BASE_URL=https://cloud.comfy.org
COMFY_API_KEY=your-server-side-key
```

For a serverless deployment, change the base URL to `https://YOUR-DEPLOYMENT.run.comfy.app`. The deployment must contain all models and nodes needed by your graph. Cloud rendering uses your Comfy account's credits; Toybox does not estimate cost. Use the scene render action or explicitly choose Render all scenes to submit work. Background polling follows those submitted jobs; an uncertain submission is retried with its original idempotency key. Retrying a failed or canceled render is a separate user action that creates a new job.

## Production studio

After installing dependencies, build the studio and serve it from the same process as the API:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:3001` (or `http://localhost:3001`). The server serves only the built `dist` directory and supports client routes; unknown `/api` routes still return JSON 404 responses. `npm run dev` uses Vite on port 5173 plus the same backend port 3001. Stop the development command before starting the production command.

`npm run preview` serves the built frontend on port 4173 and proxies `/api` to port 3001. Keep `npm run server` running separately when using this preview. The default origin allowlist includes the production `PORT` (3001 unless configured), development port 5173, and preview port 4173, for both `localhost` and `127.0.0.1`. Other ports remain blocked. An explicit `TOYBOX_ALLOWED_ORIGINS` value replaces this list, so include every studio origin you intend to use. Changing the production `PORT` does not change Vite's development or preview proxy target.

Project autosaves are held in IndexedDB and are scoped to the browser's exact origin. **Export `.toybox.json` backups before changing from port 5173 to 3001, changing `127.0.0.1` to `localhost`, or changing browsers, then import them at the new address.** Render history lives on the server and is shared by both frontends when they connect to the same `.toybox` directory.

## API contract

All routes are under `/api`. API keys and the Comfy endpoint are configured on the server; requests cannot choose an arbitrary upstream URL.

| Route | Request / response |
| --- | --- |
| `GET /health` | `{connected, provider, workflowConfigured, movieExportAvailable, message}`. Checks v2 reachability; movie export requires both FFmpeg and FFprobe on PATH. |
| `GET /workflow` | `{configured, workflow, bindings, nodes, duration?}`. Reads the saved graph and duration mapping; no API key. |
| `POST /workflow` | `{workflow, inspect:true}` validates and returns node widgets without saving. |
| `POST /workflow` | `{workflow, bindings}` validates and persists `.toybox/workflow.json`. |
| `POST /render` | `{image, prompt, negativePrompt?, seed?, duration?, workflow?, bindings?, metadata?}` → HTTP 202 with a durable job record including `id`, `status`, and `renderSeconds`. Omit workflow/bindings to use the saved graph. |
| `GET /jobs` | `{jobs:[...]}`, newest first. Includes renders and assembled movies across API restarts. |
| `GET /jobs/:id` | The current durable job, including available progress, output media, and error details. |
| `POST /jobs/:id/cancel` | Requests actual upstream cancellation, or stops a movie encoder; returns HTTP 202 with the resulting job state. Completion can win a race against cancellation. |
| `POST /jobs/:id/retry` | Creates a new job from a failed/canceled job's preserved inputs and workflow or movie edit. Returns HTTP 202; completed/active jobs cannot be retried this way. |
| `DELETE /jobs/:id` | Removes a terminal job and its media; returns HTTP 204. Active jobs, or source videos used by an active movie export, cannot be deleted. |
| `POST /movies` | `{title, clips:[{jobId, outputIndex?, inPoint?, outPoint?}], metadata?}` → HTTP 202 with a movie job. Clip times are seconds; the default output index and start are zero, and the default end is the source duration. |
| `GET /outputs/:jobId/:file` | Saved output media with normal browser range requests for video. |

Job records expose `id`, `kind` (`render` or `movie`), `status`, `createdAt`, `updatedAt`, and `outputs`, plus available metadata, progress, errors, duration, and movie title. Timestamps are epoch milliseconds. Status is `queued`, `running`, `canceling`, `completed`, `failed`, or `canceled`. Render progress comes from Comfy; movie progress comes from the encoder. Metadata accepts `shotId`, `shotName`, `world`, `projectId`, and `projectName`, which are flattened into public job responses. Original images, workflow snapshots, endpoint configuration, and upstream handles are not exposed in library responses.

Project and shot IDs are opaque metadata references and retain the exact strings from imported projects. They are not used as filesystem paths. Display names are trimmed; their control characters are rejected.

Each input mapping uses `{nodeId:"10",input:"image"}`. `bindings` requires `image` and `prompt`, and optionally accepts `negativePrompt`, `seed`, `duration`, and `outputNodeId`. The compiled prompt must be 1–20,000 characters, allowing the studio's direction, prop roles, and three staging notes; seed must be a nonnegative safe integer; duration must be 1–30 seconds. Metadata names and IDs accept up to 200 characters, matching project imports. The image must be an inline base64 PNG/JPEG/WebP smaller than 8 MB. Toybox permits up to **12 active render jobs**, **two active movie exports**, and **12 media outputs per render**, with a **256 MB limit per generated output**. Comfy controls the GPU execution queue.

Submission is saved before contacting Comfy. A temporary transport failure can therefore leave a queued job with an explanatory error; Toybox retries that same submission with its original idempotency key. HTTP 202 means the local job is tracked, not that generation has completed. Accepted jobs may still fail because a model/node is missing, memory is insufficient, or a graph is invalid. Errors are surfaced, never replaced with stock media. Output collection accepts PNG/JPEG/WebP/GIF, MP4/WebM/MOV, and common audio formats.

## Film export

Install FFmpeg and FFprobe so the Toybox server can invoke them from PATH. They are separate from the ComfyUI/model setup. Export requires an FFmpeg build with the H.264 encoder (`libx264`). Missing tools or an encoding failure produces an actionable error rather than a placeholder movie.

A film contains 1–24 completed local video clips, with a combined trimmed duration of at most five minutes. The server validates each job, output index, and trim range; arbitrary URLs and filesystem paths are not accepted. The output is a **silent 24 fps H.264 MP4**, normalized to the first clip's aspect ratio and dimensions, capped at 1920×1080. Other aspect ratios are padded with black. No model generation is performed during assembly.

Movie jobs and their source clip references persist. An export interrupted by an API shutdown can restart when the server resumes. Source clips cannot be deleted while an export is using them. The exported movie is stored in the same render library and can be downloaded independently.

## Persistence and local service scope

Editable projects and film edits autosave in browser IndexedDB. The older single-project localStorage save is migrated on the same origin. Project JSON includes uploaded keyframe images, props, poses, and directions, but **does not embed generated video**. Film edits store references to this machine's render jobs. Send downloaded media separately when sharing with another machine.

The backend writes atomic job records to `.toybox/jobs/`, including original input images, workflow snapshots, metadata, and the upstream job identity. `.toybox/outputs/` holds downloaded media. While the API runs, background polling collects completed files even if the browser is closed. On API restart, the official SDK recovers accepted jobs using their saved upstream IDs. If Comfy has expired or lost a job, Toybox reports that and retains the saved input for an explicit retry. Cancellation is never inferred from a timeout.

Older output folders without job records are recovered into the library as **Recovered render**. At startup, missing duration and dimension metadata is probed for both these files and existing records. Output files are never automatically pruned; delete unwanted takes explicitly in the library. Keep `.toybox/jobs/` and `.toybox/outputs/` together when backing up server-side render history.

The server listens on loopback, checks browser origins and Host headers, keeps secrets server-side, and serves production files only from `dist`. `.env` and `.toybox/` must stay gitignored. Imported graphs execute on the configured Comfy backend; import only graphs whose nodes you trust. This is a single-user local studio. Public hosting would require authentication and per-user isolation.

## Verification

```sh
npm run test:server
curl http://127.0.0.1:3001/api/health
```

The automated suite uses the real SDK against controlled protocol responses to test uploads, widget substitution, restart recovery, cancellation, retries, idempotency, exact downloaded bytes, and failure handling. It also exercises real FFmpeg trimming/concatenation and production file boundaries. These checks are distinct from GPU generation. The current complete test run has 75 passing tests; current browser and runtime evidence is recorded in [VERIFICATION.md](./VERIFICATION.md) and [LOCAL-RUNTIME.md](./LOCAL-RUNTIME.md).

The original complete Toybox HTTP path was also exercised against the installed LTX model on October 16, 2026: `POST /render` uploaded the lunar source, applied the saved graph and 2-second frame mapping, and `GET /jobs/:id` returned a completed video. The cached file downloaded through `/api/outputs` was a 641,286-byte H.264 MP4, 512×320, 49 frames at 24 FPS (~2.04 seconds). Local verification details are saved in `.toybox/backend-verification.json`; this is actual model execution, distinct from the controlled automated tests.

The October 17, 2026 continuation also verified three actual local renders, mobile batch submission, durable history, and a 4.541667-second film export. See the current verification report for that pass.

Primary references checked October 16, 2026:

- [Official Comfy TypeScript SDK](https://github.com/Comfy-Org/comfy-typescript-sdk)
- [Comfy SDK documentation](https://docs.comfy.org/development/api-development/sdks)
- [Official self-hosted API proxy guide](https://docs.comfy.org/development/comfyui-server/api-proxy)
- [ComfyUI source](https://github.com/Comfy-Org/ComfyUI)
