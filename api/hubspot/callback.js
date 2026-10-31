const { consumeState, setSession } = require("../_hubspot-session");

function appUrl() {
  return (process.env.HUBSPOT_APP_URL || "https://cairn-pipeline-analyzer.vercel.app").replace(/\/$/, "");
}

function returnTo(res, params) {
  const url = new URL("/", appUrl());
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return res.redirect(302, url.toString());
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state, error } = req.query;
  if (error) return returnTo(res, { hubspot: "error", reason: String(error) });
  if (!consumeState(req, res, state)) return returnTo(res, { hubspot: "error", reason: "state" });
  if (!code) return returnTo(res, { hubspot: "error", reason: "code" });

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !process.env.HUBSPOT_COOKIE_SECRET) {
    return returnTo(res, { hubspot: "error", reason: "config" });
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: String(code)
    });

    const tokenResponse = await fetch("https://api.hubapi.com/oauth/2026-03/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.message || "OAuth exchange failed");

    const expiresIn = Math.max(60, Math.min(Number(token.expires_in) || 1800, 1800));
    setSession(res, {
      accessToken: token.access_token,
      hubId: token.hub_id || null,
      expiresAt: Date.now() + expiresIn * 1000
    }, expiresIn);

    return returnTo(res, { hubspot: "connected" });
  } catch (err) {
    console.error("HubSpot callback error", err && err.message ? err.message : err);
    return returnTo(res, { hubspot: "error", reason: "exchange" });
  }
};
