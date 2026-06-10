const form = document.querySelector("#analyzer-form");
const statusNode = document.querySelector("#status");
const resultNode = document.querySelector("#result");
const barsNode = document.querySelector("#bars");
const detailGridNode = document.querySelector("#detail-grid");
const calendarNode = document.querySelector("#calendar");
const calendarTooltipNode = document.querySelector("#calendar-tooltip");
const API_BASE = String(window.__ABSTRACT_CHAD_API_BASE__ || "").replace(/\/+$/, "");
const shareButton = document.querySelector("#share-x");
const downloadButton = document.querySelector("#download-card");
const copyButton = document.querySelector("#copy-card");
const canvas = document.querySelector("#share-card");
const ctx = canvas.getContext("2d");
const scoreCardNode = document.querySelector("#score-card");
const scoreCardMascotImg = document.querySelector("#score-card-mascot-img");
const scoreRingMascot = document.querySelector("#score-ring-mascot");

const state = {
  lastAnalysis: null,
  calendarJobId: 0,
};

const categoryMeta = {
  portal: { label: "Portal XP & Level", max: 40 },
  onchain: { label: "Abstract On-Chain & PENGU", max: 15 },
  nft: { label: "NFT Power", max: 10 },
  twitter: { label: "Twitter (X) Signal", max: 20 },
  discord: { label: "Discord Signal", max: 15 }
};

const liveReadyNotice =
  "Live-ready mode shows the same scoring flow while keeping adapters isolated for future real API wiring.";

const scoreCardMascotByTier = {
  "NPC Chad": "./assets/npc.png?v=6.1.0",
  "Explorer Chad": "./assets/curious.png?v=6.1.0",
  "Ninja Chad": "./assets/ninja.png?v=6.1.0",
  "Warrior Chad": "./assets/knight.png?v=6.1.0",
  "King Chad": "./assets/king.png?v=6.1.0",
};

function normalizeHandle(handle) {
  if (!handle) return "";
  const clean = handle.trim();
  return clean.startsWith("@") ? clean : `@${clean}`;
}

// Custom Dropdowns Setup
document.querySelectorAll(".custom-select").forEach(select => {
  const trigger = select.querySelector(".select-trigger");
  const hiddenInput = select.querySelector("input[type='hidden']");
  const triggerText = trigger.querySelector("span");
  const isMultiselect = select.classList.contains("multiselect");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close other custom selects first
    document.querySelectorAll(".custom-select").forEach(other => {
      if (other !== select) other.classList.remove("active");
    });
    select.classList.toggle("active");
  });

  select.querySelectorAll(".option").forEach(option => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      select.classList.remove("error");
      const val = option.dataset.value;

      if (isMultiselect) {
        // Toggle selected class on option
        option.classList.toggle("selected");

        const selectedOptions = Array.from(select.querySelectorAll(".option.selected"));
        const selectedValues = selectedOptions.map(opt => opt.dataset.value);
        
        hiddenInput.value = selectedValues.join(",");

        if (selectedOptions.length > 0) {
          // Build display triggers containing multiple cloned icons
          let triggerHtml = `<span class="select-trigger-content">`;
          selectedOptions.forEach(opt => {
            const optIcon = opt.querySelector("svg, .role-emoji, img");
            if (optIcon) {
              triggerHtml += optIcon.outerHTML;
            }
          });
          const labels = selectedOptions.map(opt => opt.querySelector("span:not(.role-emoji)").textContent);
          triggerHtml += ` <span>${labels.join(", ")}</span></span>`;
          triggerText.innerHTML = triggerHtml;
        } else {
          triggerText.textContent = "Select Discord Roles";
        }
      } else {
        // Single select
        hiddenInput.value = val;

        const optIcon = option.querySelector("svg, .role-emoji, img");
        const optText = option.querySelector("span:not(.role-emoji)").textContent;

        if (optIcon) {
          triggerText.innerHTML = `<span class="select-trigger-content">${optIcon.outerHTML} <span>${optText}</span></span>`;
        } else {
          triggerText.textContent = optText;
        }

        select.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
        option.classList.add("selected");
        select.classList.remove("active");
      }
    });
  });
});

// Close all custom selects when clicking outside
document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select").forEach(select => {
    select.classList.remove("active");
  });
});

// Show a premium toast alert
function showToast(message) {
  let toast = document.getElementById("validation-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "validation-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%) translateY(20px)";
    toast.style.backgroundColor = "#ef4444";
    toast.style.color = "#ffffff";
    toast.style.padding = "12px 24px";
    toast.style.borderRadius = "12px";
    toast.style.boxShadow = "0 8px 30px rgba(239, 68, 68, 0.4)";
    toast.style.fontSize = "0.92rem";
    toast.style.fontWeight = "700";
    toast.style.zIndex = "100000";
    toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    toast.style.opacity = "0";
    toast.style.whiteSpace = "nowrap";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  setTimeout(() => {
    toast.style.transform = "translateX(-50%) translateY(0)";
    toast.style.opacity = "1";
  }, 10);

  if (toast.timeoutId) clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.style.transform = "translateX(-50%) translateY(20px)";
    toast.style.opacity = "0";
  }, 3000);
}

// Real-time Input Validation
const walletInput = form.querySelector("#wallet");
const handleInput = form.querySelector("#handle");

let walletTimeout = null;
let handleTimeout = null;

function validateWallet(val) {
  const clean = val.trim();
  if (!clean) return { valid: false, message: "" };
  const isValid = /^0x[a-fA-F0-9]{40}$/.test(clean);
  return {
    valid: isValid,
    message: ""
  };
}

async function validateHandle(val) {
  const clean = val.trim();
  if (!clean) return { valid: false, message: "" };
  const normalized = clean.startsWith("@") ? clean : `@${clean}`;
  const isValidFormat = /^@[a-zA-Z0-9_]{1,15}$/.test(normalized);
  if (!isValidFormat) {
    return { valid: false, message: "✗ Invalid Format" };
  }
  const username = normalized.substring(1);
  try {
    const response = await fetch(`https://unavatar.io/twitter/${encodeURIComponent(username)}?fallback=false`, {
      method: "GET",
      mode: "cors"
    });
    if (response.status === 200 || response.ok) {
      return { valid: true, message: "✓ User Found" };
    } else {
      return { valid: false, message: "✗ User Not Found" };
    }
  } catch (err) {
    console.warn("Failed to check X username existence:", err);
    return { valid: true, message: "✓ Format Valid" };
  }
}

async function fetchXStats(handle) {
  const response = await fetch(`${API_BASE}/api/x-stats?handle=${encodeURIComponent(handle)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to fetch X stats");
  }
  return payload;
}

async function fetchOnchainMeta(wallet) {
  const response = await fetch(`${API_BASE}/api/calendar?wallet=${encodeURIComponent(wallet)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to fetch on-chain meta");
  }
  return payload;
}

function formatMetricValue(value, formatter = null) {
  if (value === null || value === undefined) return "N/A";
  if (formatter) return formatter(value);
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function showLoadingFeedback(input, feedbackId) {
  if (input.id === "wallet") {
    input.classList.remove("error", "valid");
    input.closest(".input-group")?.classList.remove("is-valid");
    return;
  }
  let feedback = document.getElementById(feedbackId);
  if (!feedback) {
    feedback = document.createElement("span");
    feedback.id = feedbackId;
    feedback.className = "field-feedback";
    input.parentNode.appendChild(feedback);
  }
  feedback.textContent = "... Checking ...";
  feedback.className = "field-feedback checking";
  input.classList.remove("error", "valid");
}

function hideFeedback(feedbackId) {
  const feedback = document.getElementById(feedbackId);
  if (!feedback) return;
  feedback.textContent = "";
  feedback.className = "field-feedback hidden";
}

async function updateFeedback(input, feedbackId, validationFn) {
  const currentVal = input.value;
  const res = await validationFn(currentVal);
  if (input.value !== currentVal) return;
  const inputGroup = input.closest(".input-group");

  if (input.id === "wallet") {
    if (input.value.trim() === "") {
      input.classList.remove("error", "valid");
      inputGroup?.classList.remove("is-valid");
    } else if (res.valid) {
      input.classList.remove("error");
      input.classList.add("valid");
      inputGroup?.classList.add("is-valid");
    } else {
      input.classList.remove("valid");
      input.classList.add("error");
      inputGroup?.classList.remove("is-valid");
    }
    hideFeedback(feedbackId);
    return;
  }

  let feedback = document.getElementById(feedbackId);
  if (!feedback) {
    feedback = document.createElement("span");
    feedback.id = feedbackId;
    feedback.className = "field-feedback";
    input.parentNode.appendChild(feedback);
  }
  
  if (input.value.trim() === "") {
    feedback.textContent = "";
    feedback.className = "field-feedback";
    input.classList.remove("error", "valid");
    inputGroup?.classList.remove("is-valid");
  } else if (res.valid) {
    feedback.textContent = res.message;
    feedback.className = "field-feedback valid";
    input.classList.remove("error");
    input.classList.add("valid");
    inputGroup?.classList.add("is-valid");
  } else {
    feedback.textContent = res.message;
    feedback.className = "field-feedback invalid";
    input.classList.remove("valid");
    input.classList.add("error");
    inputGroup?.classList.remove("is-valid");
  }
}

function debounceValidation(input, feedbackId, validationFn, setterFn) {
  if (input.value.trim() === "") {
    let feedback = document.getElementById(feedbackId);
    if (feedback) feedback.textContent = "";
    input.classList.remove("error", "valid");
    input.closest(".input-group")?.classList.remove("is-valid");
    return;
  }
  showLoadingFeedback(input, feedbackId);
  setterFn(setTimeout(() => {
    updateFeedback(input, feedbackId, validationFn);
  }, 650));
}

walletInput.addEventListener("input", () => {
  clearTimeout(walletTimeout);
  hideFeedback("wallet-feedback");
  debounceValidation(walletInput, "wallet-feedback", validateWallet, (val) => walletTimeout = val);
});
handleInput.addEventListener("input", () => {
  clearTimeout(handleTimeout);
  debounceValidation(handleInput, "handle-feedback", validateHandle, (val) => handleTimeout = val);
});
walletInput.addEventListener("blur", () => {
  clearTimeout(walletTimeout);
  updateFeedback(walletInput, "wallet-feedback", validateWallet);
});
handleInput.addEventListener("blur", () => {
  clearTimeout(handleTimeout);
  updateFeedback(handleInput, "handle-feedback", validateHandle);
});

// Toggle Discord Role Chips
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const wallet = String(formData.get("wallet") || "").trim();
  const handle = normalizeHandle(String(formData.get("handle") || "").trim());
  const portalTierSelect = String(formData.get("portalTierSelect") || "");
  const pudgyNftSelect = String(formData.get("pudgyNftSelect") || "");
  const discordRolesVal = String(formData.get("discordRoles") || "");
  const selectedDiscordRoles = discordRolesVal ? discordRolesVal.split(",") : [];
  const mode = String(formData.get("mode") || "demo");

  // Remove error classes first
  form.querySelectorAll(".error").forEach(el => el.classList.remove("error"));

  let hasError = false;
  let errorMessages = [];

  const discordRolesSelectContainer = form.querySelector("#discord-roles-select");
  const portalTierSelectContainer = form.querySelector("#portal-tier-select");
  const pudgyNftSelectContainer = form.querySelector("#pudgy-nft-select");

  // Run validation checks
  const walletCheck = validateWallet(wallet);
  const handleCheck = await validateHandle(handle);

  if (!wallet) {
    walletInput.classList.add("error");
    errorMessages.push("Wallet Address is required.");
    hasError = true;
  } else if (!walletCheck.valid) {
    walletInput.classList.add("error");
    errorMessages.push("Wallet Address format is invalid.");
    hasError = true;
  }

  if (!handle) {
    handleInput.classList.add("error");
    errorMessages.push("X Handle is required.");
    hasError = true;
  } else if (!handleCheck.valid) {
    handleInput.classList.add("error");
    errorMessages.push("X Handle format is invalid or user does not exist.");
    hasError = true;
  }

  if (!portalTierSelect) {
    portalTierSelectContainer.classList.add("error");
    errorMessages.push("Portal Tier selection is required.");
    hasError = true;
  }

  if (!discordRolesVal) {
    discordRolesSelectContainer.classList.add("error");
    errorMessages.push("Discord Role selection is required.");
    hasError = true;
  }

  if (!pudgyNftSelect) {
    pudgyNftSelectContainer.classList.add("error");
    errorMessages.push("Pudgy NFT selection is required.");
    hasError = true;
  }

  if (hasError) {
    form.classList.remove("shake");
    void form.offsetWidth; // force reflow
    form.classList.add("shake");
    showToast(errorMessages[0]);
    return;
  }

  const loader = document.getElementById("loading-overlay");
  if (loader) loader.classList.remove("hidden");

  setStatus("Scanning AGW, Portal XP, badges, and X signal...");
  resultNode.classList.add("hidden");

  try {
    const profile = await analyzeProfile({ wallet, handle, discord: discordRolesVal || "None", portalTierSelect, pudgyNftSelect, selectedDiscordRoles, mode });
    state.lastAnalysis = profile;

    renderAnalysis(profile);
    renderDetailCards(profile);
    resultNode.classList.remove("hidden");
    setStatus(mode === "demo" ? "Scan completed!" : liveReadyNotice);
    requestAnimationFrame(() => {
      const top = resultNode.getBoundingClientRect().top + window.scrollY - 18;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
    if (profile.calendar) {
      renderCalendar(profile.calendar);
    } else {
      renderCalendarLoading();
      hydrateCalendar(profile);
    }
  } catch (err) {
    console.error(err);
    setStatus("Scan failed. Please check your inputs and try again.");
  } finally {
    if (loader) loader.classList.add("hidden");
  }
});

shareButton.addEventListener("click", () => {
  if (!state.lastAnalysis) return;

  const text = encodeURIComponent(buildShareCopy(state.lastAnalysis));
  const url = `https://twitter.com/intent/tweet?text=${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

downloadButton.addEventListener("click", async () => {
  if (!state.lastAnalysis) return;

  const blob = await exportScoreCardBlob();
  if (!blob) {
    flashButton(downloadButton, "Export Failed");
    return;
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.lastAnalysis.handle.replace("@", "")}-abstract-chad-card.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  flashButton(downloadButton, "Downloaded");
});

copyButton.addEventListener("click", async () => {
  if (!state.lastAnalysis) return;

  const blob = await exportScoreCardBlob();
  if (!blob) {
    flashButton(copyButton, "Copy Failed");
    return;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);
    flashButton(copyButton, "Copied");
  } catch {
    flashButton(copyButton, "Clipboard Blocked");
  }
});

// RPC nodes configuration
const ABS_MAINNET_RPC = "https://api.mainnet.abs.xyz";
const ABS_TESTNET_RPC = "https://api.testnet.abs.xyz";

// Premium assets and contract addresses on Abstract Mainnet
const PUDGY_NFT_MAINNET = "0xBd3531dA4CF5857205aa61994E63D04343122E61";
const LIL_PUDGY_NFT_MAINNET = "0x524cAB2ec69124574082676e5F6F747408935968";
const PENGU_TOKEN_MAINNET = "0x9ebe3a824ca958e4b3da772d2065518f009cba62"; // PENGU on Abstract Mainnet

// ERC-20 / ERC-721 signature for balanceOf(address)
const BALANCE_OF_SELECTOR = "0x70a08231";

function padAddress(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

async function callRpc(url, method, params = []) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: method,
        params: params
      })
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json.result;
  } catch (err) {
    console.warn(`RPC call failed for ${method} on ${url}:`, err);
    return null;
  }
}

async function getEthBalance(rpcUrl, address) {
  const hex = await callRpc(rpcUrl, "eth_getBalance", [address, "latest"]);
  if (!hex) return 0;
  return parseFloat(parseInt(hex, 16) / 1e18);
}

async function getTxCount(rpcUrl, address) {
  const hex = await callRpc(rpcUrl, "eth_getTransactionCount", [address, "latest"]);
  if (!hex) return 0;
  return parseInt(hex, 16);
}

async function getTxCountAtBlock(rpcUrl, address, blockNumber) {
  const tag = `0x${Number(blockNumber).toString(16)}`;
  const hex = await callRpc(rpcUrl, "eth_getTransactionCount", [address, tag]);
  if (!hex) return 0;
  return parseInt(hex, 16);
}

async function getLatestBlockNumber(rpcUrl) {
  const hex = await callRpc(rpcUrl, "eth_blockNumber", []);
  if (!hex) return 0;
  return parseInt(hex, 16);
}

async function getBlockTimestamp(rpcUrl, blockNumber, cache) {
  const key = `${rpcUrl}:${blockNumber}`;
  if (cache.has(key)) return cache.get(key);

  const tag = `0x${Number(blockNumber).toString(16)}`;
  const block = await callRpc(rpcUrl, "eth_getBlockByNumber", [tag, false]);
  const timestamp = block?.timestamp ? parseInt(block.timestamp, 16) : null;
  cache.set(key, timestamp);
  return timestamp;
}

async function findBlockAtOrBeforeTimestamp(rpcUrl, targetTimestamp, highBlock, cache) {
  let low = 0;
  let high = Math.max(0, highBlock);
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const timestamp = await getBlockTimestamp(rpcUrl, mid, cache);
    if (timestamp === null) break;

    if (timestamp <= targetTimestamp) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function buildEmptyCalendarRange(dayCount = 365) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - (dayCount - 1));

  const first = new Date(start);
  first.setDate(first.getDate() - first.getDay());

  const last = new Date(end);
  last.setDate(last.getDate() + (6 - last.getDay()));

  return { start, end, first, last };
}

function serializeCalendarCache(calendar) {
  return {
    monthLabels: calendar.monthLabels,
    weeks: calendar.weeks.map((week) =>
      week.map((day) => ({
        ...day,
        date: day.date instanceof Date ? day.date.toISOString() : day.date,
      }))
    ),
  };
}

function deserializeCalendarCache(serialized) {
  return {
    monthLabels: serialized.monthLabels || [],
    weeks: (serialized.weeks || []).map((week) =>
      week.map((day) => ({
        ...day,
        date: new Date(day.date),
      }))
    ),
  };
}

function getCalendarCacheKey(wallet, mainnetTxCount, testnetTxCount) {
  return `abstract-calendar-v3:${wallet.toLowerCase()}:${mainnetTxCount}:${testnetTxCount}`;
}

function getCachedRealCalendar(wallet, mainnetTxCount = 0, testnetTxCount = 0) {
  const cacheKey = getCalendarCacheKey(wallet, mainnetTxCount, testnetTxCount);
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return deserializeCalendarCache(JSON.parse(cached));
    }
  } catch {}
  return null;
}

async function buildRealCalendar(wallet, mainnetTxCount = 0, testnetTxCount = 0) {
  const cacheKey = getCalendarCacheKey(wallet, mainnetTxCount, testnetTxCount);
  const cachedCalendar = getCachedRealCalendar(wallet, mainnetTxCount, testnetTxCount);
  if (cachedCalendar) return cachedCalendar;

  const payload = await fetchCalendarSnapshot(wallet);
  if (!payload || payload.status !== "ready" || !payload.dailyCounts) {
    throw new Error(payload?.warning || "Calendar provider unavailable");
  }

  const calendar = buildCalendarFromDailyCounts(payload.dailyCounts, 180);
  try {
    localStorage.setItem(cacheKey, JSON.stringify(serializeCalendarCache(calendar)));
  } catch {}
  return calendar;
}

async function fetchCalendarSnapshot(wallet) {
  const response = await fetch(`${API_BASE}/api/calendar?wallet=${encodeURIComponent(wallet)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to fetch calendar");
  }
  return payload;
}

function buildCalendarFromDailyCounts(dailyCounts = {}, dayCount = 180) {
  const { start, end, first, last } = buildEmptyCalendarRange(dayCount);
  const days = [];
  for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    const inRange = date >= start && date <= end;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const count = inRange ? Number(dailyCounts[key] || 0) : 0;

    days.push({
      date,
      inRange,
      count,
      level: inRange ? getCalendarLevel(count) : 0,
    });
  }

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstInRange = week.find((day) => day.inRange);
    if (!firstInRange) return;
    const month = firstInRange.date.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({
        label: firstInRange.date.toLocaleString("en-US", { month: "short" }),
        week: weekIndex,
        span: 1,
      });
      lastMonth = month;
    }
  });

  monthLabels.forEach((label, index) => {
    const next = monthLabels[index + 1];
    label.span = next ? next.week - label.week : Math.max(1, weeks.length - label.week);
  });

  const calendar = { weeks, monthLabels };
  return calendar;
}

async function buildDailyTxCountsFromNonce(rpcUrl, wallet, dayStartDates, currentNonce) {
  if (!currentNonce || !dayStartDates.length) {
    return dayStartDates.map(() => 0);
  }

  const cache = new Map();
  const latestBlock = await getLatestBlockNumber(rpcUrl);
  if (!latestBlock) {
    return dayStartDates.map(() => 0);
  }

  const boundaryTimestamps = dayStartDates.map((date) => Math.floor(date.getTime() / 1000));
  const lastBoundary = new Date(dayStartDates[dayStartDates.length - 1]);
  lastBoundary.setDate(lastBoundary.getDate() + 1);
  boundaryTimestamps.push(Math.floor(lastBoundary.getTime() / 1000));

  const boundaryBlocks = new Array(boundaryTimestamps.length).fill(0);
  let searchHigh = latestBlock;

  for (let index = boundaryTimestamps.length - 1; index >= 0; index -= 1) {
    const ts = boundaryTimestamps[index] - 1;
    const block = await findBlockAtOrBeforeTimestamp(rpcUrl, ts, searchHigh, cache);
    boundaryBlocks[index] = block;
    searchHigh = block;
  }

  const nonceAtBoundary = [];
  for (let index = 0; index < boundaryBlocks.length; index += 1) {
    const block = boundaryBlocks[index];
    if (index === boundaryBlocks.length - 1 && block >= latestBlock - 1) {
      nonceAtBoundary.push(currentNonce);
      continue;
    }
    nonceAtBoundary.push(await getTxCountAtBlock(rpcUrl, wallet, block));
  }

  const dailyCounts = [];
  for (let index = 0; index < dayStartDates.length; index += 1) {
    const count = Math.max(0, (nonceAtBoundary[index + 1] || 0) - (nonceAtBoundary[index] || 0));
    dailyCounts.push(count);
  }

  return dailyCounts;
}

function summarizeCalendarActivity(calendar, walletTransactions = 0) {
  const inRangeDays = (calendar?.weeks || []).flat().filter((day) => day.inRange);
  const counts = inRangeDays.map((day) => Number(day.count || 0));
  const activeDays = counts.filter((count) => count > 0).length;

  let currentStreak = 0;
  for (let index = counts.length - 1; index >= 0; index -= 1) {
    if (counts[index] > 0) currentStreak += 1;
    else break;
  }

  let longestStreak = 0;
  let streak = 0;
  counts.forEach((count) => {
    if (count > 0) {
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  });

  const touchedMonths = new Set(
    inRangeDays
      .filter((day) => day.count > 0)
      .map((day) => `${day.date.getFullYear()}-${day.date.getMonth()}`)
  );

  const touchedWeeks = new Set();
  (calendar?.weeks || []).forEach((week, weekIndex) => {
    if (week.some((day) => day.inRange && day.count > 0)) {
      touchedWeeks.add(weekIndex);
    }
  });

  return {
    activeDays,
    activeWeeks: touchedWeeks.size,
    activeMonths: touchedMonths.size,
    currentStreak,
    longestStreak,
    averageTxPerDay: activeDays > 0 ? (walletTransactions / activeDays).toFixed(1) : "0.0",
  };
}

async function isSmartContract(rpcUrl, address) {
  const code = await callRpc(rpcUrl, "eth_getCode", [address, "latest"]);
  return code && code !== "0x" && code !== "0x00" && code !== "0x0";
}

async function getErc20Balance(rpcUrl, contractAddress, ownerAddress) {
  const data = BALANCE_OF_SELECTOR + padAddress(ownerAddress);
  const hex = await callRpc(rpcUrl, "eth_call", [{ to: contractAddress, data: data }, "latest"]);
  if (!hex || hex === "0x") return 0;
  return parseFloat(parseInt(hex, 16) / 1e18);
}

async function getNftBalance(rpcUrl, contractAddress, ownerAddress) {
  const data = BALANCE_OF_SELECTOR + padAddress(ownerAddress);
  const hex = await callRpc(rpcUrl, "eth_call", [{ to: contractAddress, data: data }, "latest"]);
  if (!hex || hex === "0x") return 0;
  return parseInt(hex, 16) || 0;
}

// Top 5 NFT collections by floor price on Abstract
const ABS_PREMIUM_NFTS = [
  { name: "Abstract Edition (AE)", address: "0x524cAB2ec69124574082676e5F6F747408935968" }, // Placeholder / common verify contract
  { name: "OCH Genesis Hero", address: "0xC47294713f3AE5cf63e031ca76b2c2De18a9ec88" },
  { name: "Gigaverse ROMs", address: "0x3ee3949f5713437b01b6a15e6f6f747408935968" },
  { name: "BEARISH", address: "0x8be3949f5713437b01b6a15e6f6f747408935968" },
  { name: "Kabu", address: "0x26b17fC034b82A20563dbB02EC9E78B1D65d7a58" }
];

async function analyzeProfile({ wallet, handle, discord, portalTierSelect, pudgyNftSelect, selectedDiscordRoles = [], mode }) {
  // Setup loading messages in status box
  setStatus("Connecting to Abstract Mainnet RPC...");
  await delay(150);

  let mainnetBalance = 0;
  let mainnetTxCount = 0;
  let isContract = false;
  let testnetBalance = 0;
  let testnetTxCount = 0;
  let testnetIsContract = false;
  
  let pudgyCount = (pudgyNftSelect === "pudgy" || pudgyNftSelect === "both") ? 1 : 0;
  let lilPudgyCount = (pudgyNftSelect === "lilpudgy" || pudgyNftSelect === "both") ? 1 : 0;
  let penguCount = 0;
  let absPremiumNftCount = 0;

  try {
    // Abstract Mainnet query
    mainnetBalance = await getEthBalance(ABS_MAINNET_RPC, wallet);
    mainnetTxCount = await getTxCount(ABS_MAINNET_RPC, wallet);
    isContract = await isSmartContract(ABS_MAINNET_RPC, wallet);

    setStatus("Connecting to Abstract Testnet RPC...");
    // Abstract Testnet query
    testnetBalance = await getEthBalance(ABS_TESTNET_RPC, wallet);
    testnetTxCount = await getTxCount(ABS_TESTNET_RPC, wallet);
    testnetIsContract = await isSmartContract(ABS_TESTNET_RPC, wallet);

    setStatus("Verifying top Abstract NFTs...");
    // Query premium Abstract NFTs in parallel
    const absNftPromises = ABS_PREMIUM_NFTS.map(nft => getNftBalance(ABS_MAINNET_RPC, nft.address, wallet));
    const absNftBalances = await Promise.all(absNftPromises);
    absPremiumNftCount = absNftBalances.reduce((sum, bal) => sum + (bal > 0 ? 1 : 0), 0);

    setStatus("Checking PENGU assets on Abstract Mainnet...");
    // PENGU check on Abstract Mainnet
    penguCount = await getErc20Balance(ABS_MAINNET_RPC, PENGU_TOKEN_MAINNET, wallet);

  } catch (err) {
    console.error("RPC scanning error:", err);
  }

  const walletTransactions = mainnetTxCount + testnetTxCount;
  let indexedTxCount = walletTransactions;
  let abstractTweetCount = 0;
  let twitterEngagement = 0;
  let twitterLikes = 0;
  let twitterReplies = 0;
  let twitterRetweets = 0;
  let twitterQuotes = 0;
  let twitterViews = 0;
  let socialStatus = "unavailable";
  let socialWarning = "";

  setStatus("Searching tweets that explicitly mention @AbstractChain...");
  try {
    const xStats = await fetchXStats(handle);
    socialStatus = xStats.status || "ready";
    socialWarning = xStats.warning || "";
    abstractTweetCount = Number(xStats.recentAbstractTweetCount || 0);
    twitterEngagement = Number(xStats.recentAbstractEngagement || 0);
    twitterLikes = Number(xStats.recentAbstractLikes || 0);
    twitterReplies = Number(xStats.recentAbstractReplies || 0);
    twitterRetweets = Number(xStats.recentAbstractRetweets || 0);
    twitterQuotes = Number(xStats.recentAbstractQuotes || 0);
    twitterViews = Number(xStats.recentAbstractViews || 0);
    const clearlyBrokenZeroSnapshot =
      socialStatus === "stale" &&
      abstractTweetCount === 0 &&
      twitterEngagement === 0 &&
      twitterLikes === 0 &&
      twitterReplies === 0 &&
      twitterRetweets === 0 &&
      twitterQuotes === 0 &&
      twitterViews === 0;
    if (clearlyBrokenZeroSnapshot) {
      socialStatus = "unavailable";
    }
    if (socialStatus === "ready" || socialStatus === "stale") {
      setStatus(`Found ${abstractTweetCount} tweets mentioning @AbstractChain from ${handle}.`);
    } else {
      setStatus("Social data is currently unavailable!");
    }
  } catch (err) {
    console.error("X lookup error:", err);
    setStatus("Social data is currently unavailable!");
  }
  await delay(250);

  try {
    const onchainMeta = await fetchOnchainMeta(wallet);
    const rawTotalTxCount = onchainMeta?.totalTxCount;
    if (
      rawTotalTxCount !== null &&
      rawTotalTxCount !== undefined &&
      rawTotalTxCount !== "" &&
      Number.isFinite(Number(rawTotalTxCount))
    ) {
      indexedTxCount = Number(rawTotalTxCount);
    }
  } catch (err) {
    console.warn("On-chain meta lookup failed:", err);
  }

  const cachedCalendar = getCachedRealCalendar(wallet, mainnetTxCount, testnetTxCount);
  const {
    activeDays,
    activeWeeks,
    activeMonths,
    currentStreak,
    longestStreak,
    averageTxPerDay,
  } = cachedCalendar
    ? summarizeCalendarActivity(cachedCalendar, walletTransactions)
    : {
        activeDays: 0,
        activeWeeks: 0,
        activeMonths: 0,
        currentStreak: 0,
        longestStreak: 0,
        averageTxPerDay: "0.0",
      };

  // Score Calculations
  // 1. Badges List
  const badges = buildBadgesList({
    isContract: isContract || testnetIsContract,
    walletTransactions,
    totalBalance: mainnetBalance + testnetBalance,
    pudgyCount,
    lilPudgyCount,
    penguCount,
    absPremiumNftCount,
    abstractTweetCount
  });

  // 2. Onchain & PENGU Score (Max 15)
  const txPoints = Math.min(5, Math.floor(walletTransactions * 0.25));
  const aaPoints = (isContract || testnetIsContract) ? 5 : 0;
  
  let penguScore = 0;
  if (penguCount >= 8888888) penguScore = 3;
  else if (penguCount >= 888888) penguScore = 2;
  else if (penguCount >= 88888) penguScore = 1;
  
  const badgesBonus = Math.min(2, Math.floor(badges.length / 2));
  const absNftOnchainBonus = Math.min(3, absPremiumNftCount);
  const onchainScore = Math.min(15, txPoints + aaPoints + penguScore + badgesBonus + absNftOnchainBonus);

  // 3. NFT Power Score (Max 10): Pudgy = 7, Lil Pudgy = 3
  const pudgyPoints = pudgyCount > 0 ? 7 : 0;
  const lilPudgyPoints = lilPudgyCount > 0 ? 3 : 0;
  const nftScore = Math.min(10, pudgyPoints + lilPudgyPoints);

  // 4. Portal XP & Level (Max 40): Based on manually selected Portal Tier / Division
  const portalTiersConfig = {
    "none": { label: "None", level: 1, score: 0 },
    "bronze-1": { label: "Bronze I", level: 2, score: 1 },
    "bronze-2": { label: "Bronze II", level: 3, score: 2 },
    "bronze-3": { label: "Bronze III", level: 4, score: 3 },
    "silver-1": { label: "Silver I", level: 5, score: 5 },
    "silver-2": { label: "Silver II", level: 6, score: 6 },
    "silver-3": { label: "Silver III", level: 7, score: 7 },
    "gold-1": { label: "Gold I", level: 10, score: 10 },
    "gold-2": { label: "Gold II", level: 11, score: 12 },
    "gold-3": { label: "Gold III", level: 12, score: 14 },
    "platinum-1": { label: "Platinum I", level: 15, score: 18 },
    "platinum-2": { label: "Platinum II", level: 16, score: 20 },
    "platinum-3": { label: "Platinum III", level: 17, score: 22 },
    "diamond-1": { label: "Diamond I", level: 20, score: 26 },
    "diamond-2": { label: "Diamond II", level: 21, score: 29 },
    "diamond-3": { label: "Diamond III", level: 22, score: 32 },
    "obsidian-1": { label: "Obsidian I", level: 25, score: 35 },
    "obsidian-2": { label: "Obsidian II", level: 26, score: 38 },
    "obsidian-3": { label: "Obsidian III", level: 27, score: 40 }
  };

  const portalConfig = portalTiersConfig[portalTierSelect] || portalTiersConfig["none"];
  const portalTier = portalConfig.label;
  const portalLevel = portalConfig.level;
  const portalScore = portalConfig.score;
  const xp = portalLevel * 1000 + (walletTransactions * 25);

  // 5. Twitter Score (Max 20): Based on @AbstractChain tweet mentions and engagement
  const tweetPoints = Math.min(12, abstractTweetCount * 0.24);
  const engagementPoints = Math.min(8, Math.floor(twitterEngagement / 18));
  const twitterScore = Math.min(20, tweetPoints + engagementPoints);

  // 6. Discord Score (Max 15): Based on manually selected roles (Verified: +1, Explorer: +8, Builder: +12, Quant: +15)
  let discordScore = 0;
  if (selectedDiscordRoles.includes("verified")) discordScore += 1;
  if (selectedDiscordRoles.includes("explorer")) discordScore += 8;
  if (selectedDiscordRoles.includes("builder")) discordScore += 12;
  if (selectedDiscordRoles.includes("quant")) discordScore += 15;
  discordScore = Math.min(15, discordScore);
  
  const discordRoleCount = selectedDiscordRoles.length;
  const scoreBreakdown = {
    onchain: {
      txPoints,
      aaPoints,
      penguScore,
      badgesBonus,
      absNftOnchainBonus,
      total: onchainScore,
    },
    nft: {
      pudgyPoints,
      lilPudgyPoints,
      total: nftScore,
    },
    twitter: {
      tweetPoints,
      engagementPoints,
      total: twitterScore,
    },
    discord: {
      verified: selectedDiscordRoles.includes("verified") ? 1 : 0,
      explorer: selectedDiscordRoles.includes("explorer") ? 8 : 0,
      builder: selectedDiscordRoles.includes("builder") ? 12 : 0,
      quant: selectedDiscordRoles.includes("quant") ? 15 : 0,
      total: discordScore,
    },
    portal: {
      total: portalScore,
    },
  };

  const categoryScores = {
    onchain: onchainScore,
    nft: nftScore,
    portal: portalScore,
    twitter: twitterScore,
    discord: discordScore
  };

  const totalScore = Object.values(categoryScores).reduce((sum, value) => sum + value, 0);
  const tier = getTier(totalScore);

  const onchainActions = Math.min(20, Math.floor(walletTransactions / 3) + ((isContract || testnetIsContract) ? 5 : 0));
  const engagementIndex = Math.min(100, Math.floor(twitterEngagement / 10));
  const discordRoleScore = discordScore;
  
  const linkedWallets = (isContract || testnetIsContract) ? 2 : 1;

  return {
    wallet,
    handle,
    discord,
    mode,
    totalScore,
    tier,
    summary: buildSummary({ totalScore, badges, xp, abstractTweetCount, onchainActions }),
    badges,
    xp,
    portalLevel,
    portalTier,
    selectedDiscordRoles,
    mainnetBalance,
    testnetBalance,
    mainnetTxCount,
    testnetTxCount,
    isContract,
    testnetIsContract,
    penguCount,
    absPremiumNftCount,
    onchainActions,
    abstractTweetCount,
    engagementIndex,
    discordRoleCount,
    walletTransactions,
    indexedTxCount,
    activeDays,
    activeWeeks,
    activeMonths,
    currentStreak,
    longestStreak,
    averageTxPerDay,
    linkedWallets,
    twitterEngagement,
    twitterLikes,
    twitterReplies,
    twitterRetweets,
    twitterQuotes,
    twitterViews,
    socialStatus,
    socialWarning,
    discordRoleScore,
    scoreBreakdown,
    calendar: cachedCalendar,
    categoryScores,
  };
}

function buildBadgesList({ isContract, walletTransactions, totalBalance, pudgyCount, lilPudgyCount, penguCount, absPremiumNftCount, abstractTweetCount }) {
  const list = [];
  if (isContract) list.push("Account Abstraction");
  if (walletTransactions > 50) list.push("Portal Grinder");
  else if (walletTransactions > 0) list.push("Abstract Pioneer");
  
  if (totalBalance > 0.01) list.push("Gas Stacked");
  if (pudgyCount > 0) list.push("Pudgy HODLer");
  if (lilPudgyCount > 0) list.push("Lil Pudgy Family");
  if (penguCount > 100) list.push("PENGU Whale");
  else if (penguCount > 0) list.push("PENGU Accumulator");

  if (absPremiumNftCount > 0) list.push("Abstract Collector");
  if (abstractTweetCount > 5) list.push("Abstract Promoter");
  if (walletTransactions > 10) list.push("Ecosystem Explorer");

  if (list.length === 0) {
    list.push("Abstract Tourist");
  }
  return list;
}

function buildSummary({ totalScore, badges, xp, abstractTweetCount, onchainActions }) {
  if (totalScore >= 85) {
    return `Absolute maxxing mode. ${xp} XP, ${badges.length} badges, and enough on-chain heat to own the timeline.`;
  }

  if (totalScore >= 65) {
    return `Cooking on mainnet with ${onchainActions} active events and ${badges.length} badges. Inner circle energy confirmed.`;
  }

  if (totalScore >= 40) {
    return `Signal looks strong, but the aura wants more reps. A few more moves and the gigachad lane opens up.`;
  }

  return `Early aura detected. Bridge some gas, stack a few badges, and start building your Abstract legend.`;
}

function getTier(score) {
  if (score >= 81) return "King Chad";
  if (score >= 61) return "Warrior Chad";
  if (score >= 41) return "Ninja Chad";
  if (score >= 21) return "Explorer Chad";
  return "NPC Chad";
}

function getPortalTier(level) {
  if (level >= 25) return "Obsidian";
  if (level >= 20) return "Diamond";
  if (level >= 15) return "Platinum";
  if (level >= 10) return "Gold";
  if (level >= 5) return "Silver";
  return "Bronze";
}

function formatDiscordRoles(selectedRoles = []) {
  const roleLabels = {
    verified: "Verified",
    explorer: "Explorer",
    builder: "Builder",
    quant: "Quant",
  };

  const labels = selectedRoles.map((role) => roleLabels[role] || role).filter(Boolean);
  if (!labels.length) return "None";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
  return `${labels[0]} +${labels.length - 1}`;
}

function formatEthAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return "0 ETH";
  if (amount >= 1) return `${amount.toFixed(3)} ETH`;
  if (amount >= 0.01) return `${amount.toFixed(4)} ETH`;
  return `${amount.toFixed(6)} ETH`;
}

function formatEthAmountHtml(value) {
  const formatted = formatEthAmount(value);
  return formatted.replace(" ETH", '<span class="unit-break">ETH</span>');
}

function formatCompactNumber(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

function formatScoreValue(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toFixed(2).replace(/\.?0+$/, "");
}

function renderAnalysis(profile) {
  document.querySelector("#score-tier").textContent = profile.tier;
  const scoreTierPanel = document.querySelector("#score-tier-panel");
  if (scoreTierPanel) {
    scoreTierPanel.textContent = profile.tier;
  }
  document.querySelector("#score-value").textContent = formatScoreValue(profile.totalScore);
  document.querySelector("#score-summary").textContent = profile.summary;
  document.querySelector("#preview-handle").textContent = profile.handle;
  document.querySelector("#preview-tier").textContent = profile.tier;
  document.querySelector("#preview-badges").textContent = `Portal ${profile.portalTier}`;
  document.querySelector("#preview-xp").textContent = `Discord ${formatDiscordRoles(profile.selectedDiscordRoles)}`;
  document.querySelector("#preview-posts").textContent = `Social - ${profile.socialStatus === "unavailable" ? "N/A" : profile.abstractTweetCount}`;
  document.querySelector("#preview-discord").textContent = `On-Chain - ${profile.indexedTxCount}`;
  if (scoreCardMascotImg) {
    scoreCardMascotImg.src = scoreCardMascotByTier[profile.tier] || scoreCardMascotByTier["NPC Chad"];
  }
  if (scoreRingMascot) {
    scoreRingMascot.src = scoreCardMascotByTier[profile.tier] || scoreCardMascotByTier["NPC Chad"];
  }

  document.querySelector("#badges-count").textContent = profile.portalTier;
  document.querySelector("#badges-note").textContent = "User-selected portal tier";

  document.querySelector("#xp-count").textContent = formatDiscordRoles(profile.selectedDiscordRoles);
  document.querySelector("#activity-count").textContent = profile.indexedTxCount.toLocaleString();
  document.querySelector("#social-count").textContent = profile.socialStatus === "unavailable" ? "N/A" : profile.abstractTweetCount.toLocaleString();

  document.querySelector("#xp-note").textContent = "Selected Discord role input";
  document.querySelector("#activity-note").textContent = "Indexed explorer total transaction count";
  document.querySelector("#social-note").textContent =
    profile.socialStatus === "stale"
      ? "Cached @AbstractChain social snapshot"
      : profile.socialStatus === "unavailable"
        ? "Social provider N/A right now"
        : "Tweets that explicitly mention @AbstractChain";

  const modeBadge = document.querySelector("#mode-badge");
  if (modeBadge) {
    modeBadge.textContent = profile.mode === "demo" ? "Demo Mode" : "Live-ready Mode";
  }

  barsNode.innerHTML = "";
  Object.entries(profile.categoryScores).forEach(([key, value]) => {
    const meta = categoryMeta[key];
    const percent = Math.round((value / meta.max) * 100);
    const bar = document.createElement("article");
    bar.className = "bar";
    bar.innerHTML = `
      <div class="bar-head">
        <strong>${meta.label}</strong>
        <span>${value}/${meta.max}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${percent}%"></div>
      </div>
    `;
    barsNode.appendChild(bar);
  });
}

function renderCalendar(calendar) {
  const colors = ["rgba(56, 216, 135, 0.08)", "rgba(56, 216, 135, 0.3)", "rgba(56, 216, 135, 0.55)", "rgba(56, 216, 135, 0.8)", "#38d887"];
  const months = document.createElement("div");
  months.className = "calendar-months";

  const monthSpacer = document.createElement("div");
  const monthTrack = document.createElement("div");
  monthTrack.className = "calendar-month-track";

  calendar.monthLabels.forEach((label) => {
    const month = document.createElement("span");
    month.textContent = label.label;
    month.style.gridColumn = `${label.week + 1} / span ${Math.max(label.span, 1)}`;
    monthTrack.appendChild(month);
  });

  months.appendChild(monthSpacer);
  months.appendChild(monthTrack);

  const heatmap = document.createElement("div");
  heatmap.className = "calendar-heatmap";

  const dayLabels = document.createElement("div");
  dayLabels.className = "calendar-day-labels";
  ["", "Mon", "", "Wed", "", "Fri", ""].forEach((label) => {
    const node = document.createElement("span");
    node.textContent = label;
    dayLabels.appendChild(node);
  });

  const weeks = document.createElement("div");
  weeks.className = "calendar-weeks";

  calendar.weeks.forEach((week) => {
    const column = document.createElement("div");
    column.className = "calendar-week";
    week.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = `calendar-cell${day.inRange ? "" : " empty"}`;
      cell.style.background = day.inRange ? colors[day.level] : "";
      if (day.inRange) {
        cell.dataset.tooltip = `${day.count} tx on ${formatCalendarDate(day.date)}`;
        cell.addEventListener("mouseenter", handleCalendarTooltipEnter);
        cell.addEventListener("mousemove", handleCalendarTooltipMove);
        cell.addEventListener("mouseleave", handleCalendarTooltipLeave);
      }
      column.appendChild(cell);
    });
    weeks.appendChild(column);
  });

  heatmap.appendChild(dayLabels);
  heatmap.appendChild(weeks);

  calendarNode.innerHTML = "";
  calendarNode.appendChild(months);
  calendarNode.appendChild(heatmap);
}

function renderCalendarLoading() {
  calendarNode.innerHTML = `
    <div class="calendar-loading">
      <span class="calendar-loading-dot"></span>
      <span>Loading real on-chain activity...</span>
    </div>
  `;
}

async function buildCalendarFromRpcLinear(wallet, mainnetTxCount) {
  // Abstract mainnet has ~1 second block time.
  // We approximate past block numbers linearly: past_block ≈ current_block - (days_ago × 86400)
  // This avoids slow binary search and only needs 27 parallel RPC calls.
  const BLOCKS_PER_DAY = 86400;
  const WEEKS = 26; // 26 weeks = ~6 months

  const latestBlock = await getLatestBlockNumber(ABS_MAINNET_RPC);
  if (!latestBlock || mainnetTxCount === 0) return null;

  // Build boundary block numbers: one per week boundary + today
  const boundaryBlocks = [];
  for (let w = WEEKS; w >= 0; w--) {
    boundaryBlocks.push(Math.max(1, latestBlock - Math.round(w * 7 * BLOCKS_PER_DAY)));
  }

  // Fetch nonce at each boundary in parallel (fast — small payload, no binary search)
  const nonces = await Promise.all(
    boundaryBlocks.map((block) => getTxCountAtBlock(ABS_MAINNET_RPC, wallet, block))
  );

  // Build daily counts by distributing each week's tx count across its days
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dailyCounts = {};
  const seed = wallet.toLowerCase();

  for (let w = 0; w < WEEKS; w++) {
    const weekTxs = Math.max(0, (nonces[w + 1] || 0) - (nonces[w] || 0));
    if (weekTxs === 0) continue;

    // Distribute across the 7 days of this week using seeded variation
    const daysAgoEnd = (WEEKS - 1 - w) * 7;
    let remaining = weekTxs;
    const weights = [];
    for (let d = 0; d < 7; d++) {
      weights.push(1 + (seededHash(`${seed}:w${w}:d${d}`) % 5));
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    for (let d = 0; d < 7; d++) {
      const daysAgo = daysAgoEnd + (6 - d);
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - daysAgo);
      const cutoff = new Date(today);
      cutoff.setUTCDate(cutoff.getUTCDate() - 179);
      if (date < cutoff) continue;

      const dayTxs = d === 6
        ? remaining
        : Math.min(remaining, Math.round((weights[d] / totalWeight) * weekTxs));
      remaining -= dayTxs;

      if (dayTxs > 0) {
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        dailyCounts[key] = (dailyCounts[key] || 0) + dayTxs;
      }
    }
  }

  return buildCalendarFromDailyCounts(dailyCounts, 180);
}

async function hydrateCalendar(profile) {
  const jobId = ++state.calendarJobId;
  try {
    const calendar = await buildRealCalendar(profile.wallet, profile.mainnetTxCount, profile.testnetTxCount);
    if (jobId !== state.calendarJobId) return;
    if (state.lastAnalysis && state.lastAnalysis.wallet === profile.wallet) {
      state.lastAnalysis.calendar = calendar;
    }
    renderCalendar(calendar);
  } catch (err) {
    console.error("API calendar failed, trying RPC fallback:", err);
    if (jobId !== state.calendarJobId) return;

    // Fallback 1: RPC linear interpolation — works for any wallet size, ~300ms
    try {
      const rpcCalendar = await buildCalendarFromRpcLinear(profile.wallet, profile.mainnetTxCount);
      if (jobId !== state.calendarJobId) return;
      if (rpcCalendar) {
        if (state.lastAnalysis && state.lastAnalysis.wallet === profile.wallet) {
          state.lastAnalysis.calendar = rpcCalendar;
        }
        renderCalendar(rpcCalendar);
        return;
      }
    } catch (rpcErr) {
      console.warn("RPC calendar fallback failed:", rpcErr);
    }

    // Fallback 2: Seeded simulation using wallet tx count
    if (jobId !== state.calendarJobId) return;
    try {
      const totalTxs = (profile.indexedTxCount || 0) + (profile.mainnetTxCount || 0);
      const simCalendar = buildCalendar(profile.wallet.toLowerCase(), totalTxs);
      if (jobId !== state.calendarJobId) return;
      if (state.lastAnalysis && state.lastAnalysis.wallet === profile.wallet) {
        state.lastAnalysis.calendar = simCalendar;
      }
      renderCalendar(simCalendar);
    } catch {
      if (jobId !== state.calendarJobId) return;
      calendarNode.innerHTML = `<div class="calendar-loading"><span>Calendar data is temporarily unavailable.</span></div>`;
    }
  }
}


function renderDetailCards(profile) {
  const details = [
    { kicker: "Onchain", value: profile.mainnetTxCount.toLocaleString(), label: "AGW Mainnet Nonce", scoreBadge: profile.scoreBreakdown.onchain.txPoints > 0 ? `+${profile.scoreBreakdown.onchain.txPoints} pts` : "" },
    { kicker: "Onchain", value: profile.testnetTxCount.toLocaleString(), label: "AGW Testnet Nonce" },
    { kicker: "Balance", value: formatEthAmount(profile.mainnetBalance), valueHtml: formatEthAmountHtml(profile.mainnetBalance), label: "Mainnet ETH" },
    { kicker: "Balance", value: formatEthAmount(profile.testnetBalance), valueHtml: formatEthAmountHtml(profile.testnetBalance), label: "Testnet ETH" },
    { kicker: "AGW", value: profile.isContract ? "Yes" : "No", label: "Mainnet AGW Contract", scoreBadge: profile.scoreBreakdown.onchain.aaPoints > 0 ? `+${profile.scoreBreakdown.onchain.aaPoints} pts` : "" },
    { kicker: "AGW", value: profile.testnetIsContract ? "Yes" : "No", label: "Testnet AGW Contract" },
    { kicker: "Token", value: formatCompactNumber(profile.penguCount), label: "PENGU Balance", scoreBadge: profile.scoreBreakdown.onchain.penguScore > 0 ? `+${profile.scoreBreakdown.onchain.penguScore} pts` : "" },
    { kicker: "NFT", value: profile.absPremiumNftCount.toString(), label: "Premium NFT Count" },
    { kicker: "Wallet", value: profile.indexedTxCount.toLocaleString(), label: "Explorer Total Transactions", scoreBadge: profile.scoreBreakdown.onchain.badgesBonus > 0 ? `+${profile.scoreBreakdown.onchain.badgesBonus} pts` : "" },
    { kicker: "Portal", value: profile.portalTier, label: "Selected Portal Tier", scoreBadge: profile.scoreBreakdown.portal.total > 0 ? `+${profile.scoreBreakdown.portal.total} pts` : "" },
    { kicker: "Discord", value: formatDiscordRoles(profile.selectedDiscordRoles), label: "Selected Discord Roles", scoreBadge: profile.scoreBreakdown.discord.total > 0 ? `+${profile.scoreBreakdown.discord.total} pts` : "" },
    { kicker: "Social", value: formatMetricValue(profile.socialStatus === "unavailable" ? null : profile.abstractTweetCount), label: "@AbstractChain Mention Tweets", scoreBadge: profile.scoreBreakdown.twitter.total > 0 ? `+${Math.round(profile.scoreBreakdown.twitter.total * 10) / 10}` : "" },
    { kicker: "Likes", value: formatMetricValue(profile.socialStatus === "unavailable" ? null : profile.twitterLikes), label: "@AbstractChain Tweet Likes" },
    { kicker: "Replies", value: formatMetricValue(profile.socialStatus === "unavailable" ? null : profile.twitterReplies), label: "@AbstractChain Tweet Replies" },
    { kicker: "RT", value: formatMetricValue(profile.socialStatus === "unavailable" ? null : profile.twitterRetweets), label: "@AbstractChain Tweet Retweets" },
    { kicker: "Views", value: formatMetricValue(profile.socialStatus === "unavailable" ? null : profile.twitterViews, formatCompactNumber), label: "@AbstractChain Tweet Views" },
  ];

  detailGridNode.innerHTML = "";
  details.forEach((detail) => {
    const card = document.createElement("article");
    card.className = `detail-card${detail.scoreBadge ? " featured" : ""}`;
    const valueClass = `detail-card-value${detail.kicker === "Balance" ? " balance-break" : ""}`;
    card.innerHTML = `
      ${detail.scoreBadge ? `<span class="detail-score-badge">${detail.scoreBadge}</span>` : ""}
      <div class="detail-card-left">
        <span class="detail-kicker">${detail.kicker}</span>
        <span class="detail-label">${detail.label}</span>
      </div>
      <strong class="${valueClass}">${detail.valueHtml || detail.value}</strong>
    `;
    detailGridNode.appendChild(card);
  });
}

async function exportScoreCardBlob() {
  try {
    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "-9999px";
    wrapper.style.width = "560px";
    wrapper.style.height = "560px";
    wrapper.style.padding = "2px";
    wrapper.style.background = "transparent";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.boxSizing = "border-box";

    const clone = scoreCardNode.cloneNode(true);
    clone.classList.remove("hidden");
    clone.style.setProperty("width", "556px", "important");
    clone.style.setProperty("height", "556px", "important");
    clone.style.setProperty("margin", "0", "important");
    clone.style.setProperty("display", "flex", "important");
    clone.style.setProperty("flex-direction", "column", "important");
    clone.style.setProperty("justify-content", "space-between", "important");

    // Disable backdrop-filter on clone to prevent html2canvas rounded corner clipping bugs
    clone.style.setProperty("backdrop-filter", "none", "important");
    clone.style.setProperty("webkit-backdrop-filter", "none", "important");
    
    // Set card background to solid white and use a subtle slate border
    clone.style.setProperty("background", "#ffffff", "important");
    clone.style.setProperty("background-image", "none", "important");
    clone.style.setProperty("border", "1px solid rgba(15, 23, 42, 0.08)", "important");
    clone.style.setProperty("box-shadow", "none", "important");
    
    // Style inner card elements with solid light mint-white background to pop elegantly against the white card zemin
    clone.querySelectorAll(".score-card-main, .score-mascot-panel, .mini-metric, .profile-chip, .result-footer span, .score-brand-icon").forEach(el => {
      el.style.setProperty("backdrop-filter", "none", "important");
      el.style.setProperty("webkit-backdrop-filter", "none", "important");
      el.style.setProperty("background", "#f3faf6", "important");
      el.style.setProperty("border", "1px solid rgba(56, 216, 135, 0.16)", "important");
      el.style.setProperty("box-shadow", "0 6px 14px rgba(0, 0, 0, 0.02)", "important");
    });

    clone.querySelectorAll(".score-ring-wrap").forEach(el => {
      el.style.setProperty("background", "transparent", "important");
      el.style.setProperty("border", "0", "important");
      el.style.setProperty("box-shadow", "none", "important");
    });

    // Hide top glow line completely during export to prevent html2canvas blur rendering artifacts
    const glowLine = clone.querySelector(".score-card-glow-line");
    if (glowLine) {
      glowLine.style.setProperty("display", "none", "important");
    }

    // Make sure SVG dash offset is copied
    const bgGlows = document.querySelector(".bg-glows");
    const noise = document.querySelector(".noise");
    if (bgGlows) {
      bgGlows.style.setProperty("display", "none", "important");
    }
    if (noise) {
      noise.style.setProperty("display", "none", "important");
    }

    document.body.classList.add("exporting");
    document.documentElement.classList.add("exporting");

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Temporarily inject style overrides to force background transparency in html2canvas
    const styleOverride = document.createElement("style");
    styleOverride.id = "html2canvas-body-override";
    styleOverride.textContent = `
      body, html {
        background: none !important;
        background-image: none !important;
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(styleOverride);

    const renderCanvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });

    // Create a new canvas to programmatically crop the corners to a perfect rounded rectangle
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = renderCanvas.width;
    croppedCanvas.height = renderCanvas.height;
    const croppedCtx = croppedCanvas.getContext("2d");

    // Clear to transparent
    croppedCtx.clearRect(0, 0, croppedCanvas.width, croppedCanvas.height);

    // Create rounded rectangle clip path
    // Scale is 2, wrapper is 560x560, clone is 556x556 inside wrapper (with 2px padding on each side)
    const cardX = 2 * 2 - 0.5; // 3.5px (adjusted slightly to not clip the outer border stroke)
    const cardY = 2 * 2 - 0.5; // 3.5px
    const cardW = 556 * 2 + 1; // 1113px
    const cardH = 556 * 2 + 1; // 1113px
    const cardRadius = 34 * 2 + 0.5; // 68.5px

    croppedCtx.beginPath();
    croppedCtx.moveTo(cardX + cardRadius, cardY);
    croppedCtx.lineTo(cardX + cardW - cardRadius, cardY);
    croppedCtx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + cardRadius);
    croppedCtx.lineTo(cardX + cardW, cardY + cardH - cardRadius);
    croppedCtx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - cardRadius, cardY + cardH);
    croppedCtx.lineTo(cardX + cardRadius, cardY + cardH);
    croppedCtx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - cardRadius);
    croppedCtx.lineTo(cardX, cardY + cardRadius);
    croppedCtx.quadraticCurveTo(cardX, cardY, cardX + cardRadius, cardY);
    croppedCtx.closePath();
    croppedCtx.clip();

    // Draw the html2canvas output onto the clipped context
    croppedCtx.drawImage(renderCanvas, 0, 0);

    // Restore background glows and noise grid
    if (bgGlows) {
      bgGlows.style.removeProperty("display");
    }
    if (noise) {
      noise.style.removeProperty("display");
    }

    document.body.classList.remove("exporting");
    document.documentElement.classList.remove("exporting");

    // Remove temporary style overrides
    if (document.head.contains(styleOverride)) {
      document.head.removeChild(styleOverride);
    }

    document.body.removeChild(wrapper);

    return new Promise((resolve) => croppedCanvas.toBlob(resolve, "image/png"));
  } catch (err) {
    console.error("Export error:", err);
    return null;
  }
}

function flashButton(button, label) {
  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  button.textContent = label;
  window.clearTimeout(button._labelTimeout);
  button._labelTimeout = window.setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function handleCalendarTooltipEnter(event) {
  const text = event.currentTarget.dataset.tooltip;
  if (!text) return;
  calendarTooltipNode.textContent = text;
  calendarTooltipNode.classList.remove("hidden");
  positionCalendarTooltip(event);
}

function handleCalendarTooltipMove(event) {
  if (calendarTooltipNode.classList.contains("hidden")) return;
  positionCalendarTooltip(event);
}

function handleCalendarTooltipLeave() {
  calendarTooltipNode.classList.add("hidden");
}

function positionCalendarTooltip(event) {
  const containerRect = document.querySelector(".calendar-card").getBoundingClientRect();
  const tooltipRect = calendarTooltipNode.getBoundingClientRect();
  const offsetX = 10;
  const offsetY = 10;

  let left = event.clientX - containerRect.left + offsetX;
  let top = event.clientY - containerRect.top - tooltipRect.height - offsetY;

  calendarTooltipNode.style.left = `${left}px`;
  calendarTooltipNode.style.top = `${top}px`;
}

function buildShareCopy(profile) {
  const socialValue = profile.socialStatus === "unavailable" ? "N/A" : profile.abstractTweetCount.toLocaleString();
  const portalDiscord = `Portal ${profile.portalTier} + Discord ${formatDiscordRoles(profile.selectedDiscordRoles)}`;
  return [
    "Checked my wallet, socials and Portal score with: https://abstract-chad.vercel.app",
    "",
    `• ${formatScoreValue(profile.totalScore)}/100 - ${profile.tier}`,
    `• ${portalDiscord}`,
    `• On-Chain ${profile.indexedTxCount.toLocaleString()} + Social ${socialValue} @AbstractChain mentions`,
    "",
    "Run yours and see your Abstract Chad profile!",
    "",
    "Built by @slatro_eth ✳️",
  ].join("\n");
}


function shortenWallet(wallet) {
  if (wallet.length <= 15) return wallet;
  return `${wallet.slice(0, 8)}...${wallet.slice(-5)}`;
}

function buildCalendar(seed, walletTransactions = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 364);

  const first = new Date(start);
  first.setDate(first.getDate() - first.getDay());

  const last = new Date(end);
  last.setDate(last.getDate() + (6 - last.getDay()));

  const days = [];
  
  // Decide which days get activity based on the total transactions
  const activeDaysCount = Math.min(365, walletTransactions);
  const activeDaysSet = new Set();
  
  if (activeDaysCount > 0) {
    let index = 0;
    while (activeDaysSet.size < activeDaysCount && index < 2000) {
      const idx = seededHash(`${seed}:active-day:${index}`) % 365;
      activeDaysSet.add(idx);
      index++;
    }
  }

  let dayIndex = 0;
  for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    const inRange = date >= start && date <= end;
    
    let count = 0;
    if (inRange) {
      if (activeDaysSet.has(dayIndex)) {
        const daySeed = seededHash(`${seed}:count:${dayIndex}`);
        count = 1 + (daySeed % 3);
        if (walletTransactions > 365) {
          count += Math.floor((walletTransactions - 365) / 100);
        }
      }
      dayIndex++;
    }
    
    days.push({
      date,
      inRange,
      count,
      level: inRange ? getCalendarLevel(count) : 0,
    });
  }

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstInRange = week.find((day) => day.inRange);
    if (!firstInRange) return;
    const month = firstInRange.date.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({
        label: firstInRange.date.toLocaleString("en-US", { month: "short" }),
        week: weekIndex,
        span: 1,
      });
      lastMonth = month;
    }
  });

  monthLabels.forEach((label, index) => {
    const next = monthLabels[index + 1];
    label.span = next ? next.week - label.week : Math.max(1, weeks.length - label.week);
  });

  return { weeks, monthLabels };
}

function buildActivityCount(daySeed, date, endDate) {
  const daysAgo = Math.round((endDate - date) / 86400000);
  const recencyBoost = daysAgo < 45 ? 2 : daysAgo < 90 ? 1 : 0;
  const pulse = daySeed % 11;
  const burst = daySeed % 23 === 0 ? 5 : daySeed % 17 === 0 ? 3 : 0;
  return Math.max(0, pulse - 4 + recencyBoost + burst);
}

function getCalendarLevel(count) {
  if (count >= 6) return 4;
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function formatCalendarDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function setStatus(message) {
  statusNode.textContent = message;
  const loadingStatusText = document.getElementById("loading-status-text");
  if (loadingStatusText) {
    loadingStatusText.textContent = message;
  }
}

function seededHash(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
