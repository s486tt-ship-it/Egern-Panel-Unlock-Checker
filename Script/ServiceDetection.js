/* =========================================================
 * 流媒体&AI服务解锁检测
 * 初始版本摘取自：
 * https://github.com/jnlaoshu/MySelf/blob/main/Script/ServiceDetection.js
 * 修改自：
 * https://github.com/ByteValley/NetTool/blob/main/Scripts/Panel/network_info.js
 * ========================================================= */

const CONSTS = Object.freeze({
  SD_MIN_TIMEOUT: 2000,
  LOG_RING_MAX: 50,
  BUDGET_HARD_MS: 10000,
  BUDGET_SOFT_GUARD_MS: 260
});

const SD_STR = {
  "zh-Hans": {
    panelTitle: "流媒体&AI服务解锁检测",
    policy: "节点策略",
    unlocked: "已解锁",
    partialUnlocked: "部分解锁",
    notReachable: "不可达",
    timeout: "超时",
    fail: "失败",
    regionBlocked: "区域限制",
    nfFull: "完整解锁",
    nfOriginals: "仅自制剧",
    debug: "调试"
  },
  "zh-Hant": {
    panelTitle: "流媒体&AI解锁侦测",
    policy: "节点策略",
    unlocked: "已解锁",
    partialUnlocked: "部分解锁",
    notReachable: "不可达",
    timeout: "逾时",
    fail: "失败",
    regionBlocked: "区域限制",
    nfFull: "完整解锁",
    nfOriginals: "仅自制剧",
    debug: "除错"
  }
};

const ICON_PRESET_MAP = {
  wifi: "wifi.router",
  globe: "globe.asia.australia",
  gamecontroller: "gamecontroller.fill",
  play: "play.tv.fill",
  bolt: "bolt.fill"
};

const $args = parseArgs(typeof $argument !== "undefined" ? $argument : undefined);

const KVStore = (() => {
  if (typeof $prefs !== "undefined") return { read: $prefs.valueForKey, write: $prefs.setValueForKey };
  if (typeof $persistentStore !== "undefined") return { read: $persistentStore.read, write: $persistentStore.write };
  return { read: () => null, write: () => {} };
})();

function parseArgs(raw) {
  if (!raw || typeof raw !== "string") return raw || {};
  return raw.split("&").reduce((acc, kv) => {
    const [k, v] = kv.split("=");
    if (k) acc[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, "%20"));
    return acc;
  }, {});
}

function readBoxSettings() {
  try {
    const raw = KVStore.read("Panel");
    if (!raw) return {};
    const panel = typeof raw === "string" ? JSON.parse(raw) : raw;
    return panel?.NetworkInfo?.Settings || panel?.Settings || {};
  } catch {
    return {};
  }
}

const BOX = readBoxSettings();

function ENV(key, defVal) {
  const val = $args[key] ?? BOX[key];
  if (val === undefined || val === null || val === "") return defVal;
  if (typeof defVal === "boolean") {
    const s = String(val).toLowerCase();
    return ["1", "true", "on", "yes", "y"].includes(s);
  }
  if (typeof defVal === "number") return Number(val) || defVal;
  return val;
}

const CFG = {
  Timeout: ENV("Timeout", 12),
  BUDGET_SEC_RAW: ENV("BUDGET", 0),
  TW_FLAG_MODE: ENV("TW_FLAG_MODE", 1),
  Icon: ENV("Icon", "") || ICON_PRESET_MAP[ENV("IconPreset", "gamecontroller")] || "gamecontroller.fill",
  IconColor: ENV("IconColor", "#FF2D55"),
  SD_STYLE: ENV("SD_STYLE", "icon"),
  SD_REGION_MODE: ENV("SD_REGION_MODE", "full"),
  SD_ICON_THEME: ENV("SD_ICON_THEME", "check"),
  SD_ARROW: ENV("SD_ARROW", true),
  SD_SHOW_LAT: ENV("SD_SHOW_LAT", true),
  SD_SHOW_HTTP: ENV("SD_SHOW_HTTP", true),
  SD_LANG: ENV("SD_LANG", "zh-Hans").toLowerCase() === "zh-hant" ? "zh-Hant" : "zh-Hans",
  SD_CONCURRENCY: ENV("SD_CONCURRENCY", 6),
  SERVICES_ARG_TEXT: $args.SERVICES || BOX.SERVICES_TEXT || BOX.SERVICES || null,
  LOG: ENV("LOG", true),
  LOG_TO_PANEL: ENV("LOG_TO_PANEL", false)
};

const t = (key) => (SD_STR[CFG.SD_LANG] || SD_STR["zh-Hans"])[key] || key;
const SD_TIMEOUT_MS = Math.max(CONSTS.SD_MIN_TIMEOUT, (CFG.Timeout || 8) * 1000);

const SD_ICONS = {
  lock: { full: "🔓", partial: "🔐", blocked: "🔒" },
  circle: { full: "⭕️", partial: "⛔️", blocked: "🚫" },
  check: { full: "✅", partial: "❇️", blocked: "❎" }
}[CFG.SD_ICON_THEME] || { full: "✅", partial: "❇️", blocked: "❎" };

const DEBUG_LINES = [];

function log(msg) {
  if (!CFG.LOG) return;
  const line = `[SD] ${msg}`;
  console.log(line);
  DEBUG_LINES.push(line);
  if (DEBUG_LINES.length > CONSTS.LOG_RING_MAX) DEBUG_LINES.shift();
}

const BUDGET_MS = CFG.BUDGET_SEC_RAW > 0
  ? Math.max(3500, CFG.BUDGET_SEC_RAW * 1000)
  : Math.min(CONSTS.BUDGET_HARD_MS, Math.max(5500, CFG.Timeout * 1000));
const DEADLINE = Date.now() + BUDGET_MS;
const budgetLeft = () => Math.max(0, DEADLINE - Date.now());

function httpCall(method, { url, headers, body }, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    if (typeof $httpClient === "undefined") return reject("no-$httpClient");
    if (budgetLeft() <= CONSTS.BUDGET_SOFT_GUARD_MS) return reject("budget-empty");

    const options = {
      url,
      headers,
      body,
      timeout: Math.min(timeoutMs || SD_TIMEOUT_MS, budgetLeft() - 200)
    };

    const start = Date.now();
    $httpClient[method.toLowerCase()](options, (err, resp, data) => {
      const cost = Date.now() - start;
      if (err) return reject(err);
      resolve({ status: resp?.status || 0, headers: resp?.headers || {}, data, cost });
    });
  });
}

const httpGet = (url, headers = {}) => httpCall("get", { url, headers });

async function sd_req(url, opts = {}) {
  try {
    const res = await httpGet(url, {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      ...opts.headers
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, status: 0, cost: 0, data: "", err: String(e) };
  }
}

const SD_I18N = {
  youTube: "YouTube Premium",
  chatgpt: "ChatGPT Web",
  chatgpt_app: "ChatGPT App",
  gemini: "Gemini",
  claude: "Claude",
  netflix: "Netflix",
  disney: "Disney+",
  tiktok: "TikTok",
  spotify: "Spotify",
  huluUS: "Hulu(US)",
  huluJP: "Hulu(JP)",
  hbo: "Max(HBO)"
};

const SD_TESTS = {
  youtube: async () => {
    const r = await sd_req("https://www.youtube.com/premium?hl=en");
    if (!r.ok) return mkRes(SD_I18N.youTube, r, false, t("fail"));
    const cc = (r.data.match(/\"countryCode\":\"([A-Z]{2})\"/)?.[1]) || "US";
    return mkRes(SD_I18N.youTube, r, true, "", cc);
  },
  gemini: async () => {
    const r = await sd_req("https://gemini.google.com/app");
    if (!r.ok) return mkRes(SD_I18N.gemini, r, false, t("fail"));
    const blocked = /not\s+available|unsupported\s+country|isn.?t\s+available\s+in\s+your\s+country/i.test(r.data) || [451].includes(r.status);
    const cc = await getLandingCC();
    return mkRes(SD_I18N.gemini, r, !blocked, blocked ? t("regionBlocked") : "", cc);
  },
  claude: async () => {
    const r = await sd_req("https://claude.ai/");
    if (!r.ok) return mkRes(SD_I18N.claude, r, false, t("fail"));
    const blocked = /not\s+available|unsupported\s+country|unavailable\s+in\s+your\s+region/i.test(r.data) || [451].includes(r.status);
    const challenged = r.status === 403 && getHeader(r.headers, "cf-mitigated");
    const cc = await getLandingCC();
    if (blocked) return mkRes(SD_I18N.claude, r, false, t("regionBlocked"), cc);
    if (challenged) return mkRes(SD_I18N.claude, r, true, "Challenge", cc, "partial");
    return mkRes(SD_I18N.claude, r, true, "", cc);
  },
  netflix: async () => {
    const check = async (id) => sd_req(`https://www.netflix.com/title/${id}`);
    const r1 = await check("81280792");
    if (!r1.ok) return mkRes(SD_I18N.netflix, r1, false, t("fail"));

    const getCC = (d, h) => (
      h?.["x-originating-url"]?.match(/\/([A-Z]{2})(?:[-/]|$)/i)?.[1] ||
      d.match(/\"countryCode\"\s*:\s*\"([A-Z]{2})\"/i)?.[1] ||
      ""
    ).toUpperCase();

    if ([403, 404].includes(r1.status)) {
      const r2 = await check("80018499");
      if (!r2.ok) return mkRes(SD_I18N.netflix, r2, false, t("fail"));
      if (r2.status === 404) return mkRes(SD_I18N.netflix, r2, false, t("regionBlocked"));
      return mkRes(SD_I18N.netflix, r2, true, t("nfOriginals"), getCC(r2.data, r2.headers), "partial");
    }
    return mkRes(SD_I18N.netflix, r1, true, t("nfFull"), getCC(r1.data, r1.headers), "full");
  },
  disney: async () => {
    const r = await sd_req("https://www.disneyplus.com/");
    if (!r.ok || r.status !== 200) return mkRes(SD_I18N.disney, r, false, t("regionBlocked"));
    let cc = r.data.match(/\"countryCode\"\s*:\s*\"([A-Z]{2})\"/i)?.[1];
    if (!cc) cc = await getLandingCC();
    return mkRes(SD_I18N.disney, r, true, "", cc);
  },
  tiktok: async () => {
    const r = await sd_req("https://www.tiktok.com/");
    if (!r.ok) return mkRes(SD_I18N.tiktok, r, false, t("fail"));
    const blocked = /not\s+available\s+in\s+your\s+(?:region|area|country)|service\s+unavailable/i.test(r.data) || [403, 451].includes(r.status);
    const cc = await getLandingCC();
    return mkRes(SD_I18N.tiktok, r, !blocked, blocked ? t("regionBlocked") : "", cc);
  },
  spotify: async () => {
    const r = await sd_req("https://www.spotify.com/us/premium/");
    if (!r.ok) return mkRes(SD_I18N.spotify, r, false, t("fail"));
    const blocked = /not\s+available\s+in\s+your\s+country|currently\s+not\s+available/i.test(r.data) || [403, 451].includes(r.status);
    const cc = await getLandingCC();
    return mkRes(SD_I18N.spotify, r, !blocked, blocked ? t("regionBlocked") : "", cc);
  },
  chatgpt_web: async () => {
    const r = await sd_req("https://chatgpt.com/cdn-cgi/trace");
    if (!r.ok) return mkRes(SD_I18N.chatgpt, r, false, t("fail"));
    const cc = r.data.match(/loc=([A-Z]{2})/)?.[1] || "";
    return mkRes(SD_I18N.chatgpt, r, true, "", cc);
  },
  chatgpt_app: async () => {
    const r = await sd_req("https://api.openai.com/v1/models");
    if (!r.ok) return mkRes(SD_I18N.chatgpt_app, r, false, t("fail"));
    let cc = r.headers["cf-ipcountry"] || r.headers["CF-IPCountry"];
    if (!cc) cc = await getLandingCC();
    return mkRes(SD_I18N.chatgpt_app, r, true, "", cc);
  },
  hulu_us: async () => {
    const r = await sd_req("https://www.hulu.com/");
    const blocked = !r.ok || /not\s+available\s+in\s+your\s+region/i.test(r.data);
    return mkRes(SD_I18N.huluUS, r, !blocked, blocked ? t("regionBlocked") : "", blocked ? "" : "US");
  },
  hbo: async () => {
    const r = await sd_req("https://www.max.com/");
    const blocked = !r.ok || /not\s+available/i.test(r.data);
    let cc = r.data.match(/\"countryCode\"\s*:\s*\"([A-Z]{2})\"/i)?.[1];
    if (!cc && !blocked) cc = await getLandingCC();
    return mkRes(SD_I18N.hbo, r, !blocked, blocked ? t("regionBlocked") : "", blocked ? "" : cc);
  }
};

const SD_ALIAS = {
  yt: "youtube",
  youtube: "youtube",
  ytpremium: "youtube",
  "youtubepremium": "youtube",
  gemini: "gemini",
  claude: "claude",
  nf: "netflix",
  netflix: "netflix",
  disney: "disney",
  "disney+": "disney",
  tiktok: "tiktok",
  tt: "tiktok",
  spotify: "spotify",
  sp: "spotify",
  chatgpt: "chatgpt_app",
  gpt: "chatgpt_app",
  hbo: "hbo",
  max: "hbo"
};

async function getLandingCC() {
  const apis = ["http://ip-api.com/json", "https://api.ip.sb/geoip"];
  for (const u of apis) {
    const r = await sd_req(u);
    if (r.ok) {
      try {
        const j = JSON.parse(r.data);
        const c = j.countryCode || j.country_code;
        if (c) return c.toUpperCase();
      } catch {}
    }
  }
  return "";
}

function mkRes(name, r, ok, tag, cc = "", state = null) {
  return { name, ok, cc: cc?.toUpperCase() || "", cost: r.cost, status: r.status, tag, state };
}

function getHeader(headers, name) {
  if (!headers || !name) return "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? headers[key] : "";
}

const CC_TO_CN = {
  HK: "香港",
  TW: "台湾",
  US: "美国",
  JP: "日本",
  SG: "新加坡",
  KR: "韩国",
  GB: "英国",
  UK: "英国",
  CA: "加拿大",
  DE: "德国",
  FR: "法国",
  NL: "荷兰",
  IN: "印度",
  AU: "澳洲",
  TH: "泰国",
  VN: "越南",
  PH: "菲律宾",
  MY: "马来西亚",
  ID: "印尼",
  RU: "俄罗斯",
  TR: "土耳其",
  IT: "意大利",
  CN: "中国",
  BR: "巴西",
  AR: "阿根廷",
  EG: "埃及",
  ZA: "南非",
  MX: "墨西哥"
};

function renderLine({ name, ok, cc, cost, status, tag, state }) {
  const st = state ? state : (ok ? "full" : "blocked");
  const icon = SD_ICONS[st];
  const regionName = CC_TO_CN[cc] || cc || "-";
  const regionText = regionName.trim();
  const extras = [
    (tag && (!/netflix/i.test(name) || CFG.SD_STYLE === "icon" || CFG.SD_ARROW)) ? tag : "",
    CFG.SD_SHOW_LAT && cost ? `${cost}ms` : "",
    CFG.SD_SHOW_HTTP && status ? `HTTP ${status}` : ""
  ].filter(Boolean).join(" , ");
  const sep = CFG.SD_ARROW ? "：" : " , ";

  if (CFG.SD_STYLE === "text") {
    const statusText = ok ? t("unlocked") : t("notReachable");
    const base = `${name}: ${statusText}${sep}${regionText}`;
    return extras ? `${base} , ${extras}` : base;
  }

  const base = `${icon} ${name}${sep}${regionText}`;
  return extras ? `${base} , ${extras}` : base;
}

async function run() {
  log("Start");

  const getPolicy = new Promise((resolve) => {
    if (typeof $httpAPI !== "function") return resolve("");
    $httpAPI("GET", "/v1/requests/recent", null, (data) => {
      const hit = (data?.requests || []).find((i) => i.policyName && i.URL && !/^http:\/\/(127|192|10)/.test(i.URL));
      resolve(hit?.policyName || "");
    });
  });

  let svcs = [];
  try {
    const rawList = typeof CFG.SERVICES_ARG_TEXT === "string"
      ? (CFG.SERVICES_ARG_TEXT.startsWith("[") ? JSON.parse(CFG.SERVICES_ARG_TEXT) : CFG.SERVICES_ARG_TEXT.split(/[, ]+/))
      : Object.keys(SD_TESTS);

    svcs = rawList
      .map((k) => {
        const n = (k || "").trim().toLowerCase();
        return SD_ALIAS[n] || n;
      })
      .filter((k) => SD_TESTS[k]);
  } catch {
    svcs = Object.keys(SD_TESTS);
  }

  if (!svcs.length) svcs = Object.keys(SD_TESTS);
  svcs = [...new Set(svcs)];

  const results = {};
  const queue = [...svcs];
  const runWorker = async () => {
    while (queue.length && budgetLeft() > 300) {
      const key = queue.shift();
      try {
        results[key] = await SD_TESTS[key]();
      } catch {
        results[key] = { name: key, ok: false, tag: t("fail") };
      }
    }
  };

  const threads = Array(Math.min(svcs.length, CFG.SD_CONCURRENCY)).fill(null).map(runWorker);
  await Promise.race([Promise.all(threads), new Promise((resolve) => setTimeout(resolve, BUDGET_MS))]);

  const policyName = await getPolicy;
  const lines = svcs.map((k) => (results[k] ? renderLine(results[k]) : `${t("timeout")}: ${k}`));
  const parts = [];
  if (policyName) parts.push(`${t("policy")}: ${policyName}\n`);
  parts.push(...lines);

  if (CFG.LOG_TO_PANEL && DEBUG_LINES.length) {
    parts.push("\n-- DEBUG --", ...DEBUG_LINES.slice(-5));
  }

  const content = parts.join("\n");
  const finalContent = CFG.SD_LANG === "zh-Hant"
    ? content.replace(/网络/g, "網路").replace(/节点/g, "節點").replace(/解锁/g, "解鎖").replace(/检测/g, "檢測").replace(/失败/g, "失敗")
    : content;

  $done({
    title: t("panelTitle"),
    content: finalContent,
    icon: CFG.Icon,
    "icon-color": CFG.IconColor
  });
}

run().catch((err) => $done({ title: t("panelTitle"), content: `Error: ${err}` }));
