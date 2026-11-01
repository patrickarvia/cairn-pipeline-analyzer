const { consumeState, consumeVerifier, setSession } = require("../_salesforce-session");

function returnTo(res, status) {
  const base = (process.env.SALESFORCE_APP_URL || "https://cairn-pipeline-analyzer.vercel.app").replace(/\/$/, "");
  const url = new URL("/", base);
  url.searchParams.set("salesforce", status);
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, url.toString());
}

function isSalesforceInstance(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" &&
      url.port === "" && url.pathname === "/" && !url.search && !url.hash &&
      /^[a-z0-9.-]+\.salesforce\.com$/i.test(url.hostname);
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { code, state, error } = req.query || {};
  if (error) return returnTo(res, "error");
  const valid = consumeState(req, res, state);
  const verifier = consumeVerifier(req, res);
  if (!valid || !verifier || typeof code !== "string") return returnTo(res, "error");
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !process.env.SALESFORCE_COOKIE_SECRET) {
    return returnTo(res, "error");
  }
  const base = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  if (!["https://login.salesforce.com", "https://test.salesforce.com"].includes(base)) return returnTo(res, "error");
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code", code, client_id: clientId,
      client_secret: clientSecret, redirect_uri: redirectUri, code_verifier: verifier
    });
    const response = await fetch(base + "/services/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token || !isSalesforceInstance(token.instance_url)) {
      throw new Error("Invalid Salesforce OAuth token response");
    }
    const orgId = typeof token.id === "string"
      ? (token.id.match(/\/id\/([A-Za-z0-9]{15,18})\//) || [])[1] || null : null;
    // No refresh token or customer records are persisted. Reconnect after 30 minutes.
    setSession(res, {
      accessToken: token.access_token,
      instanceUrl: token.instance_url.replace(/\/$/, ""),
      orgId, expiresAt: Date.now() + 30 * 60 * 1000
    }, 30 * 60);
    return returnTo(res, "connected");
  } catch (err) {
    console.error("Salesforce authorization exchange failed");
    return returnTo(res, "error");
  }
};
