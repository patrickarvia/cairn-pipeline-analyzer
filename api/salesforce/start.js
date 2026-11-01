const crypto = require("crypto");
const { setState, setVerifier } = require("../_salesforce-session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.SALESFORCE_CLIENT_ID || !process.env.SALESFORCE_CLIENT_SECRET ||
      !process.env.SALESFORCE_REDIRECT_URI || !process.env.SALESFORCE_COOKIE_SECRET) {
    return res.status(503).json({ error: "Salesforce integration is not configured." });
  }
  const base = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  if (!["https://login.salesforce.com", "https://test.salesforce.com"].includes(base)) {
    return res.status(503).json({ error: "Salesforce login URL is not configured safely." });
  }
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  setState(res, state);
  setVerifier(res, verifier);
  const url = new URL("/services/oauth2/authorize", base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.SALESFORCE_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.SALESFORCE_REDIRECT_URI);
  url.searchParams.set("scope", "api");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, url.toString());
};
