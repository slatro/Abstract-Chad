import asyncio
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from twscrape import API


def normalize_handle(value: str) -> str:
    return (value or "").strip().lstrip("@").lower()


def build_cookie_string(auth_token: str, ct0: str) -> str:
    auth = (auth_token or "").strip()
    csrf = (ct0 or "").strip()
    if not auth or not csrf:
        return ""
    return f"auth_token={auth}; ct0={csrf}"


def get_scraper_accounts():
    accounts = []

    for index in range(1, 11):
        username = (os.getenv(f"X_SCRAPER_USERNAME_{index}", "") or "").strip()
        cookies = build_cookie_string(
            os.getenv(f"X_AUTH_TOKEN_{index}", ""),
            os.getenv(f"X_CT0_{index}", ""),
        )
        password = (os.getenv(f"X_SCRAPER_PASSWORD_{index}", "") or "").strip()
        email = (os.getenv(f"X_SCRAPER_EMAIL_{index}", "") or "").strip()
        email_password = (os.getenv(f"X_SCRAPER_EMAIL_PASSWORD_{index}", "") or "").strip()

        if not username and not cookies:
            continue

        accounts.append(
            {
                "id": f"account-{index}",
                "username": username or f"scraper_{index}",
                "cookies": cookies,
                "password": password,
                "email": email,
                "email_password": email_password,
            }
        )

    if accounts:
        return accounts

    return [
        {
            "id": "account-1",
            "username": (os.getenv("X_SCRAPER_USERNAME", "side_account") or "").strip(),
            "cookies": build_cookie_string(os.getenv("X_AUTH_TOKEN", ""), os.getenv("X_CT0", "")),
            "password": (os.getenv("X_SCRAPER_PASSWORD", "") or "").strip(),
            "email": (os.getenv("X_SCRAPER_EMAIL", "") or "").strip(),
            "email_password": (os.getenv("X_SCRAPER_EMAIL_PASSWORD", "") or "").strip(),
        }
    ]


def tweet_matches(tweet, target_username: str) -> bool:
    text = (getattr(tweet, "rawContent", "") or "").lower()
    if f"@{target_username}" in text:
        return True

    mentioned_users = getattr(tweet, "mentionedUsers", None) or []
    for user in mentioned_users:
        if getattr(user, "username", "").lower() == target_username:
            return True
    return False


async def run_search(handle: str):
    limit = int((os.getenv("X_SEARCH_LIMIT", "300") or "300").strip())
    accounts = get_scraper_accounts()
    errors = []

    for account in accounts:
        try:
            api = API("/tmp/twscrape_accounts.db")
            await api.pool.add_account(
                account["username"],
                account["password"],
                account["email"],
                account["email_password"],
                cookies=account["cookies"] or None,
            )

            query = f"from:{handle} @AbstractChain -filter:replies -filter:nativeretweets"
            seen = {}
            fetched_count = 0

            async for tweet in api.search(query, limit=limit):
                fetched_count += 1
                if tweet_matches(tweet, "abstractchain"):
                    seen[tweet.id] = tweet

            tweets = list(seen.values())
            likes = sum(getattr(tweet, "likeCount", 0) or 0 for tweet in tweets)
            replies = sum(getattr(tweet, "replyCount", 0) or 0 for tweet in tweets)
            retweets = sum(getattr(tweet, "retweetCount", 0) or 0 for tweet in tweets)
            quotes = sum(getattr(tweet, "quoteCount", 0) or 0 for tweet in tweets)
            views = sum(int(getattr(tweet, "viewCount", 0) or 0) for tweet in tweets)

            if fetched_count == 0 and not tweets:
                raise RuntimeError("Search returned no results")

            return {
                "handle": f"@{handle}",
                "query": query,
                "source": "twscrape-search",
                "providerMode": "pool" if len(accounts) > 1 else "single",
                "providerAccount": account["id"],
                "providerUsername": account["username"],
                "status": "ready",
                "delivery": "live",
                "recentAbstractTweetCount": len(tweets),
                "recentAbstractLikes": likes,
                "recentAbstractReplies": replies,
                "recentAbstractRetweets": retweets,
                "recentAbstractQuotes": quotes,
                "recentAbstractViews": views,
                "recentAbstractEngagement": likes + replies + retweets + quotes,
                "fetchedCount": fetched_count,
            }
        except Exception as exc:
            errors.append(f'{account["id"]}: {str(exc)}')

    return {
        "handle": f"@{handle}",
        "status": "unavailable",
        "delivery": "unavailable",
        "recentAbstractTweetCount": None,
        "recentAbstractEngagement": None,
        "recentAbstractLikes": None,
        "recentAbstractRetweets": None,
        "recentAbstractReplies": None,
        "recentAbstractQuotes": None,
        "recentAbstractViews": None,
        "source": "unavailable",
        "warning": " | ".join(errors) or "Social provider failed",
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        raw_handle = (params.get("handle", [""])[0] or "").strip()
        handle = normalize_handle(raw_handle)

        if not handle or len(handle) > 15:
            return self._send_json(400, {"error": "Invalid handle"})

        payload = asyncio.run(run_search(handle))
        return self._send_json(200, payload)

    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
