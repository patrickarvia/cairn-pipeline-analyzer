const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { setSession } = require("../api/_salesforce-session");
const start = require("../api/salesforce/start");
const callback = require("../api/salesforce/callback");
const status = require("../api/salesforce/status");
const opportunities = require("../api/salesforce/opportunities");
const disconnect = require("../api/salesforce/disconnect");

process.env.SALESFORCE_CLIENT_ID = "test-client-id";
process.env.SALESFORCE_CLIENT_SECRET = "test-client-secret";
process.env.SALESFORCE_COOKIE_SECRET = "test-secret-32-characters-long-please";
process.env.SALESFORCE_REDIRECT_URI = "https://cairn-pipeline-analyzer.vercel.app/api/salesforce/callback";
process.env.SALESFORCE_APP_URL = "https://cairn-pipeline-analyzer.vercel.app";
process.env.SALESFORCE_LOGIN_URL = "https://login.salesforce.com";

function response() {
  const headers = {};
  return {
    headers, code: 200, data: null, location: null,
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    getHeader(key) { return headers[key.toLowerCase()]; },
    status(code) { this.code = code; return this; },
    json(body) { this.data = body; return this; },
    redirect(code, url) { this.code = code; this.location = url; return this; }
  };
}
function cookies(res) {
  const all = res.getHeader("Set-Cookie") || [];
  return (Array.isArray(all) ? all : [all]).map(v => v.split(";")[0]).join("; ");
}
function jsonResponse(body, code=200) {
  return { ok: code>=200 && code<300, status: code, json: async () => body };
}
async function run() {
  const originalFetch = global.fetch;
  try {
    const unavailable = await status({method:"GET",headers:{}}, response());
    assert.equal(unavailable.data.configured, true);
    assert.equal(unavailable.data.connected, false);
    assert.equal((await start({method:"POST"}, response())).code, 405);
    const begin = await start({method:"GET",headers:{}}, response());
    assert.equal(begin.code,302);
    const auth = new URL(begin.location);
    assert.equal(auth.hostname,"login.salesforce.com");
    assert.equal(auth.pathname,"/services/oauth2/authorize");
    assert.equal(auth.searchParams.get("code_challenge_method"),"S256");
    assert.equal(auth.searchParams.get("scope"),"api");
    const startCookie = cookies(begin);
    const state = auth.searchParams.get("state");
    assert(startCookie.includes("cairn_salesforce_state="));
    assert(startCookie.includes("cairn_salesforce_pkce="));
    const callbackReq = {method:"GET",headers:{cookie:startCookie},query:{code:"oauth-code",state}};
    let sentVerifier;
    global.fetch = async (url, options) => {
      assert.equal(url,"https://login.salesforce.com/services/oauth2/token");
      sentVerifier = String(options.body.get("code_verifier"));
      assert.equal(options.body.get("client_secret"),"test-client-secret");
      return jsonResponse({
        access_token:"token-only-for-mocks",
        instance_url:"https://acme.my.salesforce.com",
        id:"https://login.salesforce.com/id/00D000000000001/005000000000002"
      });
    };
    const finished = await callback(callbackReq,response());
    assert.equal(finished.code,302);
    assert.equal(new URL(finished.location).searchParams.get("salesforce"),"connected");
    const sha=crypto.createHash("sha256").update(sentVerifier).digest("base64url");
    assert.equal(sha,auth.searchParams.get("code_challenge"));
    assert(cookies(finished).includes("cairn_salesforce="));
    const sessionCookie = cookies(finished);
    const connected = await status({method:"GET",headers:{cookie:sessionCookie}},response());
    assert.equal(connected.data.connected,true);
    const fields=[
      {name:"Name",label:"Name"},{name:"Amount",label:"Amount"},{name:"StageName",label:"Stage"},
      {name:"ForecastCategoryName",label:"Forecast"},{name:"CloseDate",label:"Close Date",type:"date"},
      {name:"LastActivityDate",label:"Last Activity Date",type:"date"},
      {name:"NextStep",label:"Next Step"},{name:"CurrencyIsoCode",label:"Currency"},
      {name:"Champion__c",label:"Champion",custom:true,type:"boolean"},
      {name:"Business_Problem__c",label:"Business Problem",custom:true}
    ];
    const records=[
      {Name:"Fictional A",Amount:50000,StageName:"Proposal",ForecastCategoryName:"Best Case",
        CloseDate:"2026-12-10",LastActivityDate:"2026-10-30",NextStep:"Review",
        CurrencyIsoCode:"USD",Champion__c:true,Business_Problem__c:"Manual reporting"},
      {Name:"Fictional B",Amount:30000,StageName:"Discovery",ForecastCategoryName:"Pipeline",
        CloseDate:"2027-01-30",LastActivityDate:null,NextStep:null,
        CurrencyIsoCode:"USD",Champion__c:false,Business_Problem__c:""}
    ];
    const calls=[];
    global.fetch=async (url, options) => {
      calls.push({url,method:options.method||"GET",auth:options.headers.Authorization});
      assert(url.startsWith("https://acme.my.salesforce.com/services/data/v65.0/"));
      if(url.endsWith("/sobjects/Opportunity/describe"))return jsonResponse({fields});
      if(url.includes("/query?q=")){
        const query=new URL(url).searchParams.get("q");
        assert(query.includes("WHERE IsClosed = false"));
        assert(query.includes("LIMIT 501"));
        assert(query.includes("Champion__c"));
        return jsonResponse({records,done:true});
      }
      throw new Error("Unexpected Salesforce API request");
    };
    const imported=await opportunities({method:"GET",headers:{cookie:sessionCookie}},response());
    assert.equal(imported.code,200);
    assert.equal(imported.data.importedDeals,2);
    assert.equal(imported.data.currencyVerified,true);
    assert(imported.data.headers.includes("Opportunity Name"));
    assert(imported.data.headers.includes("Business Problem"));
    assert(!imported.data.headers.includes("Currency"));
    assert.equal(imported.data.rows[0]["Champion"],"Yes");
    assert.equal(imported.data.rows[1]["Champion"],"No");
    assert.equal(imported.data.rows[0]["Last Activity Date"],"2026-10-30");
    assert(calls.every(c => c.method==="GET" && c.auth==="Bearer token-only-for-mocks"));
    records[0].CurrencyIsoCode="EUR";
    const rejected=await opportunities({method:"GET",headers:{cookie:sessionCookie}},response());
    assert.equal(rejected.code,422);
    assert.match(rejected.data.error,/USD/);
    const invalid=await opportunities({method:"GET",headers:{}},response());
    assert.equal(invalid.code,401);
    const cleared=await disconnect({method:"POST",headers:{cookie:sessionCookie}},response());
    assert.equal(cleared.data.disconnected,true);
    assert(cookies(cleared).includes("cairn_salesforce="));
    console.log("Salesforce OAuth, PKCE, field import, currency guard and disconnect: PASS");
  } finally { global.fetch=originalFetch; }
}
run().catch(err=>{console.error(err);process.exitCode=1;});
