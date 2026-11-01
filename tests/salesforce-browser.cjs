const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"));
const headers = ["Opportunity Name", "Amount", "Stage", "Forecast Category",
  "Close Date", "Last Activity Date", "Next Step", "Problem Use Case"];
const data = {
  source:"Salesforce CRM", headers, orgId:"00D000000000001", importedDeals:2,
  rows:[
    {"Opportunity Name":"Test Enterprise Deal","Amount":"50000","Stage":"Proposal",
      "Forecast Category":"Best Case","Close Date":"2027-01-14","Last Activity Date":"2026-10-31",
      "Next Step":"Executive review","Problem Use Case":"Manual forecasting"},
    {"Opportunity Name":"Test Discovery Deal","Amount":"30000","Stage":"Discovery",
      "Forecast Category":"Pipeline","Close Date":"2027-02-10","Last Activity Date":"2026-10-30",
      "Next Step":"Discovery call","Problem Use Case":"Disconnected systems"}
  ], currencyVerified:true, truncated:false
};
let connected = true;
const server = http.createServer((req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const pathname = new URL(req.url,"http://localhost").pathname;
  function respond(json,status=200){
    res.writeHead(status,{"Content-Type":"application/json"});
    res.end(JSON.stringify(json));
  }
  if(pathname==="/api/hubspot/status")return respond({configured:false,connected:false});
  if(pathname==="/api/salesforce/status")return respond({configured:true,connected,orgId:"00D000000000001"});
  if(pathname==="/api/salesforce/opportunities")return connected?respond(data):respond({error:"Disconnected"},401);
  if(pathname==="/api/salesforce/disconnect" && req.method==="POST"){
    connected=false; return respond({disconnected:true});
  }
  if(pathname==="/") {
    res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"});
    return res.end(html);
  }
  res.writeHead(404);res.end();
});

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1365,height:900}});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto(base+"/",{waitUntil:"load"});
    await page.locator("#salesforceConnection").waitFor({state:"visible"});
    assert.match(await page.locator("#salesforceBtn").textContent(),/Import from Salesforce/);
    await page.click("#salesforceBtn");
    await page.locator("#mappingSection").waitFor({state:"visible"});
    assert.match(await page.locator("#mappingSource").textContent(),/Salesforce/);
    assert.match(await page.locator("#importFeedback").textContent(),/2 rows detected/);
    await page.click("#analyzeBtn");
    await page.locator("#results").waitFor({state:"visible"});
    assert.equal(await page.locator("#kTotal").textContent(),"$80,000");
    assert.equal(await page.locator("#dealList .deal").count(),2);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),
      "Mobile horizontal overflow");
    await page.click("#salesforceDisconnect");
    await page.locator("#salesforceConnection").waitFor({state:"hidden"});
    assert.match(await page.locator("#salesforceBtn").textContent(),/Connect Salesforce/);
    await page.close();

    connected=true;
    const callbackPage=await browser.newPage();
    await callbackPage.goto(base+"/?salesforce=connected",{waitUntil:"load"});
    await callbackPage.locator("#mappingSection").waitFor({state:"visible"});
    assert(!new URL(callbackPage.url()).searchParams.has("salesforce"),"OAuth flag was not cleared");
    await callbackPage.close();
    assert.deepEqual(errors,[]);
    console.log("Salesforce browser mock checks passed: connected state, read-only import, mapping, audit, mobile, disconnect, OAuth return.");
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
