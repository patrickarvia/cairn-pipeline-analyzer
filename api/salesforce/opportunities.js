const { clearSession, getSession } = require("../_salesforce-session");
const API = "/services/data/v65.0";
const STANDARD = {
  Name: "Opportunity Name", Amount: "Amount", StageName: "Stage",
  ForecastCategoryName: "Forecast Category", CloseDate: "Close Date",
  LastActivityDate: "Last Activity Date", NextStep: "Next Step",
  Description: "Opportunity Description"
};
const MATCHERS = [
  /champion/i, /economic.?buyer|exec(utive)?.?sponsor/i, /stakeholder|contact.?count/i,
  /budget.?confirm|budget.?approv|budget.?owner/i, /procurement/i,
  /security.?legal|legal.?security|security.?review|legal.?review/i,
  /business.?problem|business.?pain|customer.?pain|use.?case/i,
  /decision.?process|buying.?process|decision.?criteria|approval.?process/i,
  /customer.?timeline|compelling.?event|decision.?deadline|why.?now/i,
  /next.?meeting|next.?buyer.?meeting|last.?buyer.?activity/i
];
function allowedInstance(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port && /^\/[\/]?$/.test(url.pathname) &&
      !url.search && !url.hash && /^[a-z0-9.-]+\.salesforce\.com$/i.test(url.hostname);
  } catch { return false; }
}
async function sfGet(session, path) {
  if (!path.startsWith(API + "/") || path.includes("//") ||
      !allowedInstance(session.instanceUrl)) throw new Error("Invalid Salesforce API path");
  const response = await fetch(session.instanceUrl + path, {
    headers: { Authorization: "Bearer " + session.accessToken, Accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body) ? body[0]?.message : body.message;
    const err = new Error(response.status === 403
      ? "Salesforce user does not have permission to read Opportunity data."
      : response.status === 401 ? "Salesforce session expired. Reconnect to import."
      : message || "Salesforce API returned " + response.status);
    err.status = response.status;
    throw err;
  }
  return body;
}
function chooseFields(fields) {
  const available = new Map(fields.filter(f => f.name && !f.deprecatedAndHidden).map(f => [f.name, f]));
  const selected = ["Name", "Amount", "StageName", "ForecastCategoryName",
    "CloseDate", "LastActivityDate", "NextStep", "Description", "CurrencyIsoCode"].filter(n => available.has(n));
  for (const f of fields) {
    if (selected.length >= 35) break;
    if (!f.custom || !f.name || f.deprecatedAndHidden) continue;
    if (MATCHERS.some(re => re.test((f.label || "") + " " + f.name))) selected.push(f.name);
  }
  return selected;
}
function labelsFor(fields, names) {
  const descriptions = new Map(fields.map(f => [f.name, f]));
  const used = new Set();
  return names.map(name => {
    const f = descriptions.get(name) || {};
    let label = STANDARD[name] || f.label || name;
    if (used.has(label)) label += " (" + name + ")";
    used.add(label);
    return [name, label, f];
  });
}
function displayValue(value, definition) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (definition && Array.isArray(definition.picklistValues)) {
    const opt = definition.picklistValues.find(x => x.value === value);
    if (opt && opt.label) return String(opt.label);
  }
  if (typeof value === "string" && definition && ["date", "datetime"].includes(definition.type)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return String(value);
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  let session = null;
  try { session = getSession(req); } catch {}
  if (!session || !allowedInstance(session.instanceUrl)) {
    clearSession(res);
    return res.status(401).json({ error: "Salesforce connection expired. Reconnect to import opportunities." });
  }
  try {
    const describe = await sfGet(session, API + "/sobjects/Opportunity/describe");
    const fields = Array.isArray(describe.fields) ? describe.fields : [];
    const names = chooseFields(fields);
    if (!["Name", "Amount", "StageName", "CloseDate"].every(name => names.includes(name))) {
      return res.status(422).json({ error: "Essential Opportunity fields are not readable in this Salesforce org." });
    }
    const labeled = labelsFor(fields, names);
    const soql = "SELECT " + names.join(", ") +
      " FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 501";
    let path = API + "/query?q=" + encodeURIComponent(soql);
    const records = [];
    let pages = 0;
    do {
      const page = await sfGet(session, path);
      if (!Array.isArray(page.records)) throw new Error("Unexpected Salesforce query response");
      records.push(...page.records);
      pages++;
      if (records.length >= 501 || page.done || !page.nextRecordsUrl) break;
      path = page.nextRecordsUrl;
      if (pages >= 20) throw new Error("Salesforce pagination limit exceeded");
    } while (true);
    const truncated = records.length > 500;
    const subset = records.slice(0, 500);
    const currencies = [...new Set(subset.map(r => r.CurrencyIsoCode).filter(Boolean))];
    if (currencies.some(code => code !== "USD")) {
      return res.status(422).json({
        error: "This first Salesforce integration supports USD opportunities only. Cairn does not yet convert currencies; no analysis was performed."
      });
    }
    const headers = labeled.filter(([name]) => name !== "CurrencyIsoCode").map(([, label]) => label);
    const rows = subset.map(record => {
      const row = {};
      for (const [name, label, def] of labeled) {
        if (name === "CurrencyIsoCode") continue;
        row[label] = displayValue(record[name], def);
      }
      return row;
    });
    return res.status(200).json({
      source: "Salesforce CRM", orgId: session.orgId || null, headers, rows,
      importedDeals: rows.length, truncated,
      selectedPropertyCount: headers.length, currencyVerified: currencies.length > 0
    });
  } catch (err) {
    if (err && err.status === 401) clearSession(res);
    console.error("Salesforce opportunity import failed", err && err.status || "unknown");
    return res.status(err && err.status === 401 ? 401 : err && err.status === 403 ? 403 : 502)
      .json({ error: err && err.message || "Could not import Salesforce opportunities." });
  }
};
