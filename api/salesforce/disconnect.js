const { clearSession } = require("../_salesforce-session");
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  clearSession(res);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ disconnected: true });
};
