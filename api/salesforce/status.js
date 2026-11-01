const { getSession } = require("../_salesforce-session");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const configured = Boolean(process.env.SALESFORCE_CLIENT_ID &&
    process.env.SALESFORCE_CLIENT_SECRET && process.env.SALESFORCE_REDIRECT_URI &&
    process.env.SALESFORCE_COOKIE_SECRET);
  let session = null;
  try { session = configured ? getSession(req) : null; } catch {}
  return res.status(200).json({
    configured, connected: Boolean(session),
    orgId: session ? session.orgId : null,
    expiresAt: session ? session.expiresAt : null
  });
};
