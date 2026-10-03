# Travel prices

Compares FlixBus and Ryanair prices for your trip and tracks changes over time. Your settings and price history are stored in cookies in your browser, never in this repo or on the server.

## Run locally

```sh
npm run dev
```

Open http://localhost:8788. Requires Node 18+, with no dependencies to install.

## Deploy to Cloudflare Pages

**Git:** push this repo, then in Cloudflare go to Workers & Pages → Create → Pages → Connect to Git. Leave the build command empty and set the build output directory to `public`. The `functions/` folder is picked up automatically.

**CLI:** run `npm run deploy` (uses `npx wrangler`; it asks you to log in the first time).

## How the daily check works

Prices are checked every time you open the page, and again every 24 hours while the tab stays open (with an optional browser notification when a price goes up). Each route keeps one history entry per day the price changed.

Nothing runs while the page is closed. Background checks would need a scheduled Worker plus your routes stored on the server, which this app avoids on purpose.

## Notes

- Ryanair prices are the cheapest Basic fare for that day. Bag add-ons (Priority & 2 cabin bags, 10 kg / 20 kg check-in) can be added per route as a quantity and a price each, per flight, so two people can share one bag. Ryanair only shows bag prices during booking, so you enter them yourself.
- Both APIs are unofficial and can change or block requests without notice.
