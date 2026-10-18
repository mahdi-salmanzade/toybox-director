import { spawn } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { RequestError } from './validation.mjs';
import { isJobId } from './job-store.mjs';

function processRun(executable, args, { signal, timeoutMs = 20_000, progress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '', stderr = '';
    let timeout = false;
    let killTimer;
    const timer = setTimeout(() => { timeout = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-262144); progress?.(String(chunk)); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192); });
    child.once('error', (error) => {
      // AbortSignal sends SIGTERM, but its error arrives before process exit.
      // Wait for close so cancellation means the encoder has actually stopped.
      if (error.name === 'AbortError') { killTimer = setTimeout(() => child.kill('SIGKILL'), 3000); return; }
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (signal?.aborted) return reject(new DOMException('Export canceled.', 'AbortError'));
      if (timeout) return reject(new RequestError(timeoutMs >= 900_000 ? 'Movie export exceeded its 15-minute limit. Try fewer or shorter clips.' : 'Video processing took too long. Try a shorter clip.', 422));
      if (code !== 0) return reject(new RequestError('A video could not be decoded or encoded. Try a different completed clip and check that FFmpeg includes the H.264 encoder.', 422));
      resolve({ stdout, stderr });
    });
  });
}

export function createMovieTools(options = {}) {
  const ffmpeg = options.ffmpeg ?? 'ffmpeg', ffprobe = options.ffprobe ?? 'ffprobe';
  return {
    async available() {
      try { await Promise.all([processRun(ffmpeg, ['-version']), processRun(ffprobe, ['-version'])]); return true; } catch { return false; }
    },
    async probe(file, contentType, { signal } = {}) {
      const format = contentType === 'video/webm' ? 'matroska' : 'mov';
      const { stdout } = await processRun(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', format, '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration:format=duration', '-of', 'json', file], { signal });
      const data = JSON.parse(stdout), stream = data.streams?.[0];
      const duration = Number(stream?.duration ?? data.format?.duration);
      if (!stream || !Number.isFinite(duration) || duration <= 0 || duration > 3600 || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width < 2 || stream.height < 2 || stream.width > 8192 || stream.height > 8192) throw new RequestError('The selected video has no usable duration or dimensions.', 422);
      return { duration, width: stream.width, height: stream.height };
    },
    async assemble(clips, target, { signal, progress } = {}) {
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temporary = target.replace(/\.mp4$/, '.partial.mp4');
      const scale = Math.min(1, 1920 / clips[0].width, 1080 / clips[0].height);
      const width = Math.max(2, Math.floor(clips[0].width * scale / 2) * 2), height = Math.max(2, Math.floor(clips[0].height * scale / 2) * 2);
      const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y'];
      for (const clip of clips) args.push('-protocol_whitelist', 'file,pipe', '-f', clip.contentType === 'video/webm' ? 'matroska' : 'mov', '-ss', String(clip.inPoint), '-t', String(clip.outPoint - clip.inPoint), '-i', clip.file);
      const filters = clips.map((_, i) => `[${i}:v:0]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24,format=yuv420p[v${i}]`);
      filters.push(`${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[out]`);
      args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-movflags', '+faststart', '-progress', 'pipe:1', temporary);
      const duration = clips.reduce((sum, clip) => sum + clip.outPoint - clip.inPoint, 0);
      try {
        await processRun(ffmpeg, args, { signal, timeoutMs: 900_000, progress: (chunk) => {
          const matches = [...chunk.matchAll(/out_time_us=(\d+)/g)];
          if (matches.length) progress?.(Math.min(0.99, Number(matches.at(-1)[1]) / 1_000_000 / duration));
        } });
        const verified = await this.probe(temporary, 'video/mp4', { signal });
        await rename(temporary, target);
        return { ...verified, silent: true };
      } finally { await rm(temporary, { force: true }); }
    },
  };
}

export function validateMovie(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160) throw new RequestError('Give the movie a title of 1–160 characters.');
  if (!Array.isArray(body.clips) || body.clips.length < 1 || body.clips.length > 24) throw new RequestError('Choose between 1 and 24 completed video clips.');
  const clips = body.clips.map((clip) => {
    if (!clip || typeof clip !== 'object' || Array.isArray(clip) || !isJobId(clip.jobId) || Object.keys(clip).some((key) => !['jobId', 'outputIndex', 'inPoint', 'outPoint'].includes(key))) throw new RequestError('Each movie clip must reference a video in your render library.');
    const outputIndex = clip.outputIndex ?? 0, inPoint = clip.inPoint ?? 0;
    if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex > 11 || typeof inPoint !== 'number' || !Number.isFinite(inPoint) || inPoint < 0 || (clip.outPoint !== undefined && (typeof clip.outPoint !== 'number' || !Number.isFinite(clip.outPoint) || clip.outPoint <= inPoint))) throw new RequestError('Clip trim points must be valid seconds, with the end after the start.');
    return { jobId: clip.jobId, outputIndex, inPoint, ...(clip.outPoint !== undefined ? { outPoint: clip.outPoint } : {}) };
  });
  return { title: body.title.trim(), clips };
}
