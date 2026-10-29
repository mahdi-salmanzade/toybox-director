# LTX image-to-video starter

`ltx-keyframes.api.json` is a runnable, inference-tested ComfyUI API graph using core nodes only. Its matching mappings are in `ltx-keyframes.bindings.json`. `npm run setup:local -- --start` initializes the studio with these files when no workflow is already configured.

Required model files:

| Model | ComfyUI location |
| --- | --- |
| `ltxv-2b-0.9.8-distilled.safetensors` | `models/checkpoints/` |
| `t5xxl_fp16.safetensors` | `models/text_encoders/` |

The graph encodes the opening keyframe with `LTXVImgToVideo`, adds later keyframes as chained `LTXVAddGuide` guide frames (the middle and final keyframes plus five spare slots, for up to eight keyframes), samples LTX with the distilled eight-step schedule, crops the guide latents with `LTXVCropGuides`, and saves H.264 MP4. Defaults: 512×320, 24 FPS. The T5 text encoder runs on CPU.

### Keyframe bindings

`keyframes` maps guide images after the opening frame. Each entry names its `LoadImage` widget, a `position` in the clip (after 0, up to 1), an optional `frame` widget that Toybox sets to `round(position × (frames − 1))`, and an optional `bypass`. When a render has no image for a guide, the bypass removes the guide node and connects each consumer of output *N* to the input named by `bypass.outputs[N]`; the unused `LoadImage` node is removed too. Guides without a bypass require an image. An entry with a `frame` widget and a bypass may omit `position`: it is a spare slot, used only when the studio sends that keyframe's position.

```json
{"nodeId": "16", "input": "image", "position": 1,
 "frame": {"nodeId": "17", "input": "frame_idx"},
 "bypass": {"nodeId": "17", "outputs": ["positive", "negative", "latent"]}}
```

`/api/health` reports the configured guide positions as `keyframeGuides` and the number of guides with a `frame` widget as `keyframeSlots`. When a shot's later keyframes fit in `keyframeSlots`, the studio sends a `positions` list (one time per keyframe, evenly spaced) and each guide lands at its keyframe's time; otherwise it captures the fixed `keyframeGuides` positions from the 3D stage.

The duration binding converts studio seconds to the nearest `8n+1` frames at 24 FPS. Thus 2 seconds produces 49 frames (~2.04 seconds) and 6 seconds produces 145 frames (~6.04 seconds). The submitted response reports the resulting duration. Longer clips need more memory and execution time.

Verified October 16, 2026 on Apple M5 Max/MPS, 128 GB unified memory, ComfyUI revision `bdc63e72f5ab29fde448c161db3057827148c0ef`, API proxy 0.1.6, and TypeScript SDK 0.5.0. The exact 512×320/49-frame graph produced a 688,474-byte MP4 with 49 decoded frames in 6.58 seconds of warm engine execution. This timing is an observation on this machine, not a performance guarantee. A separate 384×256/25-frame render also succeeded. See [the runtime verification record](../docs/LOCAL-RUNTIME.md) for model sources, hashes, licenses, startup flags, and output evidence.

The workflow is a starting point for animating staged compositions. It does not guarantee object identity, exact motion paths, or toy-to-photorealistic transformation. Iterate on the image, prompt, model, and graph to achieve those effects. Import another tested API workflow in the studio to switch models.

`bindings.example.json` is a mapping illustration for other graphs; its node IDs are placeholders and it is not executable.

## Qwen-Image-Edit restyle

`qwen-restyle.api.json` powers **Make keyframes real**. It is a core-node ComfyUI graph for Qwen-Image-Edit-2511 with the 4-step Lightning LoRA, following the official ComfyUI template: AuraFlow sampling shift 3.1, `CFGNorm`, and the `index_timestep_zero` reference method, at 4 steps and CFG 1. `ImageScaleToTotalPixels` (1 megapixel, 32-pixel steps) keeps the capture's aspect ratio, so a 1024×640 frame becomes 1280×800 and still lines up as an LTX guide.

The server sets the instruction (node `9`), seed (`14`), stage capture (`7`), and an optional look reference (`17`). The studio restyles every keyframe on its own with the same instruction and seed. In testing, passing a restyled keyframe as the reference made the model copy it, so later keyframes lost their staged motion. The optional reference stays available to other clients; without one, the server removes the reference loader and the `image2` inputs. The required model files are listed in [the runtime guide](../docs/LOCAL-RUNTIME.md#restyle-models-optional).
