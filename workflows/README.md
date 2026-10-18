# LTX image-to-video starter

`ltx-keyframes.api.json` is a runnable, inference-tested ComfyUI API graph using core nodes only. Its matching mappings are in `ltx-keyframes.bindings.json`. `npm run setup:local -- --start` initializes the studio with these files when no workflow is already configured.

Required model files:

| Model | ComfyUI location |
| --- | --- |
| `ltxv-2b-0.9.8-distilled.safetensors` | `models/checkpoints/` |
| `t5xxl_fp16.safetensors` | `models/text_encoders/` |

The graph encodes the opening keyframe with `LTXVImgToVideo`, adds the middle and final keyframes as `LTXVAddGuide` guide frames, samples LTX with the distilled eight-step schedule, crops the guide latents with `LTXVCropGuides`, and saves H.264 MP4. Defaults: 512×320, 24 FPS. The T5 text encoder runs on CPU.

### Keyframe bindings

`keyframes` maps guide images after the opening frame. Each entry names its `LoadImage` widget, a `position` in the clip (after 0, up to 1), an optional `frame` widget that Toybox sets to `round(position × (frames − 1))`, and an optional `bypass`. When a render has no image for a guide, the bypass removes the guide node and connects each consumer of output *N* to the input named by `bypass.outputs[N]`; the unused `LoadImage` node is removed too. Guides without a bypass require an image.

```json
{"nodeId": "16", "input": "image", "position": 1,
 "frame": {"nodeId": "17", "input": "frame_idx"},
 "bypass": {"nodeId": "17", "outputs": ["positive", "negative", "latent"]}}
```

`/api/health` reports the configured guide positions as `keyframeGuides`, and the studio captures each one from the 3D stage at that moment of the shot.

The duration binding converts studio seconds to the nearest `8n+1` frames at 24 FPS. Thus 2 seconds produces 49 frames (~2.04 seconds) and 6 seconds produces 145 frames (~6.04 seconds). The submitted response reports the resulting duration. Longer clips need more memory and execution time.

Verified October 16, 2026 on Apple M5 Max/MPS, 128 GB unified memory, ComfyUI revision `bdc63e72f5ab29fde448c161db3057827148c0ef`, API proxy 0.1.6, and TypeScript SDK 0.5.0. The exact 512×320/49-frame graph produced a 688,474-byte MP4 with 49 decoded frames in 6.58 seconds of warm engine execution. This timing is an observation on this machine, not a performance guarantee. A separate 384×256/25-frame render also succeeded. See [the runtime verification record](../docs/LOCAL-RUNTIME.md) for model sources, hashes, licenses, startup flags, and output evidence.

The workflow is a starting point for animating staged compositions. It does not guarantee object identity, exact motion paths, or toy-to-photorealistic transformation. Iterate on the image, prompt, model, and graph to achieve those effects. Import another tested API workflow in the studio to switch models.

`bindings.example.json` is a mapping illustration for other graphs; its node IDs are placeholders and it is not executable.
