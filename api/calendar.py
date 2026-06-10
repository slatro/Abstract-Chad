import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen


WALLET_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
ROW_RE = re.compile(
    r"<tr>\s*<td><button[\s\S]*?<td class='showDate[^>]*><span[^>]*>(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})</span></td>[\s\S]*?data-highlight-target=\"(0x[a-fA-F0-9]{40})\"[\s\S]*?<td class=\"text-center\">[\s\S]*?data-highlight-target=\"(0x[a-fA-F0-9]{40})\"",
    re.MULTILINE,
)


def fetch_text(url: str, timeout: int = 8) -> str:
    req = Request(
        url,
        headers={
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "accept": "application/json, text/html, */*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "referer": "https://abscan.org/",
        },
    )
    with urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", errors="ignore")


# ── Strategy 1: Etherscan-compatible JSON API ──────────────────────────────────
def try_etherscan_api(wallet: str, cutoff: datetime) -> dict | None:
    """
    Abscan supports Etherscan-compatible JSON API.
    Returns up to 10,000 txs as JSON in a single fast request.
    """
    try:
        url = (
            f"https://abscan.org/api?module=account&action=txlist"
            f"&address={quote(wallet)}&sort=desc&offset=10000&page=1"
        )
        raw = fetch_text(url, timeout=8)
        data = json.loads(raw)

        # Etherscan API returns status "1" for success
        if str(data.get("status")) != "1":
            return None
        result = data.get("result")
        if not isinstance(result, list) or not result:
            return None

        counts: dict = {}
        for tx in result:
            ts = tx.get("timeStamp")
            if not ts:
                continue
            try:
                tx_date = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            except (ValueError, OSError):
                continue
            if tx_date < cutoff:
                # Results are sorted desc → once we pass cutoff we can stop
                break
            key = tx_date.strftime("%Y-%m-%d")
            counts[key] = counts.get(key, 0) + 1

        return counts if counts else None
    except Exception:
        return None


# ── Strategy 2: Parallel HTML scraping (fallback) ─────────────────────────────
def extract_rows(html: str):
    rows = []
    for match in ROW_RE.finditer(html):
        rows.append({"dateText": match.group(1), "from": match.group(2), "to": match.group(3)})
    return rows


def fetch_page_safe(url):
    try:
        return fetch_text(url, timeout=6)
    except Exception:
        return ""


def process_rows(rows, normalized_wallet, cutoff, counts):
    all_old = len(rows) > 0
    for row in rows:
        try:
            tx_date = datetime.strptime(row["dateText"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if tx_date >= cutoff:
            all_old = False
            if row["from"].lower() == normalized_wallet or row["to"].lower() == normalized_wallet:
                key = row["dateText"][:10]
                counts[key] = counts.get(key, 0) + 1
    return all_old


def try_html_scrape(wallet: str, normalized_wallet: str, cutoff: datetime) -> dict:
    counts: dict = {}
    BATCH_SIZE = 6

    try:
        first_html = fetch_text(f"https://abscan.org/txs?a={quote(wallet)}", timeout=6)
    except Exception:
        return counts

    match = re.search(r"Page\s+1\s+of\s+(\d+)", first_html, re.IGNORECASE)
    total_pages = int(match.group(1)) if match else 1
    max_pages = min(total_pages, 20)

    page1_rows = extract_rows(first_html)
    if not page1_rows or process_rows(page1_rows, normalized_wallet, cutoff, counts):
        return counts

    for batch_start in range(2, max_pages + 1, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE - 1, max_pages)
        urls = [f"https://abscan.org/txs?a={quote(wallet)}&p={p}" for p in range(batch_start, batch_end + 1)]
        with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
            html_results = list(executor.map(fetch_page_safe, urls))

        batch_all_old = True
        for html in html_results:
            if html and extract_rows(html):
                if not process_rows(extract_rows(html), normalized_wallet, cutoff, counts):
                    batch_all_old = False
        if batch_all_old:
            break

    return counts


# ── Main calendar builder ──────────────────────────────────────────────────────
def fetch_calendar(wallet: str):
    normalized_wallet = wallet.lower()
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=179)

    # Strategy 1: Fast JSON API (works within 10s Vercel timeout)
    counts = try_etherscan_api(wallet, cutoff)
    if counts is not None:
        return {
            "wallet": wallet,
            "source": "abscan-api",
            "status": "ready",
            "totalTxCount": None,
            "dailyCounts": counts,
        }

    # Strategy 2: Parallel HTML scraping (slower, may timeout on hobby plan)
    counts = try_html_scrape(wallet, normalized_wallet, cutoff)
    return {
        "wallet": wallet,
        "source": "abscan-html",
        "status": "ready",
        "totalTxCount": None,
        "dailyCounts": counts,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        wallet = (params.get("wallet", [""])[0] or "").strip()

        if not WALLET_RE.match(wallet):
            return self._send_json(400, {"error": "Invalid wallet"})

        try:
            payload = fetch_calendar(wallet)
            return self._send_json(200, payload)
        except Exception as exc:
            return self._send_json(200, {
                "wallet": wallet,
                "source": "abscan",
                "status": "unavailable",
                "warning": str(exc) or "Calendar provider failed",
                "totalTxCount": None,
                "dailyCounts": {},
            })

    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
