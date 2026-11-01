const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({
    headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})
  });
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const pageErrors = [];
    page.on("pageerror",error=>pageErrors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname,"../index.html")).href,{waitUntil:"load"});
    const cases = [
      {width:1440,columns:4},
      {width:1200,columns:4},
      {width:1024,columns:2},
      {width:768,columns:2},
      {width:390,columns:1}
    ];
    for (const sample of cases) {
      await page.setViewportSize({width:sample.width,height:900});
      const positions = await page.evaluate(() => {
        const cards=[...document.querySelectorAll(".entry-grid>.entry-card")];
        const ids=["dropZone","hubspotBtn","salesforceBtn","loadSample"];
        return {
          cards:cards.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}),
          actions:ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}),
          overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
        };
      });
      assert.equal(positions.overflow,false,"Horizontal overflow at "+sample.width);
      assert.equal(new Set(positions.cards.map(c=>Math.round(c.x))).size,sample.columns,
        "Wrong column count at "+sample.width);
      for (let i=1;i<positions.cards.length;i++) {
        assert(Math.abs(positions.cards[i].w-positions.cards[0].w)<1,
          "Unequal card widths at "+sample.width);
      }
      if (sample.columns===4) {
        const y=positions.actions.map(c=>c.y);
        assert(Math.max(...y)-Math.min(...y)<2,"Source action rows are misaligned: "+y);
        assert(positions.actions.every(a=>a.w>100),"CTA collapsed at "+sample.width);
      } else if (sample.columns===2) {
        assert(Math.abs(positions.actions[0].y-positions.actions[1].y)<2,
          "Top-row actions misaligned at "+sample.width);
        assert(Math.abs(positions.actions[2].y-positions.actions[3].y)<2,
          "Bottom-row actions misaligned at "+sample.width);
      }
      console.log("PASS source cards:",sample.width+"px",sample.columns+" columns");
    }
    // The marks are CSS backgrounds rather than DOM children, so dynamic
    // changes to button.textContent during OAuth/import never remove the icons.
    const marks=await page.evaluate(()=>{
      return ["hubspotBtn","salesforceBtn"].map(id=>{
        const node=document.getElementById(id);
        const iconStyle=getComputedStyle(node,"::before");
        return {id,display:getComputedStyle(node).display,
          background:iconStyle.backgroundImage,width:iconStyle.width,height:iconStyle.height};
      });
    });
    for (const mark of marks){
      assert.equal(mark.display,"flex",mark.id+" must remain a centered flex button");
      assert.match(mark.background,/assets\\/(hubspot|salesforce)-mark\\.svg/,"Brand asset missing for "+mark.id);
      assert.equal(mark.width,"20px");
      assert.equal(mark.height,"20px");
    }
    await page.evaluate(()=>{
      document.getElementById("hubspotBtn").textContent="Import from HubSpot →";
      document.getElementById("salesforceBtn").textContent="Import from Salesforce →";
    });
    const stillVisible=await page.evaluate(()=>["hubspotBtn","salesforceBtn"].every(id=>
      getComputedStyle(document.getElementById(id),"::before").backgroundImage.includes("-mark.svg")));
    assert(stillVisible,"CRM logos must persist when button labels change");
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>{
      const box=document.getElementById("salesforceConnection");
      box.hidden=false;
      document.getElementById("salesforceConnectedLabel").textContent=
        "Salesforce connected · read-only · Org 00D000000000000AAA";
    });
    const ys=await page.locator("#dropZone,#hubspotBtn,#salesforceBtn,#loadSample").evaluateAll(nodes=>
      nodes.map(n=>n.getBoundingClientRect().y));
    assert(Math.max(...ys)-Math.min(...ys)<2,"Connected state shifted CTA alignment");
    assert.deepEqual(pageErrors,[]);
    console.log("Source-card alignment responsive and connected-state checks passed.");
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
