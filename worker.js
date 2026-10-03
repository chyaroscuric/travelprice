// Entry point when deployed as a Cloudflare Worker with static assets (wrangler.jsonc).
// Static files in public/ are served directly; anything else lands here.
import { onRequestGet } from './functions/api/[[path]].js';

export default {
  async fetch(request, env) {
    if (request.method === 'GET' && new URL(request.url).pathname.startsWith('/api/')) {
      return onRequestGet({ request });
    }
    return env.ASSETS.fetch(request);
  },
};
