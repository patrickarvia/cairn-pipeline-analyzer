const { clearSession, getSession } = require("../_hubspot-session");

const API = "https://api.hubapi.com";
const STANDARD = {
  dealname: "Opportunity Name",
  amount: "Amount",
  dealstage: "Stage",
  hs_forecast_category: "Forecast Category",
  closedate: "Close Date",
  hs_last_sales_activity_timestamp: "Last Activity Date",
  notes_last_contacted: "Last Activity Date",
  hs_next_step: "Next Step",
  hs_next_activity_date: "Next Meeting Date"
};

const MATCHERS = [
  /champion/i,
  /economic buyer/i,
  /executive sponsor/i,
  /exec sponsor/i,
  /stakeholder count/i,
  /contact count/i,
  /budget (confirmed|approved|owner)/i,
  /procurement/i,
  /security.*legal|legal.*security/i,
  /security review/i,
  /legal review/i,
  /business problem|business pain|customer pain|use case/i,
  /decision process|buying process|decision criteria|approval process/i,
  /customer timeline|compelling event|decision deadline|why now/i,
  /next meeting|next scheduled meeting/i
];

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

async function hubspotFetch(path, token) {
  const response = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.message || body.error_description || `HubSpot API returned ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}

function optionMaps(definitions) {
  const maps = new Map();
  definitions.forEach(def => {
    if (!Array.isArray(def.options) || !def.options.length) return;
    maps.set(def.name, new Map(def.options.map(opt => [String(opt.value), opt.label || opt.value])));
  });
  return maps;
}

function chooseProperties(definitions) {
  const byName = new Map(definitions.map(def => [def.name, def]));
  const chosen = [];
  const add = name => {
    if (byName.has(name) && !chosen.includes(name)) chosen.push(name);
  };

  ["dealname","amount","dealstage","hs_forecast_category","closedate"].forEach(add);

  if (byName.has("hs_last_sales_activity_timestamp")) add("hs_last_sales_activity_timestamp");
  else add("notes_last_contacted");

  add("hs_next_step");
  add("hs_next_activity_date");

  definitions.forEach(def => {
    if (chosen.length >= 40) return;
    const haystack = `${def.label || ""} ${def.name || ""}`;
    if (MATCHERS.some(re => re.test(haystack))) add(def.name);
  });
  return chosen;
}

function buildHeaders(selected, definitions) {
  const defs = new Map(definitions.map(def => [def.name, def]));
  const labels = new Map();
  const used = new Map();

  selected.forEach(name => {
    let label = STANDARD[name] || (defs.get(name) && defs.get(name).label) || name;
    if (label === "Last Activity Date" && used.has(label)) {
      labels.set(name, null);
      return;
    }
    const count = (used.get(label) || 0) + 1;
    used.set(label, count);
    if (count > 1) label = `${label} (${name})`;
    labels.set(name, label);
  });

  return labels;
}

function stageMetadata(pipelines) {
  const labels = new Map();
  const closed = new Set();
  (pipelines.results || []).forEach(pipeline => {
    (pipeline.stages || []).forEach(stage => {
      labels.set(String(stage.id), stage.label || stage.id);
      const isClosed = stage.metadata && (stage.metadata.isClosed === true || stage.metadata.isClosed === "true");
      if (isClosed) closed.add(String(stage.id));
    });
  });
  return { labels, closed };
}

function cleanValue(name, value, optionMap, stages) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (name === "dealstage" && stages.labels.has(raw)) return stages.labels.get(raw);
  if (optionMap && optionMap.has(raw)) return optionMap.get(raw);
  if (/date|timestamp/i.test(name) && raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.valueOf())) return d.toISOString().slice(0, 10);
  }
  return raw;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  let session;
  try { session = getSession(req); } catch {}
  if (!session) {
    clearSession(res);
    return res.status(401).json({ error: "HubSpot connection expired. Reconnect to import deals." });
  }

  try {
    const [propertyResponse, pipelineResponse] = await Promise.all([
      hubspotFetch("/crm/2026-09/properties/deals?archived=false", session.accessToken),
      hubspotFetch("/crm/pipelines/2026-09/deals", session.accessToken)
    ]);
    const definitions = propertyResponse.results || [];
    const selected = chooseProperties(definitions);
    const labels = buildHeaders(selected, definitions);
    const options = optionMaps(definitions);
    const stages = stageMetadata(pipelineResponse);

    const records = [];
    let after = null;
    let truncated = false;
    do {
      const url = new URL(API + "/crm/objects/2026-09/deals");
      url.searchParams.set("limit", "100");
      url.searchParams.set("archived", "false");
      url.searchParams.set("properties", selected.join(","));
      if (after) url.searchParams.set("after", after);
      const page = await hubspotFetch(url.pathname + url.search, session.accessToken);
      records.push(...(page.results || []));
      after = page.paging && page.paging.next ? page.paging.next.after : null;
      if (records.length >= 500 && after) {
        truncated = true;
        break;
      }
    } while (after);

    let excludedClosed = 0;
    const openRecords = records.filter(record => {
      const stageId = record.properties && record.properties.dealstage;
      if (stageId && stages.closed.has(String(stageId))) {
        excludedClosed++;
        return false;
      }
      return true;
    });

    const headers = selected.map(name => labels.get(name)).filter(Boolean);
    const rows = openRecords.map(record => {
      const row = {};
      selected.forEach(name => {
        const label = labels.get(name);
        if (!label) return;
        row[label] = cleanValue(name, record.properties ? record.properties[name] : "", options.get(name), stages);
      });
      return row;
    });

    return res.status(200).json({
      source: "HubSpot CRM",
      hubId: session.hubId || null,
      headers,
      rows,
      importedDeals: rows.length,
      excludedClosedDeals: excludedClosed,
      truncated,
      selectedPropertyCount: headers.length
    });
  } catch (err) {
    console.error("HubSpot deal import error", err && err.message ? err.message : err);
    if (err && err.status === 401) clearSession(res);
    return res.status(err && err.status === 401 ? 401 : 502).json({
      error: err && err.message ? err.message : "Could not import HubSpot deals."
    });
  }
};
