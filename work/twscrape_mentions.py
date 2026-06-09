#!/usr/bin/env python3
import argparse
import asyncio
import csv
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from twscrape import API


@dataclass
class MatchRow:
    username1: str
    username2: str
    tweet_id: int
    created_at: str
    url: str
    likes: int
    replies: int
    retweets: int
    quotes: int
    views: int | None
    lang: str | None
    raw_text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Find tweets posted by username1 that mention username2, then print and save them."
    )
    parser.add_argument("--username1", required=True, help="Author username, without @")
    parser.add_argument("--username2", required=True, help="Mention username, with or without @")
    parser.add_argument("--login-username", required=True, help="X login username for twscrape")
    parser.add_argument("--password", default="", help="X login password")
    parser.add_argument("--email", default="", help="Email used by the X account")
    parser.add_argument(
        "--email-password",
        default="",
        help="Email inbox password or app password used for login verification",
    )
    parser.add_argument(
        "--cookies",
        default="",
        help="Cookie string such as 'auth_token=...; ct0=...'. If omitted, env X_AUTH_TOKEN/X_CT0 are used when present.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Maximum matching search results to fetch",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="CSV output path. Defaults to outputs/<username1>_mentions_<username2>.csv",
    )
    parser.add_argument(
        "--query",
        default=None,
        help="Optional custom X search query. Defaults to from:username1 @username2 -filter:replies -filter:nativeretweets",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON summary instead of human-readable text",
    )
    return parser.parse_args()


def normalize_username(value: str) -> str:
    return value.strip().lstrip("@").lower()


def tweet_matches(tweet, target_username: str) -> bool:
    text = (tweet.rawContent or "").lower()
    if f"@{target_username}" in text:
        return True

    mentioned_users = getattr(tweet, "mentionedUsers", None) or []
    for user in mentioned_users:
        if getattr(user, "username", "").lower() == target_username:
            return True

    return False


def format_url(author_username: str, tweet_id: int) -> str:
    return f"https://x.com/{author_username}/status/{tweet_id}"


def build_row(tweet, username1: str, username2: str) -> MatchRow:
    return MatchRow(
        username1=username1,
        username2=username2,
        tweet_id=tweet.id,
        created_at=str(tweet.date),
        url=format_url(tweet.user.username, tweet.id),
        likes=getattr(tweet, "likeCount", 0) or 0,
        replies=getattr(tweet, "replyCount", 0) or 0,
        retweets=getattr(tweet, "retweetCount", 0) or 0,
        quotes=getattr(tweet, "quoteCount", 0) or 0,
        views=getattr(tweet, "viewCount", None),
        lang=getattr(tweet, "lang", None),
        raw_text=(tweet.rawContent or "").replace("\n", " ").strip(),
    )


def write_csv(rows: Iterable[MatchRow], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = list(rows)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(rows[0]).keys()) if rows else list(MatchRow.__annotations__.keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def build_summary(query: str, scanned: int, rows: list[MatchRow], output_path: Path | None) -> dict:
    return {
        "query": query,
        "fetchedCount": scanned,
        "tweetCount": len(rows),
        "likes": sum(row.likes for row in rows),
        "replies": sum(row.replies for row in rows),
        "retweets": sum(row.retweets for row in rows),
        "quotes": sum(row.quotes for row in rows),
        "views": sum(int(row.views or 0) for row in rows),
        "engagement": sum(row.likes + row.replies + row.retweets + row.quotes for row in rows),
        "output": str(output_path) if output_path else None,
        "tweets": [asdict(row) for row in rows],
    }


async def main() -> None:
    args = parse_args()
    username1 = normalize_username(args.username1)
    username2 = normalize_username(args.username2)

    default_output = (
        Path(__file__).resolve().parents[1]
        / "outputs"
        / f"{username1}_mentions_{username2}.csv"
    )
    output_path = Path(args.output).expanduser().resolve() if args.output else default_output

    api = API()
    cookie_string = args.cookies.strip()
    if not cookie_string:
        auth_token = os.getenv("X_AUTH_TOKEN", "").strip()
        ct0 = os.getenv("X_CT0", "").strip()
        if auth_token and ct0:
            cookie_string = f"auth_token={auth_token}; ct0={ct0}"

    await api.pool.add_account(
        args.login_username,
        args.password,
        args.email,
        args.email_password,
        cookies=cookie_string or None,
    )
    if not cookie_string:
        await api.pool.login_all()

    matches: list[MatchRow] = []
    scanned = 0
    query = args.query or f"from:{username1} @{username2} -filter:replies -filter:nativeretweets"

    async for tweet in api.search(query, limit=args.limit):
        scanned += 1
        if tweet_matches(tweet, username2):
            matches.append(build_row(tweet, username1, username2))

    deduped = list({row.tweet_id: row for row in matches}.values())
    if not args.json or args.output:
        write_csv(deduped, output_path)

    summary = build_summary(query, scanned, deduped, output_path if (not args.json or args.output) else None)

    if args.json:
        print(json.dumps(summary, ensure_ascii=False))
        return

    print(f"Search query: {query}")
    print(f"Fetched {scanned} matching search results")
    print(f"Found {len(deduped)} tweets mentioning @{username2}")
    print(f"Saved CSV to: {output_path}")
    print("")

    if not deduped:
        print("No matching tweets found.")
        return

    for row in deduped:
        print(f"[{row.created_at}] {row.url}")
        print(
            f"likes={row.likes} replies={row.replies} retweets={row.retweets} quotes={row.quotes} views={row.views}"
        )
        print(row.raw_text)
        print("")


if __name__ == "__main__":
    asyncio.run(main())
