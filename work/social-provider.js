const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const ROOT = path.join(__dirname, "..");
const PYTHON_BIN = path.join(ROOT, ".venv312", "bin", "python");
const SCRIPT_PATH = path.join(__dirname, "twscrape_mentions.py");

function buildCookieString(authToken, ct0) {
  const auth = String(authToken || "").trim();
  const csrf = String(ct0 || "").trim();
  if (!auth || !csrf) return "";
  return `auth_token=${auth}; ct0=${csrf}`;
}

function getScraperAccounts(env = process.env) {
  const accounts = [];

  for (let index = 1; index <= 10; index += 1) {
    const username = String(env[`X_SCRAPER_USERNAME_${index}`] || "").trim();
    const cookies = buildCookieString(env[`X_AUTH_TOKEN_${index}`], env[`X_CT0_${index}`]);
    const password = String(env[`X_SCRAPER_PASSWORD_${index}`] || "").trim();
    const email = String(env[`X_SCRAPER_EMAIL_${index}`] || "").trim();
    const emailPassword = String(env[`X_SCRAPER_EMAIL_PASSWORD_${index}`] || "").trim();

    if (!username && !cookies) continue;

    accounts.push({
      id: `account-${index}`,
      username: username || `scraper_${index}`,
      cookies,
      password,
      email,
      emailPassword,
    });
  }

  if (accounts.length) return accounts;

  const fallbackUsername = String(env.X_SCRAPER_USERNAME || "side_account").trim();
  accounts.push({
    id: "account-1",
    username: fallbackUsername,
    cookies: buildCookieString(env.X_AUTH_TOKEN, env.X_CT0),
    password: String(env.X_SCRAPER_PASSWORD || "").trim(),
    email: String(env.X_SCRAPER_EMAIL || "").trim(),
    emailPassword: String(env.X_SCRAPER_EMAIL_PASSWORD || "").trim(),
  });

  return accounts;
}

async function runSearchWithAccount({ username, handle, limit, account, env }) {
  const childEnv = {
    ...process.env,
    ...env,
    PYTHONPYCACHEPREFIX: env.PYTHONPYCACHEPREFIX || "/private/tmp/pycache",
  };

  const args = [
    SCRIPT_PATH,
    "--username1",
    username,
    "--username2",
    "AbstractChain",
    "--login-username",
    account.username,
    "--limit",
    limit,
    "--json",
  ];

  if (account.cookies) {
    args.push("--cookies", account.cookies);
  }

  if (!account.cookies && account.password) {
    args.push("--password", account.password);
  }

  if (!account.cookies && account.email) {
    args.push("--email", account.email);
  }

  if (!account.cookies && account.emailPassword) {
    args.push("--email-password", account.emailPassword);
  }

  const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
    cwd: ROOT,
    env: childEnv,
    maxBuffer: 1024 * 1024 * 6,
  });

  const lastJsonLine =
    stdout
      .trim()
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith("{")) || "";

  if (!lastJsonLine) {
    throw new Error(stderr?.trim() || `Failed to parse twscrape output for ${account.id}`);
  }

  return JSON.parse(lastJsonLine);
}

async function fetchSocialSnapshot({ handle, env = process.env }) {
  const username = String(handle || "").replace(/^@/, "").trim();
  if (!username) {
    throw new Error("Missing handle");
  }

  const limit = String(env.X_SEARCH_LIMIT || "300").trim();
  const accounts = getScraperAccounts(env);
  const errors = [];

  for (const account of accounts) {
    try {
      const payload = await runSearchWithAccount({ username, handle, limit, account, env });
      return {
        handle: `@${username}`,
        query: payload.query,
        source: "twscrape-search",
        providerMode: accounts.length > 1 ? "pool" : "single",
        providerAccount: account.id,
        providerUsername: account.username,
        status: "ready",
        recentAbstractTweetCount: Number(payload.tweetCount || 0),
        recentAbstractLikes: Number(payload.likes || 0),
        recentAbstractReplies: Number(payload.replies || 0),
        recentAbstractRetweets: Number(payload.retweets || 0),
        recentAbstractQuotes: Number(payload.quotes || 0),
        recentAbstractViews: Number(payload.views || 0),
        recentAbstractEngagement: Number(payload.engagement || 0),
        fetchedCount: Number(payload.fetchedCount || 0),
      };
    } catch (error) {
      errors.push(`${account.id}: ${error.message || "unknown error"}`);
    }
  }

  throw new Error(errors.join(" | ") || "All scraper accounts failed");
}

module.exports = {
  fetchSocialSnapshot,
  getScraperAccounts,
};
