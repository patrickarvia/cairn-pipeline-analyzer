const crypto = require("crypto");
const { setState } = require("../_hubspot-session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
  if (!clientId || !redirectUri || !process.env.HUBSPOT_COOKIE_SECRET) {
    return res.status(503).json({ error: "HubSpot integration is not configured yet." });
  }

  const state = crypto.randomBytes(24).toString("base64url");
  setState(res, state);

  const url = new URL("https://app.hubspot.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "oauth crm.objects.deals.read crm.schemas.deals.read");
  url.searchParams.set("state", state);

  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, url.toString());
};
