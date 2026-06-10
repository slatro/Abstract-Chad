const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { getCachedSocial, setCachedSocial } = require("./work/social-cache");
const { fetchSocialSnapshot } = require("./work/social-provider");

const root = __dirname;
loadEnv(path.join(root, ".env"));
const port = Number(process.env.PORT || 4175);
const host = "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/x-stats") {
    return handleXStats(url, res);
  }

  if (url.pathname === "/api/calendar") {
    return handleCalendar(url, res);
  }

  return serveStatic(url.pathname, res);
});

server.listen(port, host, () => {
  console.log(`Abstract Chad app listening on http://${host}:${port}`);
});

async function handleXStats(url, res) {
  const rawHandle = (url.searchParams.get("handle") || "").trim();
  const handle = rawHandle.replace(/^@/, "");
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    return sendJson(res, 400, { error: "Invalid handle" });
  }

  try {
    const cached = getCachedSocial(handle);
    const cachedUsable = cached && !isLegacyEmptySocialSnapshot(cached);
    const cacheFresh = cached && Date.now() - new Date(cached.updatedAt).getTime() < 1000 * 60 * 30;

    if (cachedUsable && cacheFresh && !forceRefresh) {
      return sendJson(res, 200, { ...cached, cache: "hit", delivery: "cached" });
    }

    const snapshot = await fetchSocialSnapshot({ handle, env: process.env });
    const saved = setCachedSocial(handle, snapshot);
    return sendJson(res, 200, {
      ...saved,
      cache: cacheFresh ? "refresh" : "miss",
      delivery: "live",
    });
  } catch (error) {
    const cached = getCachedSocial(handle);
    if (cached && !isLegacyEmptySocialSnapshot(cached)) {
      return sendJson(res, 200, {
        ...cached,
        status: "stale",
        warning: error.message || "Social provider failed",
        cache: "stale",
        delivery: "cached-fallback",
      });
    }

    return sendJson(res, 200, {
      handle: `@${handle}`,
      status: "unavailable",
      recentAbstractTweetCount: null,
      recentAbstractEngagement: null,
      recentAbstractLikes: null,
      recentAbstractRetweets: null,
      recentAbstractReplies: null,
      recentAbstractQuotes: null,
      recentAbstractViews: null,
      source: "unavailable",
      warning: error.message || "Social provider failed",
      delivery: "unavailable",
    });
  }
}

async function handleCalendar(url, res) {
  const wallet = (url.searchParams.get("wallet") || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return sendJson(res, 400, { error: "Invalid wallet" });
  }

  try {
    const calendar = await fetchAbscanCalendar(wallet);
    return sendJson(res, 200, calendar);
  } catch (error) {
    return sendJson(res, 200, {
      wallet,
      source: "abscan",
      status: "unavailable",
      warning: error.message || "Calendar provider failed",
      dailyCounts: {},
    });
  }
}

function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(root, path.normalize(safePath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function isLegacyEmptySocialSnapshot(snapshot) {
  if (!snapshot || snapshot.source !== "x-guest-scraper") return false;

  const metrics = [
    snapshot.recentAbstractTweetCount,
    snapshot.recentAbstractLikes,
    snapshot.recentAbstractReplies,
    snapshot.recentAbstractRetweets,
    snapshot.recentAbstractQuotes,
    snapshot.recentAbstractViews,
    snapshot.recentAbstractEngagement,
  ];

  return metrics.every((value) => Number(value || 0) === 0);
}

async function fetchAbscanCalendar(wallet) {
  const normalizedWallet = wallet.toLowerCase();
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 179);
  const cutoffTime = cutoff.getTime();

  const firstPageHtml = await fetchText(`https://abscan.org/txs?a=${encodeURIComponent(wallet)}`);
  const totalPages = extractTotalPages(firstPageHtml);
  const counts = {};
  const maxPages = Math.min(totalPages, 12);

  for (let page = 1; page <= maxPages; page += 1) {
    const html = page === 1 ? firstPageHtml : await fetchText(`https://abscan.org/txs?a=${encodeURIComponent(wallet)}&p=${page}`);
    const rows = extractTransactionRows(html);
    if (!rows.length) break;

    let pageHasRecent = false;
    for (const row of rows) {
      const txDate = new Date(`${row.dateText.replace(" ", "T")}Z`);
      if (Number.isNaN(txDate.getTime())) continue;
      if (txDate.getTime() < cutoffTime) continue;
      pageHasRecent = true;

      const isWalletOut = row.from.toLowerCase() === normalizedWallet;
      const isWalletIn = row.to.toLowerCase() === normalizedWallet;
      if (!isWalletOut && !isWalletIn) continue;

      const key = row.dateText.slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    }

    if (!pageHasRecent) break;
  }

  return {
    wallet,
    source: "abscan",
    status: "ready",
    dailyCounts: counts,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Abscan request failed with ${response.status}`);
  }

  return response.text();
}

function extractTotalPages(html) {
  const match = html.match(/Page\s+1\s+of\s+(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function extractTransactionRows(html) {
  const rows = [];
  const rowRegex = /<tr>\s*<td><button[\s\S]*?<td class='showDate[^>]*><span[^>]*>(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})<\/span><\/td>[\s\S]*?data-highlight-target="(0x[a-fA-F0-9]{40})"[\s\S]*?<td class="text-center">[\s\S]*?data-highlight-target="(0x[a-fA-F0-9]{40})"/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    rows.push({
      dateText: match[1],
      from: match[2],
      to: match[3],
    });
  }
  return rows;
}
