const crypto = require("crypto");

const SESSION_COOKIE = "cairn_salesforce";
const STATE_COOKIE = "cairn_salesforce_state";

function secretKey() {
  const secret = process.env.SALESFORCE_COOKIE_SECRET;
  if (!secret || secret.length < 24) throw new Error("SALESFORCE_COOKIE_SECRET must be at least 24 characters.");
  return crypto.createHash("sha256").update(secret).digest();
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf("=");
    return i < 0 ? [part, ""] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

function cookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join("; ");
}

function appendCookie(res, value) {
  const current = res.getHeader("Set-Cookie");
  if (!current) res.setHeader("Set-Cookie", value);
  else res.setHeader("Set-Cookie", Array.isArray(current) ? [...current, value] : [current, value]);
}

function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(v => v.toString("base64url")).join(".");
}

function open(value) {
  if (!value) return null;
  try {
    const [ivRaw, tagRaw, dataRaw] = String(value).split(".");
    if (!ivRaw || !tagRaw || !dataRaw) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataRaw, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const payload = JSON.parse(plaintext);
    if (!payload || !payload.accessToken || !payload.expiresAt || Date.now() >= payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

function setSession(res, payload, maxAge) {
  appendCookie(res, cookie(SESSION_COOKIE, seal(payload), maxAge));
}

function getSession(req) {
  return open(parseCookies(req)[SESSION_COOKIE]);
}

function clearSession(res) {
  appendCookie(res, cookie(SESSION_COOKIE, "", 0));
}

function setState(res, value) {
  appendCookie(res, cookie(STATE_COOKIE, value, 600));
}

function consumeState(req, res, received) {
  const stored = parseCookies(req)[STATE_COOKIE] || "";
  appendCookie(res, cookie(STATE_COOKIE, "", 0));
  if (!stored || !received) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(String(received));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setVerifier(res, verifier) {
  appendCookie(res, cookie("cairn_salesforce_pkce", verifier, 600));
}
function consumeVerifier(req, res) {
  const value = parseCookies(req)["cairn_salesforce_pkce"] || "";
  appendCookie(res, cookie("cairn_salesforce_pkce", "", 0));
  return /^[A-Za-z0-9_-]{43,128}$/.test(value) ? value : null;
}
module.exports = {
  setVerifier,
  consumeVerifier,
  clearSession,
  consumeState,
  getSession,
  setSession,
  setState
};
