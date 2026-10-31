const { getSession } = require("../_hubspot-session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const configured = Boolean(
    process.env.HUBSPOT_CLIENT_ID &&
    process.env.HUBSPOT_CLIENT_SECRET &&
    process.env.HUBSPOT_REDIRECT_URI &&
    process.env.HUBSPOT_COOKIE_SECRET
  );
  let session = null;
  try { session = configured ? getSession(req) : null; } catch {}
  return res.status(200).json({
    configured,
    connected: Boolean(session),
    hubId: session && session.hubId ? session.hubId : null,
    expiresAt: session ? session.expiresAt : null
  });
};
