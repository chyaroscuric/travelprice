# Travel price checker

Compares FlixBus and Ryanair prices for a trip and re-checks them once a day. Deployed on Cloudflare as a Worker with static assets (the Pages layout also works).

## Layout

- `public/`: static UI (`index.html`, `style.css`, `app.js`). No framework, no build step.
- `functions/api/[[path]].js`: one Pages Function that proxies the FlixBus and Ryanair APIs (browsers can't call them directly because of CORS). It is stateless.
- `worker.js` + `wrangler.jsonc`: entry point when deployed as a Worker with static assets (the live setup). It sends `/api/*` to the same function. A Worker deploy ignores `functions/` unless the file is imported here.
- `server.js`: zero-dependency local dev server that serves `public/` and runs the same function. Start it with `npm run dev` (http://localhost:8788).

## Privacy rule

Never put personal data in the repo. That covers home town, trip dates, routes and names, in code defaults, docs, tests, examples and commit messages. User settings and price history live only in the browser's cookies (`tp_cfg`, `tp_hist`), and the function must stay stateless.

## Upstream APIs (unofficial, may change)

- FlixBus: `global.api.flixbus.com/search/autocomplete/cities` and `/search/service/v4/search`. Cities are UUIDs, the date format is `DD.MM.YYYY`, and `price.total_with_platform_fee` is the total for all passengers.
- Ryanair: `www.ryanair.com/api/farfnd/v4/oneWayFares` returns the cheapest Basic fare per day (`adultPaxCount` makes it a total for all passengers). `/api/views/locate/5/airports/en/active` lists airports.
- Ryanair's `booking/v4/availability` and its bag prices sit behind bot protection. Don't try to work around it; bag prices are entered by the user.

## UI/Design Rules

These apply to all UI work in this codebase.

- **No default gradients.** Only use a gradient where one was explicitly asked for, or where the existing design system already uses one in that same context. Flat colors everywhere else: no gradients on buttons, backgrounds, text or borders just to look "more polished".
- **No decorative background shapes.** No blurred blobs, floating boxes, glow effects, dot-grid patterns, or any background filler that isn't functional content.
- **No unnecessary icons.** Keep an icon only if it replaces text the user needs to act on quickly (close, delete, back). Remove icons that are purely decorative or duplicate an adjacent label.
- **No drop shadows or glassmorphism** unless already used elsewhere in the app. Don't add elevation effects to justify a "modern" look.
- **Match the existing design system exactly.** Reuse the color palette, font sizes, spacing scale, border radius and button styles below. Don't introduce new colors, fonts or component styles. If a value isn't defined, use the closest existing token rather than inventing one.
- **One primary action per screen/section.** Every other action is secondary or tertiary and styled that way. No more than one filled (`.btn-primary`) button visible at a time in the same view.
- **Consistent action placement.** Buttons, links and controls follow the same alignment and grouping pattern everywhere, not ad-hoc per screen.
- **Reduce visual density.** Group related fields and content with whitespace, not borders or background-color blocks. Remove redundant labels, badges or containers that don't add information.
- **Before any UI change:** read `public/style.css` and the existing markup, and reuse their actual colors, spacing and component patterns.

### Design system (source of truth: `public/style.css`)

- **Colors** (CSS variables, with dark-mode values under `prefers-color-scheme: dark`): `--bg`, `--text`, `--muted` (secondary text), `--line` (input/secondary-button borders only), `--accent` (primary button, links), `--accent-text`, `--up` (price increase, errors), `--down` (price decrease).
- **Font:** `--font` (system UI stack). Sizes: `--fs-sm` 13px (secondary text), `--fs` 15px (body, h2), `--fs-lg` 20px (h1, icon buttons).
- **Spacing scale:** `--s1` 4px, `--s2` 8px, `--s3` 16px, `--s4` 24px, `--s5` 40px. Separate sections with `--s5` whitespace, never with borders or background blocks.
- **Radius:** `--radius` 6px for buttons and inputs.
- **Buttons:**
  - `.btn.btn-primary`: filled accent, one per view.
  - `.btn`: secondary, transparent with a `--line` border.
  - `.link`: tertiary, accent text only.
  - `.icon-btn`: muted glyph, only for remove/close actions, always with `aria-label`.
- **Action placement:** each view ends with `.actions`, a left-aligned row. The primary button comes first, then secondary/tertiary actions, then muted status text.
- **Text styles:** `.muted` for secondary info, `.up` / `.down` for price changes (always paired with a `+` / `−` sign, never color alone), `.price` for tabular numbers.
- **Layout:** single column, `max-width: 640px`, 16px side padding, must work at phone width.
