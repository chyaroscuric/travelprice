# Travel prices

Compares FlixBus and Ryanair prices for your trip and tracks changes over time. Your settings and price history are stored in cookies in your browser, never in this repo or on the server.

## Run locally

```sh
npm run dev
```

Open http://localhost:8788. Requires Node 18+, with no dependencies to install.

## Deploy to Cloudflare

It deploys as a Worker with static assets (`wrangler.jsonc` + `worker.js`), which is what Cloudflare's default "Create" flow sets up.

- **Git:** connect the repo in Workers & Pages. Each push runs `npx wrangler deploy`. The `name` in `wrangler.jsonc` must match the Worker's name in the dashboard.
- **CLI:** run `npm run deploy` (it asks you to log in the first time).

It also works as a Pages project: build output directory `public`, with `functions/` picked up automatically.

## How the daily check works

Prices are checked every time you open the page, and again every 24 hours while the tab stays open (with an optional browser notification when a price goes up). Each route keeps one history entry per day the price changed.

Nothing runs while the page is closed. Background checks would need a scheduled Worker plus your routes stored on the server, which this app avoids on purpose.

## Notes

- Ryanair prices are the cheapest Basic fare for that day. Bag add-ons (Priority & 2 cabin bags, 10 kg / 20 kg check-in) can be added per route as a quantity and a price each, per flight, so two people can share one bag. Ryanair only shows bag prices during booking, so you enter them yourself.
- Both APIs are unofficial and can change or block requests without notice.
