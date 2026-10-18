import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, copyFile, chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.toybox', 'runtime');
const comfy = path.join(runtime, 'ComfyUI');
const venv = path.join(comfy, '.venv');
const bin = path.join(venv, process.platform === 'win32' ? 'Scripts' : 'bin');
const python = path.join(bin, process.platform === 'win32' ? 'python.exe' : 'python');
const proxy = path.join(bin, process.platform === 'win32' ? 'comfy-api-proxy.exe' : 'comfy-api-proxy');
const args = new Set(process.argv.slice(2));
const COMFY_REVISION = 'bdc63e72f5ab29fde448c161db3057827148c0ef';
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
const hasUv = spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0;

async function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, { stdio: 'inherit', cwd: root, ...options });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

async function probe(url) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); return response.ok; } catch { return false; }
}

async function environment() {
  const destination = path.join(root, '.env');
  if (!(await exists(destination))) {
    await copyFile(path.join(root, '.env.example'), destination);
    await chmod(destination, 0o600);
    console.log('Created .env for the local Comfy API proxy.');
  }
  const saved = path.join(root, '.toybox', 'workflow.json');
  const graphPath = path.join(root, 'workflows', 'ltx-keyframes.api.json');
  const bindingsPath = path.join(root, 'workflows', 'ltx-keyframes.bindings.json');
  if (!(await exists(saved)) && await exists(graphPath) && await exists(bindingsPath)) {
    const workflow = JSON.parse(await readFile(graphPath, 'utf8'));
    const bindings = JSON.parse(await readFile(bindingsPath, 'utf8'));
    await writeFile(saved, JSON.stringify({ workflow, bindings }, null, 2), { mode: 0o600 });
    console.log('Configured the bundled LTX image-to-video workflow. Its models must be installed.');
  }
}

async function status() {
  const [ui, api] = await Promise.all([probe('http://127.0.0.1:8188/system_stats'), probe('http://127.0.0.1:8189/api/v2/jobs?limit=1')]);
  console.log(`ComfyUI : ${ui ? 'running at http://127.0.0.1:8188' : 'not reachable on port 8188'}`);
  console.log(`API v2  : ${api ? 'running at http://127.0.0.1:8189' : 'not reachable on port 8189'}`);
  console.log(`Runtime : ${comfy}`);
  return { ui, api };
}

async function start() {
  if (!(await exists(python)) || !(await exists(proxy))) throw new Error('Run npm run setup:local first to install the local runtime.');
  await environment();
  const running = await status();
  const children = [];
  const launch = (command, launchArgs, options = {}) => {
    const child = spawn(command, launchArgs, { cwd: comfy, stdio: 'inherit', ...options });
    children.push(child);
    child.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
    child.once('exit', (code) => { if (code && code !== 0) console.error(`${path.basename(command)} stopped (${code}).`); });
  };
  if (!running.ui) {
    const flags = ['main.py', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch', '--preview-method', 'none'];
    // Let Comfy select the model's supported UNet dtype (LTX supports BF16/FP32,
    // not FP16). Full-precision VAE avoids common Apple Silicon decode issues.
    if (process.platform === 'darwin' && process.arch === 'arm64') flags.push('--fp32-vae');
    if (args.has('--cpu')) flags.push('--cpu');
    launch(python, flags, { env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } });
  }
  if (!running.api) {
    // Run the proxy module through the venv interpreter: pip's console-script
    // shebang keeps an absolute path that breaks if the project folder moves.
    launch(python, ['-c', 'import sys; from comfy_api_proxy.cli import main; sys.exit(main())', '--comfyui', 'http://127.0.0.1:8188', '--host', '127.0.0.1', '--port', '8189', '--comfyui-base-dir', comfy, '--state-dir', path.join(runtime, 'proxy-state')]);
  }
  console.log('Start the studio in another terminal: npm run dev');
  console.log('Model installation and verified settings: docs/LOCAL-RUNTIME.md');
  if (!children.length) return;
  const stop = () => { for (const child of children) child.kill('SIGTERM'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))));
}

async function setup() {
  await mkdir(runtime, { recursive: true });
  if (!(await exists(path.join(comfy, 'main.py')))) {
    await run('git', ['clone', '--depth', '1', 'https://github.com/Comfy-Org/ComfyUI.git', comfy]);
    await run('git', ['-C', comfy, 'fetch', '--depth', '1', 'origin', COMFY_REVISION]);
    await run('git', ['-C', comfy, 'checkout', '--detach', COMFY_REVISION]);
  } else console.log('Using existing ComfyUI checkout; no source files are reset.');
  if (!(await exists(python))) {
    if (hasUv) await run('uv', ['venv', '--python', '3.13', venv]);
    else await run(process.env.TOYBOX_PYTHON || 'python3', ['-m', 'venv', venv]);
  }
  if (hasUv) {
    await run('uv', ['pip', 'install', '--python', python, '-r', path.join(comfy, 'requirements.txt'), 'comfy-api-proxy==0.1.6']);
  } else {
    await run(python, ['-m', 'pip', 'install', '-r', path.join(comfy, 'requirements.txt'), 'comfy-api-proxy==0.1.6']);
  }
  await environment();
  console.log('\nLocal runtime installed. Model weights are a separate download; see docs/LOCAL-RUNTIME.md.');
  console.log('Start it with: npm run setup:local -- --start');
}

try {
  if (args.has('--help')) console.log('npm run setup:local                 Install isolated ComfyUI + API proxy\nnpm run setup:local -- --start       Run local services (Ctrl-C stops services started here)\nnpm run setup:local -- --status      Check local services\nAdd --cpu to --start for CPU execution. Model weights are not downloaded by this script.');
  else if (args.has('--status')) await status();
  else if (args.has('--start')) await start();
  else await setup();
} catch (error) {
  console.error(`Local setup: ${error.message}`);
  process.exitCode = 1;
}
