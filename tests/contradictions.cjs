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

vm.runInContext(`$('loadSample').onclick(); runAnalysis();`,context);
const sample=get('summarizeContradictions(analyzed)');
assert.deepEqual(sample,{amount:1415000,deals:7,count:14,critical:9,material:5});
const deals=get('analyzed');
for(const d of deals)assert.equal(new Set(d.contradictions.map(c=>c.id)).size,d.contradictions.length);
assert.equal(sample.amount,deals.filter(d=>d.contradictions.length).reduce((s,d)=>s+d.amount,0));
assert(sample.count>sample.deals);
for(const evidence of ['All','Evidence Supported','Assumption Dependent'])for(const contradiction of ['All','Has','None','Critical','Material']){
  const filtered=get(`filterDeals(analyzed,${JSON.stringify(evidence)},${JSON.stringify(contradiction)})`);
  const expected=deals.filter(d=>(evidence==='All'||d.status===evidence)&&(contradiction==='All'||(contradiction==='Has'?d.contradictions.length>0:contradiction==='None'?d.contradictions.length===0:d.contradictions.some(c=>c.severity===contradiction))));
  assert.deepEqual(filtered,expected);
  el('filterStatus').value=evidence;el('filterContradictions').value=contradiction;
  vm.runInContext('renderDeals()',context);
  assert.equal(el('dealCount').textContent,`Showing ${expected.length} of 12 opportunities`);
  assert.deepEqual(get('summarizeContradictions(analyzed)'),sample);
}
const exported=get('parseCSV(analysisCSV())');
assert.equal(exported.rows.length,12);
assert.equal(exported.headers.length,13);
assert.deepEqual(exported.headers.slice(-3),['Contradiction Count','Highest Contradiction Severity','Contradictions']);
assert.equal(exported.rows[0]['Contradiction Count'],'2');
assert.equal(exported.rows[0]['Highest Contradiction Severity'],'Critical');
assert(exported.rows[0].Contradictions.includes('Critical: Commit confidence exceeds buyer evidence'));
vm.runInContext(`mapping=Object.fromEntries(fieldDefs.map(([key])=>[key,key]));`,context);
const base={name:'Test',amount:'200000',stage:'Discovery',closeDate:'2026-12-20',lastActivity:'2026-09-20',nextStep:'Review use case',problem:'Reduce manual reporting'};
const analyze=(overrides={})=>get(`analyzeRow(${JSON.stringify({...base,...overrides})},new Date(2026,8,28,12))`);
const ids=d=>d.contradictions.map(c=>c.id);
assert.deepEqual(ids(analyze()),[]);
assert.deepEqual(ids(analyze({stage:'Discovery',lastActivity:'2026-08-01',stakeholders:'1'})),[]);
const commit=analyze({forecast:'Commit'});
assert.deepEqual(ids(commit),['commit-confidence']);
assert.equal(commit.contradictions[0].evidenceConflict.split(';').length,9);
assert.equal(analyze({stage:'Commit'}).contradictions[0].crmClaim,'Stage is Commit.');
for(const stage of ['Negotiation','Contract','Legal','Procurement','Closing','Final']){
 assert(!ids(analyze({stage})).includes('late-stage-process'));
 const d=analyze({stage,procurement:'Not Started',securityLegal:'Blocked'});
 assert.equal(d.contradictions.filter(c=>c.id==='late-stage-process').length,1);
 assert(d.contradictions[0].evidenceConflict.includes('Security / legal is Blocked'));
}
for(const stage of ['Proposal','Evaluation','Pilot','POC','Negotiation','Commit']){
 assert(ids(analyze({stage,lastActivity:'2026-08-28'})).includes('stale-progression'));
 for(const stakeholders of ['0','1'])assert(ids(analyze({stage,stakeholders})).includes('single-threading'));
 for(const stakeholders of ['','2','-1','abc'])assert(!ids(analyze({stage,stakeholders})).includes('single-threading'));
}
for(const closeDate of ['2026-09-28','2026-10-28'])assert(ids(analyze({closeDate})).includes('near-term-close'));
for(const closeDate of ['','invalid','2026-10-29'])assert(!ids(analyze({closeDate})).includes('near-term-close'));
assert.deepEqual(ids(analyze({closeDate:'2026-09-27'})),['past-due-close']);
for(const stage of ['Closed Won','Closed Lost','Won','Lost','Cancelled'])assert(!ids(analyze({stage,closeDate:'2026-09-27'})).includes('past-due-close'));
const timing={closeDate:'2026-10-01',timeline:'Launch',nextMeeting:'2026-09-29'};
assert.deepEqual(ids(analyze(timing)),[]); // Unknown commercial process alone is not a timing conflict.
assert(ids(analyze({...timing,lastActivity:''})).includes('near-term-close'));
assert.deepEqual(ids(analyze({...timing,lastActivity:'2026-09-01'})),[]); // Inferred momentum alone is allowed.
assert.deepEqual(get('summarizeContradictions([])'),{amount:0,deals:0,count:0,critical:0,material:0});
console.log('Contradiction assertions passed. Sample:',sample);
