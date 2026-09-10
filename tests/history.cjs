const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false});return elements.get(id);};
const context=vm.createContext({console,Date,Map,Set,URL,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,document:{addEventListener(){},getElementById:element},localStorage:{setItem(){}},scrollTo(){}});
vm.runInContext(readFileSync('script.js','utf8'),context);
vm.runInContext(`
renderToday=()=>{};renderAll=()=>{};renderHistory=()=>{};showView=()=>{};showToast=()=>{};
config=defaultConfig();fallback=true;
config.moves=[{id:"read",label:"Read",enabled:true,order:0}];
const today=blankDay(dateKey());days=[today];
const before=JSON.stringify(today),settings=JSON.stringify(config);
const past=shiftDate(dateKey(),-5);
openHistoricalDay(past);
if(days.length!==1)throw Error("Browsing saved an empty day");
const draft=currentDay();draft.rolloverResolved="archive";editable=true;
`,context);
(async()=>{
await vm.runInContext(`
(async()=>{
await persistDay(draft);
$("past-move-input").value="Walk";
await addPastMove({preventDefault(){}});
$("priority-input").value="Finish project";
await addPriority({preventDefault(){}},false);
const historical=getDay(past);
historical.moves[0].status="done";historical.priorities[0].status="done";
await persistDay(historical);
if(score([...historical.moves,...historical.priorities]).percent!==67)throw Error("Score failed");
if(JSON.stringify(getDay(dateKey()))!==before)throw Error("Today changed");
if(JSON.stringify(config)!==settings)throw Error("Settings changed");
if(sanitizeDay(historical).moves.length!==2)throw Error("Backup roundtrip lost moves");
const selected=activeDate;
openHistoricalDay("2026-02-30");if(activeDate!==selected)throw Error("Invalid date accepted");
openHistoricalDay(shiftDate(dateKey(),1));if(activeDate!==selected)throw Error("Future date accepted");
openHistoricalDay(past);if(currentDay()!==historical)throw Error("Existing day replaced");
editable=true;$("conclusion").value="Past note";queueConclusion();activeDate=dateKey();
})()
`,context);
await new Promise(resolve=>setTimeout(resolve,650));
assert.equal(vm.runInContext('getDay(past).conclusion',context),'Past note');
assert.equal(vm.runInContext('getDay(dateKey()).conclusion',context),'');
console.log('History regression checks passed: date validation, missing/existing days, isolation, scoring, backup, delayed notes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
