import type { Request, Response } from 'express';
import fs from 'node:fs/promises';
import { env } from '../../config/env.js';
import { SITEMAP_FILE, buildSitemap } from './sitemap.service.js';

/** Serves the worker-generated sitemap; builds it on the fly if the worker has not run yet. */
export async function sitemap(_req: Request, res: Response) {
  let xml: string;
  try {
    const stat = await fs.stat(SITEMAP_FILE);
    xml = Date.now() - stat.mtimeMs < 2 * 60 * 60_000 ? await fs.readFile(SITEMAP_FILE, 'utf8') : await buildSitemap();
  } catch {
    xml = await buildSitemap();
  }
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
}

export function robots(_req: Request, res: Response) {
  const lines =
    env.NODE_ENV === 'production'
      ? [
          'User-agent: *',
          'Disallow: /admin',
          'Disallow: /account',
          'Disallow: /cart',
          'Disallow: /checkout',
          'Disallow: /api/',
          'Disallow: /payments/',
          'Disallow: /book/confirmation/',
          '',
          `Sitemap: ${env.APP_URL}/sitemap.xml`,
        ]
      : ['User-agent: *', 'Disallow: /'];
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(`${lines.join('\n')}\n`);
}
