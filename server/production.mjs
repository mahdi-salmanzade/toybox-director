import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const inside = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);

// Serve only the build directory. Resolve symlinks before sending a file so a
// misplaced link in dist cannot make source code or local credentials public.
export function productionFiles(directory) {
  return async (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(404).type('text').send('Not found.');
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch { return res.status(400).type('text').send('Invalid URL.'); }
    const segments = pathname.split('/');
    if (pathname.includes('\\') || pathname.includes('\0') || segments.some((segment) => segment.startsWith('.'))) return res.status(404).type('text').send('Not found.');
    let root;
    try { root = await realpath(directory); } catch (error) {
      if (error.code === 'ENOENT') return res.status(503).type('text').send('The studio build is missing. Run npm run build, then open Toybox again.');
      return next(error);
    }
    const send = async (relative) => {
      const candidate = path.resolve(root, relative);
      if (!inside(root, candidate)) return false;
      let file;
      try { file = await realpath(candidate); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
      if (!inside(root, file) || !(await stat(file)).isFile()) return false;
      const immutable = /^assets\/.+-[\w-]{8,}\.(?:js|css)$/.test(relative);
      res.setHeader('Cache-Control', relative === 'index.html' ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      res.sendFile(file, { dotfiles: 'deny' }, (error) => { if (error) next(error); });
      return true;
    };
    try {
      if (pathname !== '/' && await send(pathname.replace(/^\/+/, ''))) return;
      // Missing assets should stay 404 instead of receiving HTML with a 200.
      const route = pathname === '/' || (!path.extname(pathname) && !['assets', 'images', 'fonts'].includes(segments[1]));
      if (route && req.accepts('html') && await send('index.html')) return;
      res.status(404).type('text').send('Not found.');
    } catch (error) { next(error); }
  };
}
