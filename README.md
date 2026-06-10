# Abstract Chad

Abstract Chad is a local-first web app that scans an `AGW` wallet address and an `X` handle, then turns on-chain activity, Portal tier, Discord role, and `@AbstractChain` social mentions into a shareable score card.

## Features

- Shareable `Abstract Chad Score` card
- Real `@AbstractChain` mention search
- Multi-account scraper pool (`primary + fallback`)
- `Abscan`-based activity calendar
- PNG export
- Ready-to-share X post copy

## Stack

- `index.html` / `styles.css` / `app.js`
- `server.js` for the local API + static server
- `backend/server.js` for separate Railway/Render deployment
- Python `twscrape` for social search
- `Abscan` HTML parsing for wallet activity calendar

## Setup

### 1. Install Python dependency

```bash
python3 -m venv .venv312
source .venv312/bin/activate
pip install -r requirements.txt
```

### 2. Configure env variables

Copy `.env.example` and create a `.env` file:

```bash
cp .env.example .env
```

Required fields:

- `X_SCRAPER_USERNAME_1`
- `X_AUTH_TOKEN_1`
- `X_CT0_1`

Optional secondary fallback account:

- `X_SCRAPER_USERNAME_2`
- `X_AUTH_TOKEN_2`
- `X_CT0_2`

## Run Locally

```bash
node server.js
```

Then open:

```bash
http://127.0.0.1:4176
```

## Deploy Split Setup

Recommended production split:

- `Vercel` for the static frontend
- `Railway` / `Render` / `Fly.io` for the scraper + calendar backend

### Frontend

The frontend reads `window.__ABSTRACT_CHAD_API_BASE__` from [api-config.js](/Users/emreoktem/Documents/Codex/2026-06-08/kral-senin-kotan-dolunca-ben-dosyay/api-config.js).

For local same-origin usage it can stay empty:

```js
window.__ABSTRACT_CHAD_API_BASE__ = "";
```

For production, point it at the backend origin:

```js
window.__ABSTRACT_CHAD_API_BASE__ = "https://your-backend.up.railway.app";
```

### Backend

Deploy the [backend](/Users/emreoktem/Documents/Codex/2026-06-08/kral-senin-kotan-dolunca-ben-dosyay/backend) folder as a Node service.

Start command:

```bash
node server.js
```

Required backend env vars:

- `X_SCRAPER_USERNAME_1`
- `X_AUTH_TOKEN_1`
- `X_CT0_1`
- optional fallback:
  - `X_SCRAPER_USERNAME_2`
  - `X_AUTH_TOKEN_2`
  - `X_CT0_2`
- optional:
  - `X_SEARCH_LIMIT`

## Social Logic

The social query runs in this form:

```text
from:<handle> @AbstractChain -filter:replies -filter:nativeretweets
```

Flow:

1. Check cache first
2. Try a live query through the scraper account pool
3. If the primary account fails, fall back to the secondary account
4. If both fail, return stale cached data when available

## On-Chain Logic

- Mainnet / testnet nonce
- AGW contract detection
- PENGU balance
- Activity calendar built from `Abscan` transaction history

## File Map

- `index.html`: app structure
- `styles.css`: UI and export styling
- `app.js`: scoring logic, rendering, export, and share flow
- `server.js`: local API
- `work/social-provider.js`: twscrape search provider
- `work/twscrape_mentions.py`: mention search script

## Notes

- `.env`, `accounts.db`, local caches, and `outputs/` are not committed to git.
- In production, the frontend can live on `Vercel`, while the scraper backend is more reliable on a persistent server environment such as `Railway`, `Render`, or `Fly`.
