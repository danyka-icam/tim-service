# Telegram event worker

This Worker receives conversion events from the static GitHub Pages site and sends them to Telegram without exposing the bot token in browser code.

## Required secrets

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Never place either value in `page-config.json`, JavaScript, Git commits, screenshots, or public messages.

## Deploy

```sh
cd worker
npx wrangler deploy
```

After deployment, set `events_endpoint` in `/page-config.json` to the Worker URL ending in `/events`.

`NOTIFY_FLYER_VISITS` controls first-per-session Telegram notifications for QR visits. `NOTIFY_SESSION_SUMMARIES` controls end-of-visit summaries. Form submissions and contact clicks are always notified when the endpoint is configured.
