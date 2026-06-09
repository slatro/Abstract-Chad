import json
import re
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen


WALLET_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
ROW_RE = re.compile(
    r"<tr>\s*<td><button[\s\S]*?<td class='showDate[^>]*><span[^>]*>(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})</span></td>[\s\S]*?data-highlight-target=\"(0x[a-fA-F0-9]{40})\"[\s\S]*?<td class=\"text-center\">[\s\S]*?data-highlight-target=\"(0x[a-fA-F0-9]{40})\"",
    re.MULTILINE,
)


def fetch_text(url: str) -> str:
    req = Request(
        url,
        headers={
            "user-agent": "Mozilla/5.0",
            "accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(req, timeout=25) as res:
        return res.read().decode("utf-8", errors="ignore")


def extract_total_pages(html: str) -> int:
    match = re.search(r"Page\s+1\s+of\s+(\d+)", html, re.IGNORECASE)
    return int(match.group(1)) if match else 1


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


def fetch_calendar(wallet: str):
    normalized_wallet = wallet.lower()
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=364)

    first_page_html = fetch_text(f"https://abscan.org/txs?a={quote(wallet)}")
    total_pages = extract_total_pages(first_page_html)
    max_pages = min(total_pages, 40)
    counts = {}

    for page in range(1, max_pages + 1):
        html = first_page_html if page == 1 else fetch_text(f"https://abscan.org/txs?a={quote(wallet)}&p={page}")
        rows = extract_rows(html)
        if not rows:
            break

        page_has_recent = False
        for row in rows:
            try:
                tx_date = datetime.strptime(row["dateText"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                continue

            if tx_date < cutoff:
                continue

            page_has_recent = True
            is_wallet_out = row["from"].lower() == normalized_wallet
            is_wallet_in = row["to"].lower() == normalized_wallet
            if not is_wallet_out and not is_wallet_in:
                continue

            key = row["dateText"][:10]
            counts[key] = counts.get(key, 0) + 1

        if not page_has_recent:
            break

    return {
        "wallet": wallet,
        "source": "abscan",
        "status": "ready",
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
