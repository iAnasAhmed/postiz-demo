# Kiln Social: Postiz demo

A standalone demo that writes, schedules and publishes a social post through a **self-hosted Postiz**.

- Pick a coffee and an angle (launch, brew tip, restock); the post is drafted for you and stays editable, with Bluesky's 300-character limit.
- Publish right away or schedule it two minutes out. Postiz queues it and its worker publishes it on time.
- A live queue shows each post as **Scheduled → Published** (or Failed), with a link to the published post.
- The Postiz API key stays on the server (`/api/channels`, `/api/draft`, `/api/posts`); input is validated and rate-limited.

## Run

1. Run Postiz locally: Postgres, Redis and a Temporal dev server, plus the Postiz backend, orchestrator and frontend.
2. In Postiz, connect a Bluesky channel (handle plus an app password), then copy the key from **Settings → Public API**.
3. Copy `.env.example` to `.env.local` and fill in the key.
4. `npm install` then `npm run dev`. Open http://127.0.0.1:5182.

Demo only: posts are real and public on the connected account, so use a test account.
