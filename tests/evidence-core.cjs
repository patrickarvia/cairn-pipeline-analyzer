const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){},toggle(){}},addEventListener(){},scrollIntoView(){},appendChild(){},querySelectorAll(){return []},value:'All'});return elements.get(id)};
let currentTime=new Date(2026,8,28,12).getTime();
class TestDate extends Date {constructor(...args){super(...(args.length?args:[currentTime]))} static now(){return currentTime}}
const context=vm.createContext({Date:TestDate,document:{getElementById:el,createElement:()=>el('created')},setTimeout(){},console});
vm.runInContext(script,context);
const get=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
let sample;
let baseline;
const offsets=[[2,-12,-4],[27,-13,0],[8,-31,null],[14,-14,1],[78,-11,2],[43,-56,null],[20,-10,-1],[53,-9,3],[38,-39,null],[30,-16,-2],[83,-8,4],[48,-10,5]];
for(const [year,month,day] of [[2026,9,28],[2027,3,14],[2027,11,7],[2028,2,29],[2030,12,31]]){
 currentTime=new Date(year,month-1,day,23,30).getTime();
 vm.runInContext(`$('loadSample').onclick(); runAnalysis();`,context);
 sample=get('summarize(analyzed)');
 assert.equal(sample.total,2220000);
 assert.equal(sample.supported,715000);
 assert.equal(sample.gap,1505000);
 assert.equal(sample.supportedCount,4);
 assert.equal(sample.dependentCount,8);
 assert.equal(sample.supported+sample.gap,sample.total);
 assert.equal(sample.deductions.reduce((n,g)=>n+g.amount,0),sample.gap);
 assert.equal(sample.deductions.reduce((n,g)=>n+g.count,0),sample.dependentCount);
 const deals=get('analyzed');
 for(const deal of deals){
   assert.equal(deal.claims.length,11);
   assert.equal(sample.deductions.filter(g=>g.category===deal.primaryBlocker).length,deal.status==='Assumption Dependent'?1:0);
 }
 const signature=deals.map(d=>[d.name,d.status,d.primaryBlocker,d.claims.map(c=>c.state)]);
 if(baseline)assert.deepEqual(signature,baseline); else baseline=signature;
 const rows=get('rawRows');
 const today=Date.UTC(year,month-1,day);
 rows.forEach((row,i)=>['Close Date','Last Activity Date','Next Meeting Date'].forEach((field,j)=>{
   assert.equal(row[field],offsets[i][j]===null?'':new Date(today+offsets[i][j]*86400000).toISOString().slice(0,10));
 }));
 const summit=deals.find(d=>d.name==='Summit Manufacturing');
 assert.equal(summit.claims.find(c=>c.id==='nextStep').state,'Inferred');
 assert.equal(summit.primaryBlocker,'Unverified customer-owned next step');
 assert(summit.recommendations.includes('Verify the documented next step with the buyer and schedule a dated customer meeting.'));
 assert(summit.diagnosis.endsWith('because the customer-owned next step is not yet fully verified.'));
 assert.equal(deals.find(d=>d.name==='Harbor Industrial').primaryBlocker,'Aging buyer momentum');
 assert(!JSON.stringify(sample).includes('Buyer momentum gap'));
}
vm.runInContext(`mapping=Object.fromEntries(fieldDefs.map(([key])=>[key,key]));`,context);
const base={name:'Test',amount:'200000',stage:'Discovery',closeDate:'2026-12-20',lastActivity:'2026-09-20',nextStep:'Review use case',problem:'Reduce manual reporting'};
function analyze(overrides={}){return get(`analyzeRow(${JSON.stringify({...base,...overrides})},new Date(2026,8,28,12))`)}
assert.equal(analyze().status,'Evidence Supported');
assert.equal(analyze({stage:'Negotiation'}).primaryBlocker,'Buyer authority gap');
assert.equal(analyze({lastActivity:'2026-08-01',problem:''}).primaryBlocker,'Stale buyer momentum');
for(const [last,state] of [['2026-09-14','Supported'],['2026-09-13','Inferred'],['2026-08-29','Inferred'],['2026-08-28','Stale'],['','Unknown'],['2026-10-01','Unknown']])assert.equal(analyze({lastActivity:last}).claims[0].state,state);
assert.equal(analyze({lastActivity:''}).primaryBlocker,'Unknown buyer momentum');
assert.equal(analyze({nextStep:''}).primaryBlocker,'No customer-owned next step');
const commit={stage:'Negotiation',forecast:'Commit',champion:'Yes',economicBuyer:'Yes',stakeholders:'4',budget:'Yes',procurement:'Not Required',securityLegal:'In Progress',decision:'Known',timeline:'Customer launch deadline',nextMeeting:'2026-09-29'};
assert.equal(analyze(commit).status,'Evidence Supported');
for(const [overrides,state,action] of [
 [{},'Supported',''],
 [{nextStep:'',nextMeeting:''},'Unknown','Document a customer-owned next step and schedule a dated customer meeting.'],
 [{nextMeeting:''},'Inferred','Verify the documented next step with the buyer and schedule a dated customer meeting.'],
 [{nextMeeting:'2026-09-27'},'Inferred','Verify the documented next step with the buyer and schedule a dated customer meeting.'],
 [{nextStep:''},'Inferred','Confirm the purpose and customer-owned next step for the scheduled meeting.']
]){
 const deal=analyze({...commit,...overrides});
 const claim=deal.claims.find(c=>c.id==='nextStep');
 assert.equal(claim.state,state);
 assert.equal(claim.action,action);
 if(action)assert(deal.recommendations.includes(action));
 else assert.equal(deal.recommendations.length,0);
}

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
