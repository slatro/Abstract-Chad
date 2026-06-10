import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen


WALLET_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
TOTAL_TX_RE = re.compile(r"Latest\s+\d+\s+from a total of\s+([\d,]+)\s+transactions", re.IGNORECASE)
ROW_RE = re.compile(
    r"<tr>\s*<td><button[\s\S]*?<td class='showDate[^>]*><span[^>]*>(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})</span></td>[\s\S]*?data-highlight-target=\"(0x[a-fA-F0-9]{40})\"[\s\S]*?<td class=\"text-center\">[\s\S]*?data-highlight-target=\"(0x[a-fA-F0-9]{40})\"",
    re.MULTILINE,
)


def fetch_text(url: str) -> str:
    req = Request(
        url,
        headers={
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "referer": "https://abscan.org/",
        },
    )
    with urlopen(req, timeout=25) as res:
        return res.read().decode("utf-8", errors="ignore")


def extract_total_pages(html: str) -> int:
    match = re.search(r"Page\s+1\s+of\s+(\d+)", html, re.IGNORECASE)
    return int(match.group(1)) if match else 1


def extract_total_tx_count(html: str):
    match = TOTAL_TX_RE.search(html)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def extract_rows(html: str):
    rows = []
    for match in ROW_RE.finditer(html):
        rows.append(
            {
                "dateText": match.group(1),
                "from": match.group(2),
                "to": match.group(3),
            }
        )
    return rows


def process_rows(rows, normalized_wallet, cutoff, counts):
    """Process a page's rows. Returns True if ALL rows on this page are older than cutoff."""
    all_old = len(rows) > 0
    for row in rows:
        try:
            tx_date = datetime.strptime(row["dateText"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if tx_date >= cutoff:
            all_old = False
            is_wallet_out = row["from"].lower() == normalized_wallet
            is_wallet_in = row["to"].lower() == normalized_wallet
            if not is_wallet_out and not is_wallet_in:
                continue
            key = row["dateText"][:10]
            counts[key] = counts.get(key, 0) + 1
    return all_old


def fetch_page_safe(url):
    try:
        return fetch_text(url)
    except Exception:
        return ""


def fetch_calendar(wallet: str):
    normalized_wallet = wallet.lower()
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=179)

    first_page_html = fetch_text(f"https://abscan.org/txs?a={quote(wallet)}")
    total_pages = extract_total_pages(first_page_html)
    total_tx_count = extract_total_tx_count(first_page_html)
    max_pages = min(total_pages, 40)
    counts = {}
    BATCH_SIZE = 8

    # Process page 1 first (already fetched)
    page1_rows = extract_rows(first_page_html)
    if not page1_rows or process_rows(page1_rows, normalized_wallet, cutoff, counts):
        return {"wallet": wallet, "source": "abscan", "status": "ready",
                "totalTxCount": total_tx_count, "dailyCounts": counts}

    # Fetch remaining pages in parallel batches
    for batch_start in range(2, max_pages + 1, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE - 1, max_pages)
        page_numbers = list(range(batch_start, batch_end + 1))
        urls = [f"https://abscan.org/txs?a={quote(wallet)}&p={p}" for p in page_numbers]

        with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
            html_results = list(executor.map(fetch_page_safe, urls))

        batch_all_old = True
        for html in html_results:
            if not html:
                continue
            rows = extract_rows(html)
            if not rows:
                continue
            page_all_old = process_rows(rows, normalized_wallet, cutoff, counts)
            if not page_all_old:
                batch_all_old = False

        # Stop only when every page in this batch was entirely older than cutoff
        if batch_all_old:
            break

    return {
        "wallet": wallet,
        "source": "abscan",
        "status": "ready",
        "totalTxCount": total_tx_count,
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
            return self._send_json(
                200,
                {
                    "wallet": wallet,
                    "source": "abscan",
                    "status": "unavailable",
                    "warning": str(exc) or "Calendar provider failed",
                    "totalTxCount": None,
                    "dailyCounts": {},
                },
            )

    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
