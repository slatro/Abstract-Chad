# Abstract Chad

Abstract Chad, bir `AGW` adresi ve `X` handle'i icin on-chain aktivite, Portal tier, Discord role ve `@AbstractChain` mention social sinyalini tarayip paylasilabilir bir skor karti ureten local-first bir web app'tir.

## Neler Var

- Shareable `Abstract Chad Score` karti
- Gercek `@AbstractChain` mention aramasi
- Coklu scraper hesap havuzu (`primary + fallback`)
- `Abscan` tabanli activity calendar
- PNG export
- Hazir X share metni

## Stack

- `index.html` / `styles.css` / `app.js`
- `server.js` ile local API + static server
- Python `twscrape` ile social search
- `Abscan` HTML parse ile wallet activity calendar

## Gerekli Kurulum

### 1. Python bagimliligi

```bash
python3 -m venv .venv312
source .venv312/bin/activate
pip install -r requirements.txt
```

### 2. Env ayari

`.env.example` dosyasini kopyalayip `.env` olustur:

```bash
cp .env.example .env
```

Gerekli alanlar:

- `X_SCRAPER_USERNAME_1`
- `X_AUTH_TOKEN_1`
- `X_CT0_1`

Opsiyonel ikinci fallback hesap:

- `X_SCRAPER_USERNAME_2`
- `X_AUTH_TOKEN_2`
- `X_CT0_2`

## Yerelde Calistirma

```bash
node server.js
```

Sonra:

```bash
http://127.0.0.1:4176
```

## Social Mantigi

Social query su sekilde calisir:

```text
from:<handle> @AbstractChain -filter:replies -filter:nativeretweets
```

Akis:

1. once cache kontrol edilir
2. sonra scraper account pool ile canli sorgu denenir
3. primary fail olursa ikinci hesap kullanilir
4. ikisi de fail olursa cache varsa stale veri doner

## On-Chain Mantigi

- mainnet/testnet nonce
- AGW contract kontrolu
- PENGU balance
- `Abscan` transaction history ile activity calendar

## Dosyalar

- `index.html`: uygulama yapisi
- `styles.css`: UI / export stilleri
- `app.js`: skor mantigi, render, export, share
- `server.js`: local API
- `work/social-provider.js`: twscrape search provider
- `work/twscrape_mentions.py`: mention search script

## Notlar

- `.env`, `accounts.db`, local caches ve `outputs/` git'e dahil edilmez.
- Uretimde frontend `Vercel`de, scraper backend ise daha stabil bir server ortaminda (`Railway`, `Render`, `Fly`) daha saglikli calisir.
