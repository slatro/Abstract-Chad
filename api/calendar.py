import csv
import io
import json
import re
from concurrent.futures import ThreadPoolExecutor
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


def fetch_bytes(url: str, timeout: int = 25) -> bytes:
    req = Request(
        url,
        headers={
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "referer": "https://abscan.org/",
        },
    )
    with urlopen(req, timeout=timeout) as res:
        return res.read()


def fetch_text(url: str, timeout: int = 25) -> str:
    return fetch_bytes(url, timeout).decode("utf-8", errors="ignore")


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


def try_csv_export(wallet: str, cutoff: datetime) -> dict | None:
    """
    Try abscan's CSV export endpoint which returns all transactions at once.
    Returns dailyCounts dict on success, None on failure.
    """
    try:
        url = f"https://abscan.org/exportData?type=address&a={quote(wallet)}&startdate=2024-01-01&enddate=2099-12-31"
        raw = fetch_bytes(url, timeout=20)
        text = raw.decode("utf-8", errors="ignore")

        # Must look like a CSV (has commas and newlines)
        if "," not in text or "\n" not in text:
            return None

        counts = {}
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            # Column names vary; try common ones
            date_str = (
                row.get("DateTime (UTC)")
                or row.get("DateTime")
                or row.get("Date")
                or row.get("Timestamp")
                or ""
            ).strip().strip('"')
            if not date_str:
                continue
            try:
                # Parse "2024-05-01 12:34:56" or "2024-05-01T12:34:56"
                dt = datetime.fromisoformat(date_str.replace(" ", "T")).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if dt < cutoff:
                continue
            key = dt.strftime("%Y-%m-%d")
            counts[key] = counts.get(key, 0) + 1

        return counts if counts else None
    except Exception:
        return None


def process_rows(rows, normalized_wallet, cutoff, counts):
    """Returns True if ALL rows on this page are older than cutoff."""
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
        return fetch_text(url, timeout=20)
    except Exception:
        return ""


def fetch_calendar(wallet: str):
    normalized_wallet = wallet.lower()
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=179)

    # ── Strategy 1: CSV export (single request, fastest) ──────────────────────
    csv_counts = try_csv_export(wallet, cutoff)
    if csv_counts is not None:
        return {
            "wallet": wallet,
            "source": "abscan-csv",
            "status": "ready",
            "totalTxCount": None,
            "dailyCounts": csv_counts,
        }

    # ── Strategy 2: HTML scraping with parallel batch fetching ─────────────────
    first_page_html = fetch_text(f"https://abscan.org/txs?a={quote(wallet)}")
    total_pages = extract_total_pages(first_page_html)
    total_tx_count = extract_total_tx_count(first_page_html)
    max_pages = min(total_pages, 40)
    counts: dict = {}
    BATCH_SIZE = 8

    page1_rows = extract_rows(first_page_html)
    if not page1_rows or process_rows(page1_rows, normalized_wallet, cutoff, counts):
        return {
            "wallet": wallet,
            "source": "abscan",
            "status": "ready",
            "totalTxCount": total_tx_count,
            "dailyCounts": counts,
        }

    for batch_start in range(2, max_pages + 1, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE - 1, max_pages)
        urls = [
            f"https://abscan.org/txs?a={quote(wallet)}&p={p}"
            for p in range(batch_start, batch_end + 1)
        ]

        with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
            html_results = list(executor.map(fetch_page_safe, urls))

        batch_all_old = True
        for html in html_results:
            if not html:
                continue
            rows = extract_rows(html)
            if not rows:
                continue
            if not process_rows(rows, normalized_wallet, cutoff, counts):
                batch_all_old = False

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
