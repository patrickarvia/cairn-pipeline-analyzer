const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){},toggle(){}},addEventListener(){},scrollIntoView(){},appendChild(){},querySelectorAll(){return []},value:'All'});return elements.get(id)};
const context=vm.createContext({document:{getElementById:el,createElement:()=>el('created')},setTimeout(){},console});
vm.runInContext(script,context);
vm.runInContext(`
$('loadSample').onclick();
analyzed=rawRows.map(row=>analyzeRow(row,new Date('2026-09-28T12:00:00Z')));
renderResults();
`,context);
const get=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
const sample=get('summarize(analyzed)');
assert.equal(sample.total,2220000);
assert.equal(sample.supported+sample.gap,sample.total);
assert.equal(sample.deductions.reduce((n,g)=>n+g.amount,0),sample.gap);
assert.equal(sample.deductions.reduce((n,g)=>n+g.count,0),sample.dependentCount);
assert.equal(get('analyzed.every(d=>d.claims.length===11 && (d.status==="Evidence Supported" ? !d.primaryBlocker : blockerOrder.includes(d.primaryBlocker)))'),true);
vm.runInContext(`mapping=Object.fromEntries(fieldDefs.map(([key])=>[key,key]));`,context);
const base={name:'Test',amount:'200000',stage:'Discovery',closeDate:'2026-12-20',lastActivity:'2026-09-20',nextStep:'Review use case',problem:'Reduce manual reporting'};
function analyze(overrides={}){return get(`analyzeRow(${JSON.stringify({...base,...overrides})},new Date('2026-09-28T12:00:00Z'))`)}
assert.equal(analyze().status,'Evidence Supported');
assert.equal(analyze({stage:'Negotiation'}).primaryBlocker,'Buyer authority gap');
assert.equal(analyze({lastActivity:'2026-08-01',problem:''}).primaryBlocker,'Stale buyer momentum');
for(const [last,state] of [['2026-09-14','Supported'],['2026-09-13','Inferred'],['2026-08-29','Inferred'],['2026-08-28','Stale'],['','Unknown'],['2026-10-01','Unknown']])assert.equal(analyze({lastActivity:last}).claims[0].state,state);
const commit={stage:'Negotiation',forecast:'Commit',champion:'Yes',economicBuyer:'Yes',stakeholders:'4',budget:'Yes',procurement:'Not Required',securityLegal:'In Progress',decision:'Known',timeline:'Customer launch deadline',nextMeeting:'2026-09-29'};
assert.equal(analyze(commit).status,'Evidence Supported');
for(const field of ['champion','economicBuyer','budget','decision','timeline','nextMeeting','procurement','securityLegal'])assert.equal(analyze({...commit,[field]:''}).status,'Assumption Dependent',field);
for(const field of ['procurement','securityLegal'])assert.equal(analyze({...commit,[field]:'Not Started'}).claims.find(c=>c.id===field).state,'Contradicted');
assert.equal(analyze({problem:'Unknown'}).primaryBlocker,'Core business case missing');
assert.equal(analyze({closeDate:'2026-11-12'}).claims.at(-1).state,'Contradicted');
assert.equal(analyze({closeDate:'2026-11-13'}).claims.at(-1).state,'Inferred');
assert.equal(analyze({closeDate:'',timeline:'Launch'}).claims.at(-1).state,'Unknown');
for(const deals of [[],[analyze()],[analyze({problem:''})],[analyze({amount:'0'})]]){
 const summary=get(`summarize(${JSON.stringify(deals)})`);
 assert.equal(summary.supported+summary.gap,summary.total);
 assert.equal(summary.deductions.reduce((n,g)=>n+g.amount,0),summary.gap);
}
console.log('Evidence core assertions passed. Sample:',sample);
