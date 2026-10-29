# Local ComfyUI runtime

Toybox can render through the official Comfy API v2 proxy on this machine:

```text
Toybox server → http://127.0.0.1:8189 → http://127.0.0.1:8188 → Apple GPU (MPS)
                 comfy-api-proxy       ComfyUI
```

The isolated installation lives in `.toybox/runtime/ComfyUI`. Its Python environment, model weights, inputs, outputs, and proxy state are ignored by Git. No global Python packages are installed.

## Installed versions

Installed on October 16, 2026:

| Component | Version |
| --- | --- |
| ComfyUI | `0.41.0`, commit `bdc63e72f5ab29fde448c161db3057827148c0ef` |
| comfy-api-proxy | `0.1.6` |
| Python | `3.13.14` in `.toybox/runtime/ComfyUI/.venv` |
| PyTorch | `2.14.1`, Apple MPS available |
| ComfyUI frontend | `1.55.17` |

The installer resolved Python through `uv`; the system Python is unchanged. Runtime metadata is saved at `.toybox/runtime/installed-runtime.json`.

## Models

The starter workflow uses the compact LTX-Video 2B distilled model. It is a practical local draft renderer, not a guarantee of exact composition or object identity. The bundled workflow conditions on three keyframe images: the start, middle, and end of the shot.

| File | Directory under ComfyUI | Download size | License |
| --- | --- | --- | --- |
| `ltxv-2b-0.9.8-distilled.safetensors` | `models/checkpoints/` | 6.34 GB | LTXV Open Weights License 0.X |
| `t5xxl_fp16.safetensors` | `models/text_encoders/` | 9.79 GB | Apache-2.0, per publisher model card |

The full-precision checkpoint and FP16 T5 encoder avoid relying on float8 support on Apple MPS. LTX inference uses BF16, one of the model's supported compute types, with FP32 VAE decoding. The model includes its VAE; no separate VAE or third-party custom nodes are required. The application source license does not replace the model licenses. LTXV's custom license includes use restrictions and commercial licensing terms; review the linked license for redistribution or hosted use.

Sources:

- [Official ComfyUI repository](https://github.com/Comfy-Org/ComfyUI)
- [Official API proxy and options](https://github.com/Comfy-Org/comfy-api-proxy)
- [Official ComfyUI LTX workflow guide](https://docs.comfy.org/tutorials/video/ltxv)
- [LTX-Video model download](https://huggingface.co/Lightricks/LTX-Video/resolve/8984fa25007f376c1a299016d0957a37a2f797bb/ltxv-2b-0.9.8-distilled.safetensors)
- [LTX-Video model license](https://huggingface.co/Lightricks/LTX-Video/blob/8984fa25007f376c1a299016d0957a37a2f797bb/LTX-Video-Open-Weights-License-0.X.txt)
- [T5 encoder download](https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5/t5xxl_fp16.safetensors)
- [T5 encoder model card](https://huggingface.co/comfyanonymous/flux_text_encoders)

Expected SHA-256 values:

```text
76aa8c4786af752fa6f951947129d5290c3c6c0b2fadcadea6b5e114ae2cad8f  ltxv-2b-0.9.8-distilled.safetensors
6e480b09fae049a72d2a8c5fbccb8d3e92febeb233bbe9dfe7256958a9167635  t5xxl_fp16.safetensors
```

### HD starter (optional)

The **LTX keyframes HD** starter (`workflows/ltx-keyframes-hd.api.json`) is the same graph with LTX-Video 13B at 1024×576. Choose it under **Render settings → Starter workflows**. It uses the same T5 encoder plus one more checkpoint:

| File | Directory under ComfyUI | Download size | License |
| --- | --- | --- | --- |
| `ltxv-13b-0.9.8-distilled.safetensors` | `models/checkpoints/` | 28.58 GB | LTXV Open Weights License 0.X |

- [LTX-Video 13B download](https://huggingface.co/Lightricks/LTX-Video/resolve/8984fa25007f376c1a299016d0957a37a2f797bb/ltxv-13b-0.9.8-distilled.safetensors)

```text
2c5f814744f04d8118e0b5bbfc0742655b51e41a6c090da66fde2936d651a9c9  ltxv-13b-0.9.8-distilled.safetensors
```

On this Apple M5 Max (128 GB), a 10-second HD shot (241 frames) takes about ten minutes.

## Restyle models (optional)

**Make keyframes real** restyles each stage capture with Qwen-Image-Edit-2511 before it guides LTX. The studio, staging, and rendering all work without these files; only that action needs them. They total about 59 GB. Use the bf16 files: Apple MPS does not run the fp8 builds.

| File | Directory under ComfyUI | Download size | License |
| --- | --- | --- | --- |
| `qwen_image_edit_2511_bf16.safetensors` | `models/diffusion_models/` | 40.86 GB | Apache-2.0 |
| `qwen_2.5_vl_7b.safetensors` | `models/text_encoders/` | 16.58 GB | Apache-2.0 |
| `qwen_image_vae.safetensors` | `models/vae/` | 0.25 GB | Apache-2.0 |
| `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | `models/loras/` | 0.85 GB | Apache-2.0 |

Sources, pinned to the revisions verified here:

- [qwen_image_edit_2511_bf16.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-Edit/resolve/f68ace85e60b4a02a323e394253731947657b7d2/split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors) ([model card](https://huggingface.co/Qwen/Qwen-Image-Edit-2511))
- [qwen_2.5_vl_7b.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image/resolve/1f12b17be14c89b026c51a91d67c32f84bb047bc/split_files/text_encoders/qwen_2.5_vl_7b.safetensors)
- [qwen_image_vae.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image/resolve/1f12b17be14c89b026c51a91d67c32f84bb047bc/split_files/vae/qwen_image_vae.safetensors)
- [Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/107d238d68b8387e32843d0b4a2e24ceb0d3ad86/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors)

Expected SHA-256 values:

```text
ae42d927b5fac4f278b9a894554c727e619727a63622976f2d95625be4bce08c  qwen_image_edit_2511_bf16.safetensors
cfafd739459bc86257397259f612a9aee88e5b98e85b5c0d0d1717e898b3463a  qwen_2.5_vl_7b.safetensors
a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f  qwen_image_vae.safetensors
22226e8d05d354bb356627d428809f5afd7819399b077238a2b70a82883a904f  Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors
```

## Start and status

The project helper reuses this installation and preserves an existing workflow:

```sh
npm run setup:local -- --status
npm run setup:local -- --start
# In another terminal:
npm run dev
```

On a fresh checkout, run `npm run setup:local` first, then download the two model files from the pinned links above into their listed directories. The setup helper installs software; model weights remain separate downloads.

## Run the production studio

Once ComfyUI and its proxy are running, start the production studio separately:

```sh
npm run build
npm start
```

The studio and API share `http://127.0.0.1:3001`. For development, `npm run dev` serves the studio at `http://127.0.0.1:5173` and the API at port 3001; do not run both start commands simultaneously.

Project autosaves use browser IndexedDB, with a separate library for each origin. Export `.toybox.json` backups before switching ports, switching between `localhost` and `127.0.0.1`, or changing browsers, then import the backups at the destination. The same server-side render files remain accessible when using the same Toybox data directory.

## Film export tools

Film assembly requires **FFmpeg and FFprobe on PATH**, including FFmpeg's `libx264` encoder. These tools are separate from the Python runtime and model weights; `setup:local` does not install them. Verify availability with:

```sh
ffmpeg -version
ffprobe -version
```

The studio exposes availability through `/api/health` as `movieExportAvailable`. Up to two exports can run at once. Each joins 1–24 completed local clips, trims them to a total of at most five minutes, and writes a silent 24 fps H.264 MP4. It uses the first clip's aspect ratio, caps dimensions at 1920×1080, and pads mismatched aspect ratios. Film assembly does not invoke the GPU model again.

## Recovery and local data

Toybox stores durable job metadata, original source images, workflow snapshots, and upstream job IDs in `.toybox/jobs/`. Completed media and film exports live in `.toybox/outputs/`. Both persist across API restarts, and no automatic media pruning occurs. Keep those directories together when backing up the render library.

The API polls submitted jobs in the background while it runs, then recovers accepted jobs by their upstream ID after a restart. ComfyUI and the proxy are independent processes; restarting Toybox does not itself stop their work. If the upstream service loses or expires a job, Toybox marks it failed and allows an explicit retry from the saved input. An interrupted film export can restart from its stored clip references.

The studio can submit a project's scenes as a batch, with up to 12 active render jobs. Stop adding shots prevents further batch submissions; already accepted jobs remain visible and can be canceled individually. Cancellation uses the upstream operation rather than assuming that a disconnected request stopped the GPU. Failed/canceled renders can be retried as new jobs.

Older output directories are recovered into the render library, and missing video durations are backfilled on startup, including for already-saved legacy records. Browser project JSON carries editable scenes and uploaded keyframe images; its film entries reference this local library and **do not contain the generated media**. Download and share videos separately.

## Manual start

From the repository root, start ComfyUI in one terminal:

```sh
cd .toybox/runtime/ComfyUI
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python main.py \
  --listen 127.0.0.1 --port 8188 --disable-auto-launch \
  --preview-method none --bf16-unet --fp32-vae
```

In another terminal, from the repository root:

```sh
.toybox/runtime/ComfyUI/.venv/bin/python -c 'import sys; from comfy_api_proxy.cli import main; sys.exit(main())' \
  --comfyui http://127.0.0.1:8188 --host 127.0.0.1 --port 8189 \
  --comfyui-base-dir "$PWD/.toybox/runtime/ComfyUI" \
  --state-dir "$PWD/.toybox/runtime/proxy-state"
```

Toybox's server uses `COMFY_BASE_URL=http://127.0.0.1:8189`. No Comfy cloud account or API key is needed for this loopback-only setup. The official SDK reads its base URL from that environment variable.

On first startup, importing the ML packages can take several minutes. The proxy's `/api/v2/health` proves only that the proxy is alive; verify ComfyUI at `/system_stats` as well. A successful job is the actual rendering check.

## Starter workflow

The workflow uses ComfyUI core nodes: checkpoint and T5 loaders, positive/negative text encoders, `LTXVImgToVideo` for the opening keyframe, two `LTXVAddGuide` nodes for the middle and final keyframes, LTX frame-rate conditioning, the distilled eight-step sigma schedule, Euler sampling, `LTXVCropGuides`, VAE decoding, and H.264 MP4 export.

| Binding | Node input |
| --- | --- |
| Starting frame | `5.image` |
| Middle keyframe | `14.image`, guide `15` at half the clip (strength 0.7) |
| Final keyframe | `16.image`, guide `17` on the last frame (strength 0.85) |
| Scene prompt | `3.text` |
| Seed | `10.noise_seed` |
| Frame count | `6.length`, with `8n + 1` frames |
| Conditioning frame rate | `7.frame_rate`, 24 fps |
| Export frame rate | `12.fps`, 24 fps |
| Video output | Node `13` |

Use short, low-resolution drafts first. Rendering performance depends on the GPU, active applications, frame count, and resolution. Model loading can temporarily use substantial unified memory.

## Verification

The live local API v2 service successfully submitted and completed a core-node video smoke test, returning a downloadable H.264 MP4. This checks proxy submission, ComfyUI execution, output indexing, and video encoding without model inference.

The real LTX inference test also passed through the official TypeScript SDK: it uploaded `public/images/lunar-delivery.webp`, submitted the API graph, polled its job, and downloaded the video. On this Apple M5 Max, the 384 × 256 / 25-frame test executed in 11.70 seconds in ComfyUI (20.06 seconds including SDK polling). The H.264 MP4 decoded to 25 frames at 24 fps and was visually inspected. Both downloaded model files matched the SHA-256 values above.

The bundled 512 × 320 / 49-frame draft also passed: 6.58 seconds execution with models already loaded (6.95 seconds including SDK round trip), 49 decoded H.264 frames at 24 fps. These are one-machine measurements, not a general speed guarantee.

Local evidence: `.toybox/runtime/ltx-test-result.json`, `.toybox/runtime/ltx-verified.mp4`, and `.toybox/runtime/installed-runtime.json`. These generated files stay out of source control.


## Version 0.2 application verification

The October 17, 2026 continuation verified three actual local render outputs, including mobile batch submission, and a real 4.541667-second film assembled from completed clips. The complete automated suite passed 50 tests across project persistence, imports, film edits, SDK recovery, cancellation, real video assembly, and production serving. Current browser checks and output evidence are recorded in [VERIFICATION.md](./VERIFICATION.md).

These tests confirm the local workflow and file handling. Keyframe guidance was added on October 19, 2026; see the starter workflow section above.
