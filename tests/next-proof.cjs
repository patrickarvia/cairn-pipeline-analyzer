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
const deals=get('analyzed'), queue=get('proofQueue(analyzed)');
assert.equal(queue.length,8);
for(const d of deals){
 assert.equal(d.proofRequirements.length,d.blockers.length);
 assert.equal(d.nextProof===null,d.status==='Evidence Supported');
 if(d.nextProof){assert.equal(d.nextProof.claimId,d.blockers[0].claimId);assert.deepEqual(d.nextProof.blocker,d.blockers[0]);}
}
const summary=get('summarize(analyzed)');
assert.equal(summary.total,2220000);assert.equal(summary.supported,715000);assert.equal(summary.gap,1505000);
assert.equal(summary.supportedCount,4);assert.equal(summary.dependentCount,8);
assert.equal(summary.deductions.reduce((n,g)=>n+g.amount,0),summary.gap);
assert.deepEqual(get('summarizeContradictions(analyzed)'),{amount:1415000,deals:7,count:14,critical:9,material:5});
for(let i=1;i<queue.length;i++){
 const ranks=get(`blockerOrder`);const a=ranks.indexOf(queue[i-1].primaryBlocker),b=ranks.indexOf(queue[i].primaryBlocker);
 assert(a<=b);if(a===b)assert(queue[i-1].amount>=queue[i].amount);
}
const queueHTML=el('proofQueue').innerHTML;
for(const evidence of ['All','Evidence Supported','Assumption Dependent'])for(const contradiction of ['All','Has','None','Critical','Material']){
 el('filterStatus').value=evidence;el('filterContradictions').value=contradiction;
 vm.runInContext('renderDeals()',context);assert.equal(el('proofQueue').innerHTML,queueHTML);
}
const exported=get('parseCSV(analysisCSV())');
assert.deepEqual(exported.headers.slice(-5),['Next Proof Claim','Next Proof Current State','Next Proof Required','Next Proof Target State','Additional Blocking Proof Count']);
exported.rows.forEach((r,i)=>assert.equal(Number(r['Additional Blocking Proof Count']),Math.max(0,deals[i].blockers.length-1)));
vm.runInContext(`mapping=Object.fromEntries(fieldDefs.map(([key])=>[key,key]));`,context);
const base={name:'Test',amount:'200000',stage:'Discovery',closeDate:'2026-12-20',lastActivity:'2026-09-20',nextStep:'Review use case',problem:'Reduce manual reporting'};
const analyze=(overrides={})=>get(`analyzeRow(${JSON.stringify({...base,...overrides})},new Date(2026,8,28,12))`);
const proof=(overrides,id)=>analyze(overrides).proofRequirements.find(p=>p.claimId===id);
assert.equal(analyze().proofRequirements.length,0);
for(const id of ['economicBuyer','champion','budget'])assert.equal(proof({},id),undefined);
for(const [forecast,days] of [['Commit',14],['',30]])assert(proof({forecast,lastActivity:''},'momentum').proofRequired.includes(`last ${days} days`));
assert.equal(proof({lastActivity:'2026-08-29'},'momentum'),undefined);
assert.equal(proof({forecast:'Commit',lastActivity:'2026-09-14'},'momentum'),undefined);
assert(proof({forecast:'Commit',lastActivity:'2026-09-13'},'momentum'));
assert(proof({forecast:'Commit',nextStep:'',nextMeeting:''},'nextStep').proofRequired.includes(' and schedule'));
assert(proof({forecast:'Commit',nextMeeting:''},'nextStep').proofRequired.startsWith('Verify'));
assert(proof({forecast:'Commit',nextStep:'',nextMeeting:'2026-09-29'},'nextStep').proofRequired.startsWith('Document the customer-owned next step for'));
assert(proof({nextStep:''},'nextStep').proofRequired.includes(' or schedule'));
assert.equal(proof({nextStep:'',nextMeeting:'2026-09-28'},'nextStep'),undefined);
assert(proof({forecast:'Commit'},'stakeholders').proofRequired.includes('4'));
assert(proof({stage:'Proposal'},'stakeholders').proofRequired.includes('2'));
assert(proof({stage:'Proposal'},'decision').supportedWhen.includes('partial'));
assert(proof({forecast:'Commit'},'decision').supportedWhen.includes('not marked Partial'));
assert.equal(proof({closeDate:'2026-11-13'},'timeline'),undefined);
assert(proof({closeDate:'2026-11-12'},'timeline').supportedWhen.includes('45 days'));
assert.equal(proof({closeDate:''},'timeline').targetState,'Supported');
assert(proof({closeDate:'',timeline:'Launch'},'timeline').proofRequired.startsWith('Add a valid close date'));
for(const id of ['procurement','securityLegal']){
 assert(proof({forecast:'Commit'},id).proofRequired.includes('Started, In Progress, In Review, Complete, or Not Required'));
 for(const status of ['Started','In Progress','In Review','Complete','Not Required','Completed','Review'])assert.equal(proof({forecast:'Commit',[id]:status},id),undefined);
}
assert.equal(proof({stage:''},'stage').targetState,'Mapped');
console.log('Next proof regression checks passed. Sample queue:');
for(const d of queue)console.log(`${d.name}: ${d.nextProof.proofRequired}`);
