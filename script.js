"use strict";

const {WEEKEND_CONCLUSION_MAX,isWeekendKey,migrateWeekends,dateKey,parseDate,shiftDate,daysBetween,unitKey,unitEnd,nextUnit,prevUnit,currentUnit,defaultLogUnit,canLogUnit,unitsBetween,weekUnits,dayScore,isLogged,unitState,summarizeUnits,unitStreaks}=MinimalLogic;
const LOG_LOCK_NOTE="Log this tomorrow, once the day is done.";
function todayKey(){return currentUnit();}
const WEEKEND_BACKUP_KEY="minimal.backup.pre-weekend";
function isYesterday(k){return unitEnd(k)===shiftDate(dateKey(),-1);}
function weekdayName(k){return parseDate(k).toLocaleDateString(undefined,{weekday:"long"});}
function unitTitle(k){if(k===todayKey())return isWeekendKey(k)?"This weekend":"Today";if(isWeekendKey(k))return "Weekend";if(k===defaultLogUnit())return isYesterday(k)?"Yesterday":weekdayName(k);return weekdayName(k);}
function lockNote(k){return isWeekendKey(k)?"Log this on Monday, once the weekend is done.":LOG_LOCK_NOTE;}
function unitName(k){if(k===defaultLogUnit())return isWeekendKey(k)?"the weekend":isYesterday(k)?"yesterday":weekdayName(k);return isWeekendKey(k)?`weekend of ${formatDate(k)}`:formatDate(k);}
function unitDateText(k){return isWeekendKey(k)?`${formatDate(k)} – ${formatDate(unitEnd(k))}`:formatDate(k);}
function conclusionMax(k){return isWeekendKey(k)?WEEKEND_CONCLUSION_MAX:500;}

const VERSION="1.0.0",SCHEMA_VERSION=4,DB_NAME="minimal-daily-os",DB_VERSION=3,MAX_PRIORITIES=10,MAX_LAUNCHERS=30;
const SAFE_PROTOCOLS=new Set(["https:","http:","tel:","sms:","mailto:","facetime:","facetime-audio:","shortcuts:","maps:","music:","spotify:"]);
const ACCENTS={mint:["#9C4C2A","156,76,42"],ice:["#41607A","65,96,122"],amber:["#7E5E14","126,94,20"],violet:["#76465F","118,70,95"],coral:["#9A3B28","154,59,40"],blue:["#566649","86,102,73"]};
const ACCENT_LABELS={mint:"Clay",ice:"Slate",amber:"Ochre",violet:"Plum",coral:"Rust",blue:"Sage"};
const DEFAULT_LAUNCHERS=[
 {id:"calls",name:"Calls",url:"tel:",symbol:"C",color:"#9cffc8",pinned:true,order:0},
 {id:"messages",name:"Messages",url:"sms:",symbol:"M",color:"#8fdcff",pinned:true,order:1},
 {id:"maps",name:"Maps",url:"https://maps.apple.com/",symbol:"↗",color:"#ffc56e",pinned:false,order:2},
 {id:"music",name:"Music",url:"https://music.apple.com/",symbol:"♪",color:"#c9a7ff",pinned:false,order:3}
];
const $=id=>document.getElementById(id);let db=null,fallback=false,config,days=[],activeDate=defaultLogUnit(),editable=true,dialogMode="",conclusionTimer,toastTimer,focusInterval,patternSelectedId="",patternRange="30",pendingBackup=null;const scoreBaselines=new Map();

document.addEventListener("DOMContentLoaded",init);
async function init(){bind();await openDatabase();await loadData();await migrateLegacy();await migrateItemIdentity();await migrateWeekendUnits();await initSync();await ensureToday();renderAll();tick();syncFocusTimer();setInterval(tick,1000);focusInterval=setInterval(syncFocusTimer,500);addEventListener("online",renderOnline);addEventListener("offline",renderOnline);addEventListener("focus",resumeForeground);addEventListener("pageshow",resumeForeground);document.addEventListener("visibilitychange",()=>{if(!document.hidden)resumeForeground();});registerServiceWorker();startSync();await checkReminder();}

function bind(){
 $("item-form").addEventListener("click",e=>{if(e.target.closest('button[value="cancel"]')){e.preventDefault();$("item-dialog").close();}});
 document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>b.dataset.view==="today"?backToToday():showView(b.dataset.view)));
 $("priority-form").addEventListener("submit",e=>addPriority(e,false));$("tomorrow-form").addEventListener("submit",e=>addPriority(e,true));
 $("priority-list").addEventListener("click",itemAction);$("tomorrow-list").addEventListener("click",itemAction);$("moves-list").addEventListener("click",itemAction);$("move-settings").addEventListener("click",itemAction);$("move-form").addEventListener("submit",addMove);
 $("launcher-grid").addEventListener("click",launcherAction);$("add-launcher").addEventListener("click",()=>openItemDialog("launcher"));
 $("item-form").addEventListener("submit",saveDialogItem);$("item-dialog").addEventListener("close",()=>{$("dialog-error").textContent="";});
 $("conclusion").addEventListener("input",queueConclusion);$("edit-day-button").addEventListener("click",async()=>{if(activeDate>dateKey())return;const day=currentDay();if(!getDay(activeDate)){day.rolloverResolved="archive";await persistDay(day);}editable=true;renderToday();});
 $("history-year").addEventListener("change",renderHistory);$("history-list").addEventListener("click",e=>{const b=e.target.closest("[data-date]");if(b)openHistoricalDay(b.dataset.date);});
 $("history-date-form").addEventListener("submit",e=>{e.preventDefault();openHistoricalDay($("history-date").value);});$("fill-day-toggle").addEventListener("click",()=>{const form=$("history-date-form"),open=form.hidden;form.hidden=!open;$("fill-day-toggle").setAttribute("aria-expanded",String(open));if(open)$("history-date").focus();});$("heatmap").addEventListener("click",e=>{const b=e.target.closest("[data-date]");if(b)openHistoricalDay(b.dataset.date);});$("past-move-form").addEventListener("submit",addPastMove);$("return-today").addEventListener("click",backToToday);$("mode-log").addEventListener("click",()=>{activeDate=defaultLogUnit();editable=true;renderToday();scrollTo({top:0,behavior:"smooth"});});$("mode-plan").addEventListener("click",()=>{activeDate=todayKey();editable=true;renderToday();scrollTo({top:0,behavior:"smooth"});});$("item-menu-actions").addEventListener("click",runItemMenuAction);
 $("open-patterns").addEventListener("click",()=>showView("patterns"));$("patterns-back").addEventListener("click",()=>showView("history"));$("pattern-search").addEventListener("input",renderPatterns);$("pattern-item").addEventListener("change",()=>{patternSelectedId=$("pattern-item").value;renderPatterns();});$("pattern-ranges").addEventListener("click",e=>{const b=e.target.closest("[data-range]");if(!b)return;patternRange=b.dataset.range;$("pattern-custom").hidden=patternRange!=="custom";renderPatterns();});$("apply-pattern-range").addEventListener("click",renderPatterns);$("pattern-timeline").addEventListener("click",e=>{const b=e.target.closest("[data-pattern-date]");if(b)openPatternDay(b.dataset.patternDate);});
 $("profile-form").addEventListener("submit",saveProfile);$("accent-options").addEventListener("click",e=>{const b=e.target.closest("[data-accent]");if(b){config.accent=b.dataset.accent;applyAccent();renderSettings();}});
 ensureBackupUi();$("export-json").addEventListener("click",()=>exportJson());$("export-readable").addEventListener("click",exportReadable);$("import-json").addEventListener("change",importJson);$("backup-merge-start").addEventListener("click",()=>showBackupConfirmation("merge"));$("backup-restore-start").addEventListener("click",()=>showBackupConfirmation("restore"));$("backup-confirm-merge").addEventListener("click",confirmBackupMerge);$("backup-confirm-restore").addEventListener("click",confirmBackupRestore);$("backup-cancel-merge").addEventListener("click",()=>hideBackupConfirmation("merge"));$("backup-cancel-restore").addEventListener("click",()=>hideBackupConfirmation("restore"));$("backup-cancel-import").addEventListener("click",cancelBackupImport);
 $("clear-data").addEventListener("click",()=>{$("clear-confirm").hidden=false;$("clear-phrase").focus();});$("cancel-clear").addEventListener("click",()=>{$("clear-confirm").hidden=true;});$("confirm-clear").addEventListener("click",clearAll);
 $("share-feedback").addEventListener("click",shareFeedback);bindSync();$("rollover-dialog").addEventListener("close",finishRollover);$("save-prompts").addEventListener("click",savePrompts);$("dismiss-reminder").addEventListener("click",dismissReminder);$("active-focus-bar").addEventListener("click",showFocusLayer);document.querySelectorAll("[data-focus-minutes]").forEach(b=>b.addEventListener("click",()=>setFocusDuration(Number(b.dataset.focusMinutes))));$("set-custom-focus").addEventListener("click",()=>setFocusDuration(Number($("custom-focus-minutes").value)));$("focus-start").addEventListener("click",startFocusTimer);$("focus-pause").addEventListener("click",pauseFocusTimer);$("focus-reset").addEventListener("click",resetFocusTimer);$("focus-back").addEventListener("click",backToToday);$("focus-break").addEventListener("click",startFocusBreak);$("focus-mark-done").addEventListener("click",markFocusedItemDone);
}

function defaultConfig(){return{key:"main",version:VERSION,name:"",initials:"",locationLabel:"",accent:"mint",milestoneEnabled:true,reminder:{enabled:false,time:"18:00"},focusTimer:null,moves:[],items:[],identityMigrated:false,launchers:DEFAULT_LAUNCHERS,updatedAt:Date.now(),lastDate:null,lastExportAt:null,weekendMigratedAt:null,migrated:false};}
function blankDay(date,moves=config.moves){return{date,priorities:[],planned:[],moves:moves.filter(m=>m.enabled!==false).map(m=>({id:m.id,label:m.label,status:"pending",enabled:true,order:m.order})),focusSessions:[],conclusion:"",milestoneCelebrated:false,reminderShown:false,reminderDismissed:false,weekend:isWeekendKey(date),loggedAt:null,rolloverResolved:null,updatedAt:Date.now()};}
function openDatabase(){return new Promise(resolve=>{if(!("indexedDB" in window)){fallback=true;resolve();return;}const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("config"))d.createObjectStore("config",{keyPath:"key"});if(!d.objectStoreNames.contains("days"))d.createObjectStore("days",{keyPath:"date"});if(!d.objectStoreNames.contains("sync"))d.createObjectStore("sync",{keyPath:"key"});};r.onsuccess=()=>{db=r.result;db.onversionchange=()=>db.close();resolve();};r.onerror=()=>{fallback=true;resolve();};});}
async function loadData(){try{if(fallback){const raw=JSON.parse(localStorage.getItem("minimal.2.2.fallback")||"null");config=sanitizeConfig(raw?.config);days=Array.isArray(raw?.days)?raw.days.map(sanitizeDay).filter(Boolean):[];}else{config=sanitizeConfig(await idbGet("config","main"));days=(await idbAll("days")).map(sanitizeDay).filter(Boolean);}}catch{fallback=true;config=defaultConfig();days=[];showToast("Local database unavailable. Using temporary local storage.");}config=config||defaultConfig();config.lastExportAt=config.lastExportAt||localStorage.getItem("minimal.last-export")||null;applyAccent();}
function idbGet(store,key){return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function idbAll(store){return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function idbPut(store,value){return new Promise((res,rej)=>{const r=db.transaction(store,"readwrite").objectStore(store).put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
async function persistConfig(){config.updatedAt=Date.now();syncAfterSave();if(fallback)return saveFallback();try{await idbPut("config",config);}catch{fallback=true;saveFallback();}}
async function persistDay(day){day.updatedAt=Date.now();syncAfterSave();const i=days.findIndex(d=>d.date===day.date);if(i<0)days.push(day);else days[i]=day;if(fallback)return saveFallback();try{await idbPut("days",day);}catch{fallback=true;saveFallback();}}
function saveFallback(){try{localStorage.setItem("minimal.2.2.fallback",JSON.stringify({config,days}));}catch{showToast("Changes could not be saved. Export a backup now.");}}

async function migrateLegacy(){if(config.migrated)return;const keys=["minimal.private-beta.2.1","minimal.phone.state.v2","minimal.phone.state"];for(const key of keys){try{const old=JSON.parse(localStorage.getItem(key)||"null");if(!old)continue;const src=old.state||old;if(src.profile){config.name=text(src.profile.name,40);config.accent=ACCENTS[src.profile.accent]?src.profile.accent:config.accent;}if(Array.isArray(src.apps)){config.launchers=src.apps.slice(0,MAX_LAUNCHERS).map((a,i)=>({id:safeId(a.id,"app"),name:text(a.name,40)||"App",url:normalizeUrl(a.target||a.url)||"https://example.com/",symbol:text(a.symbol,3)||text(a.name,1).toUpperCase(),color:validColor(a.color)?a.color:"#9cffc8",pinned:Boolean(a.pinned),order:i}));}const today=getDay(todayKey())||blankDay(todayKey());if(Array.isArray(src.tasks)&&!today.priorities.length)today.priorities=src.tasks.slice(0,10).map((t,i)=>({id:safeId(t.id,"priority"),text:text(t.text||t.title,140),status:t.done||t.completed?"done":"pending",order:i}));if(text(src.priority,140)&&today.priorities.length<10)today.priorities.unshift({id:uid("priority"),text:text(src.priority,140),status:"pending",order:0});await persistDay(today);break;}catch{/* Ignore corrupt legacy state. */}}config.migrated=true;await persistConfig();}
async function migrateItemIdentity(persist=true){if(config.identityMigrated)return;const registry=Array.isArray(config.items)?config.items:[],byId=new Map(registry.map(i=>[i.id,i])),byName=(type,name)=>registry.find(i=>i.type===type&&normalizeItemName(i.name)===normalizeItemName(name));
 config.moves.forEach(move=>{let item=byId.get(move.id)||byName("move",move.label);if(!item){item={id:move.id,type:"move",name:move.label,activePeriods:[],createdDate:null,deleted:false};registry.push(item);byId.set(item.id,item);}if(item.id!==move.id){const oldId=move.id;move.id=item.id;days.forEach(day=>day.moves.forEach(snapshot=>{if(snapshot.id===oldId||normalizeItemName(snapshot.label)===normalizeItemName(move.label))snapshot.id=item.id;}));}item.name=move.label;item.deleted=false;});
 [...days].sort((a,b)=>a.date.localeCompare(b.date)).forEach(day=>{day.moves.forEach(snapshot=>{let item=byId.get(snapshot.id)||byName("move",snapshot.label);if(!item){item={id:snapshot.id,type:"move",name:snapshot.label,activePeriods:[],createdDate:day.date,deleted:!config.moves.some(m=>m.id===snapshot.id)};registry.push(item);byId.set(item.id,item);}snapshot.id=item.id;});day.priorities.forEach(snapshot=>{let item=byId.get(snapshot.id)||byName("priority",snapshot.text);if(!item){item={id:snapshot.id,type:"priority",name:snapshot.text,activePeriods:[],createdDate:day.date,deleted:false};registry.push(item);byId.set(item.id,item);}snapshot.id=item.id;});day.planned.forEach(snapshot=>{let item=byId.get(snapshot.id)||byName("priority",snapshot.text);if(!item){item={id:snapshot.id,type:"priority",name:snapshot.text,activePeriods:[],createdDate:shiftDate(day.date,1),deleted:false};registry.push(item);byId.set(item.id,item);}snapshot.id=item.id;});});
 registry.forEach(item=>{const occurrences=days.filter(day=>(item.type==="move"?day.moves:day.priorities).some(x=>x.id===item.id&&(item.type!=="move"||x.enabled!==false))).map(day=>day.date).sort();item.createdDate=item.createdDate||occurrences[0]||dateKey();if(item.activePeriods.length)return;if(item.type==="move"&&occurrences.length){const configured=config.moves.find(m=>m.id===item.id);item.activePeriods=[{start:occurrences[0],end:configured?.enabled!==false?null:occurrences.at(-1)}];}else item.activePeriods=periodsFromDates(occurrences);});
 config.items=registry;config.identityMigrated=true;if(persist){await persistConfig();for(const day of days)await persistDay(day);}}
async function migrateWeekendUnits(){const result=migrateWeekends(days);if(!result.changed)return false;try{if(!localStorage.getItem(WEEKEND_BACKUP_KEY))localStorage.setItem(WEEKEND_BACKUP_KEY,JSON.stringify({app:"Minimal",reason:"pre-weekend-merge",createdAt:new Date().toISOString(),schemaVersion:SCHEMA_VERSION,config,days}));}catch{showToast("Weekend merge postponed: a safety backup could not be saved. Export a backup in Settings.",6000);return false;}const merged=result.days.map(sanitizeDay).filter(Boolean),nextConfig={...config,weekendMigratedAt:config.weekendMigratedAt||Date.now()};try{await writeDataset(nextConfig,merged);}catch{showToast("Weekend merge could not be saved. Your data is unchanged.",6000);return false;}config=nextConfig;days=merged;return true;}
async function ensureToday(){const today=todayKey();activeDate=defaultLogUnit();editable=true;let day=getDay(today);if(!day){day=blankDay(today);const yesterday=latestDayBefore(today);if(yesterday?.planned?.length)day.priorities=yesterday.planned.slice(0,10).map((p,i)=>({id:p.id,text:p.text,status:"pending",order:i}));day.priorities.forEach(p=>markItemEligible(p.id,today));await persistDay(day);}const previous=latestDayBefore(defaultLogUnit());config.lastDate=dateKey();await persistConfig();if(previous&&previous.date!==today&&isLogged(previous)&&previous.priorities.some(p=>p.status!=="done")&&!previous.rolloverResolved){$("rollover-message").textContent=`${previous.priorities.filter(p=>p.status!=="done").length} unfinished item(s) remain from ${isWeekendKey(previous.date)?`the Weekend of ${unitDateText(previous.date)}`:formatDate(previous.date)}. Planned items are already in today.`;$("rollover-dialog").dataset.from=previous.date;$("rollover-dialog").showModal();}}
async function finishRollover(){const choice=$("rollover-dialog").returnValue;if(!["carry","archive","delete"].includes(choice))return;const old=getDay($("rollover-dialog").dataset.from),today=getDay(todayKey());if(!old||!today)return;const unfinished=old.priorities.filter(p=>p.status!=="done");if(choice==="carry"){const existing=new Set(today.priorities.map(p=>p.text.toLowerCase()));for(const p of unfinished){if(today.priorities.length>=10)break;if(!existing.has(p.text.toLowerCase())){today.priorities.push({id:p.id,text:p.text,status:"pending",order:today.priorities.length});markItemEligible(p.id,today.date);}}}if(choice==="delete")old.priorities=old.priorities.filter(p=>p.status==="done");old.rolloverResolved=choice;await Promise.all([persistDay(old),persistDay(today),persistConfig()]);renderAll();showToast(choice==="carry"?"Unfinished priorities carried forward.":choice==="delete"?"Unfinished priorities deleted.":"Unfinished priorities archived incomplete.");}

function renderAll(){renderOnline();renderToday();renderLauncher();renderHistoryYears();renderHistory();renderSettings();renderBackupStatus();renderPatterns();renderFocusTimer();$("move-form").querySelector("button").disabled=false;}
let historicalDraft=null;
function currentDay(){if(getDay(activeDate))return getDay(activeDate);if(!historicalDraft||historicalDraft.date!==activeDate)historicalDraft=blankDay(activeDate);return historicalDraft;}
/* ---------- Day screen (Clay): one screen with a Log | Plan switch ---------- */
function modeName(k){
  if(isWeekendKey(k))return "Weekend";
  return isYesterday(k)?"Yesterday":weekdayName(k);
}
function dayDateLine(k,loggable){
  const d=parseDate(k),thisYear=d.getFullYear()===new Date().getFullYear();
  const part=x=>`${x.toLocaleDateString(undefined,{weekday:"long"})} ${x.getDate()}`;
  const month=x=>x.toLocaleDateString(undefined,{month:"long"})+(thisYear?"":` ${x.getFullYear()}`);
  let text;
  if(isWeekendKey(k)){const end=parseDate(unitEnd(k));text=end.getMonth()===d.getMonth()?`${part(d)} – ${part(end)} ${month(end)}`:`${part(d)} ${month(d)} – ${part(end)} ${month(end)}`;}
  else text=`${part(d)} ${month(d)}`;
  if(!loggable)text+=isWeekendKey(k)?" · logging opens on Monday":" · logging opens tomorrow";
  return text;
}
function renderToday(){
  const day=currentDay(),isToday=activeDate===todayKey(),def=defaultLogUnit(),visibleMoves=day.moves.filter(m=>m.enabled!==false);
  editable=isToday?true:editable;
  const loggable=canLogUnit(activeDate),logMode=activeDate===def,view=$("today-view");
  view.classList.toggle("plan-mode",isToday);
  $("mode-log").textContent=`Log · ${modeName(def)}`;
  $("mode-log").setAttribute("aria-pressed",String(logMode));
  $("mode-plan").setAttribute("aria-pressed",String(isToday));
  $("today-title").textContent=isToday&&config.name?`Today, ${config.name}`:unitTitle(activeDate);
  $("today-date").textContent=dayDateLine(activeDate,loggable);
  $("log-lock").hidden=true;
  $("readonly-banner").hidden=isToday||logMode;
  $("readonly-banner").textContent=editable?"Editing this day. Changes save automatically.":"This day is read-only. Choose Edit this day to fill it in.";
  $("return-today").hidden=isToday||logMode;
  $("edit-day-button").hidden=isToday||editable;
  $("conclusion").maxLength=conclusionMax(activeDate);

  renderItems($("priority-list"),day.priorities,"priority",editable);
  $("priority-empty").hidden=day.priorities.length>0||editable;
  $("priority-count").textContent=`${day.priorities.length} of ${MAX_PRIORITIES}`;
  $("priority-form").hidden=!editable;

  // Plan mode lists Small Moves as one line; they are ticked when the day is logged.
  const sentence=isToday&&visibleMoves.length>0;
  $("moves-sentence").hidden=!sentence;
  $("moves-sentence").textContent=visibleMoves.map(m=>m.label).join(" · ");
  $("moves-card").hidden=sentence;
  renderItems($("moves-list"),sentence?[]:visibleMoves,"move",editable);
  $("moves-empty").hidden=visibleMoves.length>0||!isToday;
  $("moves-count").textContent=isToday?(visibleMoves.length?(isWeekendKey(activeDate)?"Tick them on Monday":"Tick them tomorrow"):""):`${visibleMoves.filter(m=>validStatus(m.status)==="done").length} of ${visibleMoves.length} done`;
  $("past-move-form").hidden=isToday||logMode||!editable;

  $("note-section").hidden=!loggable;
  $("conclusion").value=day.conclusion;
  $("conclusion").disabled=!editable||!loggable;

  $("tomorrow-section").hidden=!isToday;
  renderItems($("tomorrow-list"),day.planned,"tomorrow",editable);
  $("tomorrow-empty").hidden=day.planned.length>0||editable;
  $("tomorrow-count").textContent=`${day.planned.length} of ${MAX_PRIORITIES}`;
  $("tomorrow-form").hidden=!editable;
  renderScores(day);
}
function renderDayItems(root,items,type,canEdit){
  root.replaceChildren();
  const loggable=canLogUnit(activeDate),isToday=activeDate===todayKey();
  [...items].sort((a,b)=>a.order-b.order).forEach((item,index)=>{
    const status=validStatus(item.status),name=item.text||item.label,li=document.createElement("li");
    li.className=`item ${status}`;li.dataset.id=item.id;li.dataset.type=type;
    let lead;
    if(type!=="tomorrow"&&loggable){
      lead=document.createElement("button");lead.type="button";lead.className="check";lead.dataset.action="status-done";lead.disabled=!canEdit;
      lead.setAttribute("aria-pressed",String(status==="done"));
      lead.setAttribute("aria-label",status==="done"?`${name}: done. Mark as not done`:status==="skipped"?`${name}: skipped. Mark as done`:`${name}: not done. Mark as done`);
      const mark=document.createElement("span");mark.className="check-mark";mark.setAttribute("aria-hidden","true");lead.append(mark);
    }else{
      lead=document.createElement("span");lead.className="item-lead";lead.setAttribute("aria-hidden","true");lead.textContent=type==="tomorrow"?"→":String(index+1);
    }
    const content=document.createElement("span"),label=document.createElement("span");
    content.className="item-content";label.className="item-text";label.textContent=name;content.append(label);
    const notes=[];
    if(status==="skipped"&&loggable)notes.push("Skipped");
    const summary=focusSummary(currentDay(),type,item.id);if(summary)notes.push(summary);
    if(notes.length){const meta=document.createElement("small");meta.className="item-meta";meta.textContent=notes.join(" · ");content.append(meta);}
    li.append(lead,content);
    if(canEdit&&isToday&&type==="priority"){const focus=document.createElement("button");focus.type="button";focus.className="focus-pill";focus.dataset.action="focus";focus.textContent="Focus";focus.setAttribute("aria-label",`Focus on ${name}`);li.append(focus);}
    if(canEdit){const more=document.createElement("button");more.type="button";more.className="menu-button";more.dataset.action="menu";more.textContent="⋯";more.setAttribute("aria-label",`More for ${name}`);li.append(more);}
    root.append(li);
  });
}
function renderScoreLine(day){
  const line=$("score-line");
  if(!canLogUnit(day.date)){line.hidden=true;return;}
  line.hidden=false;
  const enabledMoves=day.moves.filter(m=>m.enabled!==false),p=score(day.priorities),m=score(enabledMoves),all=score([...day.priorities,...enabledMoves]),previous=scoreBaselines.get(day.date);
  $("overall-score").textContent=all.percent===null?"—":`${all.percent}%`;
  $("priority-score").textContent=`Priorities ${p.done}/${p.total}`;
  $("moves-score").textContent=`Moves ${m.done}/${m.total}`;
  $("target-status").textContent=all.percent===null?"Not measured":all.percent>=80?"Target reached":"Below the 80% target";
  $("score-fill").style.width=`${all.percent||0}%`;
  line.classList.toggle("reached",all.percent!==null&&all.percent>=80);
  scoreBaselines.set(day.date,all.percent??0);
  if(previous!==undefined&&previous<80&&all.percent!==null&&all.percent>=80&&config.milestoneEnabled&&!day.milestoneCelebrated){day.milestoneCelebrated=true;persistDay(day);showToast("80% secured — the essential work is done.",5000);}
}
let itemMenuContext=null;
function openItemMenu(listId,li){
  const type=li.dataset.type,day=currentDay(),list=type==="priority"?day.priorities:type==="tomorrow"?day.planned:day.moves;
  const sorted=[...list].sort((a,b)=>a.order-b.order),index=sorted.findIndex(i=>i.id===li.dataset.id);
  if(index<0)return;
  const item=sorted[index],actions=[];
  if(activeDate===todayKey()&&(type==="priority"||type==="move"))actions.push(["focus","Focus"]);
  if(type!=="tomorrow"&&canLogUnit(activeDate))actions.push(["status-skipped",validStatus(item.status)==="skipped"?"Undo skip":"Skip"]);
  if(index>0)actions.push(["up","Move up"]);
  if(index<sorted.length-1)actions.push(["down","Move down"]);
  if(type!=="move"||activeDate<todayKey())actions.push(["edit","Edit"],["delete","Delete"]);
  itemMenuContext={listId,id:item.id};
  $("item-menu-title").textContent=item.text||item.label;
  $("item-menu-actions").replaceChildren(...actions.map(([action,label])=>{const b=document.createElement("button");b.type="button";b.dataset.action=action;b.textContent=label;b.className=action==="delete"?"sheet-action danger":"sheet-action";return b;}));
  $("item-menu").showModal();
}
async function runItemMenuAction(e){
  const button=e.target.closest("[data-action]");
  if(!button||!itemMenuContext)return;
  const{listId,id}=itemMenuContext;itemMenuContext=null;
  $("item-menu").close();
  const li=[...$(listId).querySelectorAll("[data-id]")].find(x=>x.dataset.id===id);
  if(li)await runItemAction(listId,li,button.dataset.action);
}
function renderItems(root,items,type,canEdit){renderDayItems(root,items,type,canEdit);}
function actionButton(label,action,aria){const b=document.createElement("button");b.type="button";b.className="icon-action";b.dataset.action=action;b.textContent=label;b.setAttribute("aria-label",aria);return b;}
async function itemAction(e){const button=e.target.closest("[data-action]"),li=e.target.closest("[data-id]");if(!button||!li)return;if(button.dataset.action==="menu")return openItemMenu(e.currentTarget.id,li);return runItemAction(e.currentTarget.id,li,button.dataset.action);}
async function runItemAction(listId,li,actionName){if(!editable&&listId!=="move-settings")return;const day=currentDay(),type=li.dataset.type,isMoveSettings=listId==="move-settings",list=type==="priority"?day.priorities:type==="tomorrow"?day.planned:isMoveSettings?config.moves:day.moves;const index=list.findIndex(i=>i.id===li.dataset.id);if(index<0)return;const action=actionName,item=list[index];if(action==="focus")return openFocus(day.date,type,item);if(action==="rename-move")return openItemDialog("moveconfig",item);if((action==="status-done"||action==="status-skipped")&&!canLogUnit(day.date))return showToast(lockNote(day.date));if(isMoveSettings&&action==="toggle-enabled"){item.enabled=item.enabled===false;setItemEnabled(item.id,item.enabled);}
 else if(action==="status-done"){item.status=item.status==="done"?"pending":"done";day.loggedAt=day.loggedAt||Date.now();}else if(action==="status-skipped"){item.status=item.status==="skipped"?"pending":"skipped";day.loggedAt=day.loggedAt||Date.now();}else if(action==="delete"){if(isMoveSettings){const registry=getRegistryItem(item.id);if(registry){registry.deleted=true;closeActivePeriod(registry,shiftDate(dateKey(),-1));}const snapshot=getDay(todayKey())?.moves.find(m=>m.id===item.id);if(snapshot)snapshot.enabled=false;}else if(type==="priority"&&day.date===todayKey()){const registry=getRegistryItem(item.id);if(registry)registry.deleted=true;}list.splice(index,1);}else if(action==="up"&&index>0)[list[index-1],list[index]]=[list[index],list[index-1]];else if(action==="down"&&index<list.length-1)[list[index+1],list[index]]=[list[index],list[index+1]];else if(action==="edit")return openItemDialog(type,item);list.forEach((v,i)=>v.order=i);if(isMoveSettings){await syncCurrentDayMoves();await persistConfig();}else{await persistDay(day);if(action==="delete")await persistConfig();}renderAll();await checkReminder();}

async function syncCurrentDayMoves(){const day=getDay(todayKey());if(!day)return;config.moves.forEach((move,index)=>{let snapshot=day.moves.find(m=>m.id===move.id);if(!snapshot){snapshot={id:move.id,label:move.label,status:"pending",enabled:move.enabled!==false,order:index};day.moves.push(snapshot);}snapshot.label=move.label;snapshot.enabled=move.enabled!==false;snapshot.order=index;});await persistDay(day);}

async function addMove(e){e.preventDefault();const input=$("move-input"),label=text(input.value,80),message=$("move-form-message");message.textContent="";if(!label)return;if(config.moves.length>=10){message.textContent="You can configure up to 10 Small Moves. Delete one before adding another.";return;}if(config.moves.some(m=>m.label.toLowerCase()===label.toLowerCase())){message.textContent="That Small Move already exists.";return;}const id=uid("move");config.moves.push({id,label,enabled:true,order:config.moves.length});config.items.push({id,type:"move",name:label,createdDate:dateKey(),activePeriods:[{start:dateKey(),end:null}],deleted:false});input.value="";await syncCurrentDayMoves();await persistConfig();renderAll();message.textContent="Small Move added.";}
async function addPriority(e,tomorrow){e.preventDefault();if(!editable)return;const input=$(tomorrow?"tomorrow-input":"priority-input"),value=text(input.value,140),day=currentDay(),list=tomorrow?day.planned:day.priorities;if(!value)return;if(list.length>=MAX_PRIORITIES)return showToast("The daily limit is 10 priorities.");if(list.some(p=>p.text.toLowerCase()===value.toLowerCase()))return showToast("That priority is already listed.");let registry=config.items.find(i=>i.type==="priority"&&normalizeItemName(i.name)===normalizeItemName(value));if(!registry){registry={id:uid("priority"),type:"priority",name:value,createdDate:tomorrow?shiftDate(day.date,1):day.date,activePeriods:[],deleted:false};config.items.push(registry);}list.push({id:registry.id,text:value,status:"pending",order:list.length});if(!tomorrow)markItemEligible(registry.id,day.date);input.value="";await Promise.all([persistDay(day),persistConfig()]);renderToday();}
function renderScores(day){renderScoreLine(day);}
function score(items){const tracked=items.filter(i=>i.enabled!==false),total=tracked.length,done=tracked.filter(i=>validStatus(i.status)==="done").length;return{done,total,percent:total?Math.round(done/total*100):null};}function setScore(id,s){$(id).textContent=s.percent===null?"Not measured":`${s.percent}%`;}
function queueConclusion(){if(!editable||!canLogUnit(activeDate))return;const day=currentDay(),value=text($("conclusion").value,conclusionMax(day.date),true);day.conclusion=value;if(value)day.loggedAt=day.loggedAt||Date.now();$("conclusion-status").textContent="Saving…";conclusionTimer=setTimeout(async()=>{await persistDay(day);if(activeDate===day.date)$("conclusion-status").textContent="Saved locally";renderHistory();},550);}

function renderLauncher(){const root=$("launcher-grid");root.replaceChildren();const sorted=[...config.launchers].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||a.order-b.order);sorted.forEach((app,index)=>{const wrap=document.createElement("div");const b=document.createElement("button");b.type="button";b.className=`launcher${app.pinned?" pinned":""}`;b.style.setProperty("--launcher-accent",app.color);b.dataset.action="open";b.dataset.id=app.id;const symbol=document.createElement("span");symbol.className="launcher-symbol";symbol.textContent=app.symbol||app.name[0];const name=document.createElement("strong");name.textContent=app.name;b.append(symbol,name);const manage=document.createElement("div");manage.className="launcher-manage";if(index>0)manage.append(actionButton("↑","launcher-up","Move up"));if(index<sorted.length-1)manage.append(actionButton("↓","launcher-down","Move down"));manage.append(actionButton("Edit","launcher-edit","Edit launcher"),actionButton("Delete","launcher-delete","Delete launcher"));manage.dataset.id=app.id;wrap.append(b,manage);root.append(wrap);});$("launcher-empty").hidden=config.launchers.length>0;$("add-launcher").disabled=config.launchers.length>=MAX_LAUNCHERS;}
async function launcherAction(e){const target=e.target.closest("[data-action]");if(!target)return;const id=(target.closest("[data-id]")||{}).dataset?.id,app=config.launchers.find(a=>a.id===id),action=target.dataset.action;if(!app)return;if(action==="open"){const url=normalizeUrl(app.url);if(!url)return showToast("This launcher has an invalid destination.");let returned=false;const onReturn=()=>{returned=true;document.removeEventListener("visibilitychange",onReturn);};document.addEventListener("visibilitychange",onReturn);location.href=url;setTimeout(()=>{if(!returned&&!document.hidden)showToast("iOS may not support this deep link. Edit it or use an HTTPS/Shortcuts link.");},1400);return;}if(action==="launcher-edit")return openItemDialog("launcher",app);if(action==="launcher-delete")config.launchers=config.launchers.filter(a=>a.id!==id);else{const sorted=[...config.launchers].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||a.order-b.order),i=sorted.findIndex(a=>a.id===id),swap=action==="launcher-up"?i-1:i+1;if(swap>=0&&swap<sorted.length){[sorted[i],sorted[swap]]=[sorted[swap],sorted[i]];sorted.forEach((a,n)=>a.order=n);}}await persistConfig();renderLauncher();}
function openItemDialog(mode,item){dialogMode=mode;$("item-id").value=item?.id||"";$("item-text").value=item?.text||item?.label||item?.name||"";$("launcher-fields").hidden=mode!=="launcher";$("item-dialog-title").textContent=mode==="moveconfig"?"Rename Small Move":item?`Edit ${mode}`:`Add ${mode}`;$("item-label").firstChild.textContent=mode==="launcher"?"Name":mode==="moveconfig"?"Label":"Text";if(mode==="launcher"){$("launcher-url").value=item?.url||"";$("launcher-symbol").value=item?.symbol||"";$("launcher-color").value=validColor(item?.color)?item.color:"#9cffc8";$("launcher-pinned").checked=Boolean(item?.pinned);}$("item-dialog").showModal();$("item-text").focus();}
async function saveDialogItem(e){e.preventDefault();const value=text($("item-text").value,dialogMode==="launcher"?40:140),id=$("item-id").value;if(!value)return;if(dialogMode==="launcher"){const url=normalizeUrl($("launcher-url").value);if(!url){$("dialog-error").textContent="Use HTTPS, HTTP on localhost, or a supported iPhone deep link. JavaScript and data URLs are blocked.";return;}if(!id&&config.launchers.length>=30)return showToast("Launcher limit reached (30).");const app=id?config.launchers.find(a=>a.id===id):null,data={id:app?.id||uid("app"),name:value,url,symbol:text($("launcher-symbol").value,3)||value[0].toUpperCase(),color:$("launcher-color").value,pinned:$("launcher-pinned").checked,order:app?.order??config.launchers.length};if(app)Object.assign(app,data);else config.launchers.push(data);await persistConfig();renderLauncher();}else if(dialogMode==="moveconfig"){const move=config.moves.find(m=>m.id===id),registry=getRegistryItem(id);if(move)move.label=text(value,80);if(registry)registry.name=move.label;const today=getDay(todayKey()),snapshot=today?.moves.find(m=>m.id===id);if(snapshot){snapshot.label=move.label;await persistDay(today);}await persistConfig();renderAll();}else{const day=currentDay(),list=dialogMode==="priority"?day.priorities:dialogMode==="move"?day.moves:day.planned,item=list.find(i=>i.id===id),registry=dialogMode==="move"?null:getRegistryItem(id);if(!editable)return;if(item){if(dialogMode==="move")item.label=text(value,80);else item.text=value;}if(registry&&day.date===todayKey())registry.name=value;await Promise.all([persistDay(day),persistConfig()]);renderToday();}$("item-dialog").close();}

function renderSettings(){$("display-name").value=config.name;$("initials").value=config.initials;$("location-label").value=config.locationLabel;$("milestone-enabled").checked=config.milestoneEnabled;$("reminder-enabled").checked=config.reminder.enabled;$("reminder-time").value=config.reminder.time;const accents=$("accent-options");accents.replaceChildren();Object.entries(ACCENTS).forEach(([name,[color]])=>{const b=document.createElement("button");b.type="button";b.className=`accent-choice${config.accent===name?" selected":""}`;b.dataset.accent=name;b.style.setProperty("--swatch",color);b.setAttribute("aria-label",`${ACCENT_LABELS[name]||name} accent`);b.setAttribute("aria-pressed",String(config.accent===name));accents.append(b);});const root=$("move-settings");root.replaceChildren();config.moves.forEach((m,i)=>{const li=document.createElement("li");li.className=`item configured-move${m.enabled===false?" disabled":""}`;li.dataset.id=m.id;li.dataset.type="move";const state=document.createElement("span");state.className="move-state";state.textContent=m.enabled===false?"OFF":"ON";const label=document.createElement("span");label.className="item-text";label.textContent=m.label;const actions=document.createElement("span");actions.className="item-actions";if(i)actions.append(actionButton("↑","up","Move up"));if(i<config.moves.length-1)actions.append(actionButton("↓","down","Move down"));actions.append(actionButton("Rename","rename-move","Rename"),actionButton(m.enabled===false?"Enable":"Disable","toggle-enabled",m.enabled===false?"Enable":"Disable"),actionButton("Delete","delete","Delete"));li.append(state,label,actions);root.append(li);});$("move-config-count").textContent=`${config.moves.length} / 10`;$("move-settings-empty").hidden=config.moves.length>0;}
async function saveProfile(e){e.preventDefault();config.name=text($("display-name").value,40);config.initials=text($("initials").value,3).toUpperCase();config.locationLabel=text($("location-label").value,40);await persistConfig();renderAll();showToast("Profile saved.");}

async function savePrompts(){const previous=`${config.reminder.enabled}:${config.reminder.time}`,time=/^([01]\d|2[0-3]):[0-5]\d$/.test($("reminder-time").value)?$("reminder-time").value:"18:00";config.milestoneEnabled=$("milestone-enabled").checked;config.reminder={enabled:$("reminder-enabled").checked,time};if(previous!==`${config.reminder.enabled}:${time}`){const day=getDay(todayKey());if(day){day.reminderShown=false;day.reminderDismissed=false;await persistDay(day);}}await persistConfig();renderSettings();showToast("Daily prompts saved.");await checkReminder();}

function hasDailyActivity(day){return[...day.priorities,...day.moves.filter(m=>m.enabled!==false)].some(item=>validStatus(item.status)!=="pending");}
function reminderDue(now=new Date()){if(!config.reminder.enabled)return false;const day=getDay(todayKey());if(!day||day.reminderShown||day.reminderDismissed||isLogged(getDay(defaultLogUnit())))return false;const [hour,minute]=config.reminder.time.split(":").map(Number),threshold=new Date(now);threshold.setHours(hour,minute,0,0);return now>=threshold;}
async function checkReminder(){if(!config||document.hidden)return;const day=getDay(todayKey());if(isLogged(getDay(defaultLogUnit()))){$("reminder-banner").hidden=true;return;}if(!reminderDue())return;day.reminderShown=true;await persistDay(day);$("reminder-banner").hidden=false;}
async function dismissReminder(){const day=getDay(todayKey());$("reminder-banner").hidden=true;if(day){day.reminderDismissed=true;await persistDay(day);}}

function focusSummary(day,type,itemId){const sessions=(day.focusSessions||[]).filter(s=>s.itemType===type&&s.itemId===itemId),minutes=sessions.reduce((n,s)=>n+Math.round(s.plannedDuration/60),0);return sessions.length?`${sessions.length} focus${sessions.length===1?"":"es"} · ${minutes} min`:"";}
async function openFocus(date,itemType,item){const existing=config.focusTimer,label=text(item.text||item.label,140);if(existing&&!existing.acknowledged){showFocusLayer();if(existing.itemId!==item.id)showToast(`Focus is already attached to ${existing.itemLabel}. Reset or finish it first.`);return;}config.focusTimer={date,itemType,itemId:item.id||null,itemLabel:label,duration:1500,remaining:1500,running:false,endAt:null,completed:false,acknowledged:false,sessionRecorded:false,isBreak:false};await persistConfig();showFocusLayer();renderFocusTimer();}
function showFocusLayer(){if(!config.focusTimer)return;$("focus-layer").hidden=false;document.body.classList.add("focus-open");renderFocusTimer();$("focus-start").focus();}
async function backToToday(){const timer=config.focusTimer;if(timer?.completed){timer.acknowledged=true;await persistConfig();}$("focus-layer").hidden=true;document.body.classList.remove("focus-open");activeDate=todayKey();editable=true;showView("today");renderAll();}
async function setFocusDuration(minutes){const timer=config.focusTimer,value=Math.round(Number(minutes));if(!timer||timer.running||timer.completed)return;if(!Number.isFinite(value)||value<1||value>180)return showToast("Choose a duration from 1 to 180 minutes.");timer.duration=value*60;timer.remaining=timer.duration;timer.endAt=null;await persistConfig();renderFocusTimer();}
async function startFocusTimer(){const timer=config.focusTimer;if(!timer||timer.running||timer.completed)return;if(timer.remaining<=0)timer.remaining=timer.duration;timer.running=true;timer.endAt=Date.now()+timer.remaining*1000;await persistConfig();renderFocusTimer();}
async function pauseFocusTimer(){const timer=config.focusTimer;if(!timer||!timer.running||timer.completed)return;timer.remaining=remainingAt(timer,Date.now());timer.running=false;timer.endAt=null;await persistConfig();renderFocusTimer();}
async function resetFocusTimer(){config.focusTimer=null;await persistConfig();$("focus-layer").hidden=true;document.body.classList.remove("focus-open");renderFocusTimer();showToast("Focus timer reset.");}
async function startFocusBreak(){const prior=config.focusTimer;if(!prior?.completed||prior.isBreak)return;config.focusTimer={date:todayKey(),itemType:"break",itemId:null,itemLabel:"5-minute break",duration:300,remaining:300,running:false,endAt:null,completed:false,acknowledged:false,sessionRecorded:true,isBreak:true};await persistConfig();renderFocusTimer();}
async function markFocusedItemDone(){const timer=config.focusTimer;if(!timer?.completed||timer.isBreak)return;const day=getDay(timer.date),list=timer.itemType==="priority"?day?.priorities:day?.moves,item=list?.find(i=>i.id===timer.itemId);if(!item){showToast("The original item is no longer available. The focus session remains saved.");return;}if(!canLogUnit(day.date)){timer.acknowledged=true;await persistConfig();renderAll();showToast("Focus session saved. Mark it done when you log this day tomorrow.");return;}item.status="done";day.loggedAt=day.loggedAt||Date.now();timer.acknowledged=true;await persistDay(day);await persistConfig();renderAll();showToast(`${timer.itemLabel} marked done.`);}
function remainingAt(timer,now=Date.now()){return timer.running&&timer.endAt?Math.max(0,Math.ceil((timer.endAt-now)/1000)):Math.max(0,Math.round(timer.remaining||0));}
async function syncFocusTimer(now=Date.now()){const timer=config?.focusTimer;if(!timer){renderFocusTimer();return;}if(timer.running){const remaining=remainingAt(timer,now);timer.remaining=remaining;if(remaining<=0){const completedAt=timer.endAt||now;timer.running=false;timer.endAt=null;timer.completed=true;if(!timer.isBreak&&!timer.sessionRecorded){timer.sessionRecorded=true;await recordFocusSession(timer,completedAt);}await persistConfig();if(!document.hidden&&navigator.vibrate)try{navigator.vibrate(80);}catch{/* Visual completion remains sufficient. */}}}renderFocusTimer();}
async function recordFocusSession(timer,completedAt){const day=getDay(timer.date);if(!day)return;day.focusSessions=day.focusSessions||[];day.focusSessions.push({id:uid("focus"),date:timer.date,itemType:timer.itemType,itemId:timer.itemId,itemLabel:timer.itemLabel,plannedDuration:timer.duration,completedAt:new Date(completedAt).toISOString()});await persistDay(day);renderAll();}
function renderFocusTimer(){const timer=config?.focusTimer,bar=$("active-focus-bar");if(!timer){bar.hidden=true;$("focus-timer").textContent="25:00";return;}const remaining=remainingAt(timer),display=formatTimer(remaining);$("focus-title").textContent=timer.itemLabel;$("focus-context").textContent=timer.isBreak?"Break":"Attached to today’s "+(timer.itemType==="priority"?"priority":"Small Move");$("focus-timer").textContent=display;$("focus-status").textContent=timer.completed?(timer.isBreak?"Break complete":"Focus complete"):timer.running?"Running":remaining<timer.duration?"Paused":"Ready";$("focus-start").hidden=timer.running||timer.completed;$("focus-start").textContent=remaining<timer.duration?"Resume":"Start";$("focus-pause").hidden=!timer.running||timer.completed;$("duration-choices").hidden=timer.running||timer.completed||timer.isBreak;$("focus-complete-actions").hidden=!timer.completed||timer.isBreak;bar.hidden=timer.acknowledged||(!timer.running&&!timer.completed&&remaining===timer.duration);$("active-focus-label").textContent=`Focus: ${timer.itemLabel}`;$("active-focus-time").textContent=timer.completed?"Complete":display;bar.setAttribute("aria-label",`${timer.itemLabel}, ${timer.completed?"focus complete":display+" remaining"}. Return to Focus.`);}
function formatTimer(seconds){const safe=Math.max(0,Math.round(seconds));return`${String(Math.floor(safe/60)).padStart(2,"0")}:${String(safe%60).padStart(2,"0")}`;}
async function resumeForeground(){await syncFocusTimer();await checkReminder();}
function applyAccent(){const [color,rgb]=ACCENTS[config?.accent]||ACCENTS.mint;document.documentElement.style.setProperty("--accent",color);document.documentElement.style.setProperty("--accent-rgb",rgb);localStorage.setItem("minimal.accent",config?.accent||"mint");}

function renderHistoryYears(){const years=[...new Set(days.map(d=>d.date.slice(0,4)))].sort().reverse(),current=String(new Date().getFullYear());if(!years.includes(current))years.unshift(current);const select=$("history-year"),old=select.value;select.replaceChildren();years.forEach(y=>{const o=document.createElement("option");o.value=y;o.textContent=y;select.append(o);});select.value=years.includes(old)?old:current;}
function firstUnit(){const first=days.map(d=>d.date).sort()[0];return first?unitKey(first):todayKey();}
function clipSummary(from,to){const start=firstUnit()>from?firstUnit():from;return start>to?summarizeUnits([],to,shiftDate(to,-1)):summarizeUnits(days,start,to);}
function historyUnits(year){const yStart=`${year}-01-01`,yEnd=`${year}-12-31`,first=firstUnit(),start=first>yStart?first:yStart,today=todayKey(),end=today<yEnd?today:yEnd;const keys=start<=end?unitsBetween(start,end):[];days.forEach(d=>{if(d.date.startsWith(year)&&!keys.includes(d.date))keys.push(d.date);});return keys.sort((a,b)=>b.localeCompare(a));}


function calculateStreaks(records){return unitStreaks(records);}
function openHistoricalDay(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||dateKey(parseDate(date))!==date||date>dateKey())return showToast("Choose a valid date up to today.");date=unitKey(date);activeDate=date;editable=false;showView("today");renderToday();scrollTo({top:0,behavior:"smooth"});}

function renderPatternPicker(){const select=$("pattern-item"),query=normalizeItemName($("pattern-search").value),items=[...(config.items||[])].filter(i=>!query||normalizeItemName(i.name).includes(query)).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name)),previous=patternSelectedId||select.value;select.replaceChildren();items.forEach(item=>{const option=document.createElement("option");option.value=item.id;option.textContent=`${item.type==="move"?"Small Move":"Priority"} — ${item.name}`;select.append(option);});patternSelectedId=items.some(i=>i.id===previous)?previous:items[0]?.id||"";select.value=patternSelectedId;$("pattern-empty").hidden=items.length>0;$("pattern-content").hidden=!items.length;}
function renderPatterns(){if(!config?.items)return;renderPatternPicker();const item=getRegistryItem(patternSelectedId);if(!item)return;const bounds=patternRangeBounds(item);$("pattern-name").textContent=item.name;$("pattern-type").textContent=item.type==="move"?"SMALL MOVE":"PRIORITY";const enabled=!item.deleted&&(item.type==="move"?config.moves.some(m=>m.id===item.id&&m.enabled!==false):isItemEligible(item,dateKey()));$("pattern-state").textContent=enabled?"ENABLED":"DISABLED";$("pattern-state").classList.toggle("disabled",!enabled);$("pattern-period").textContent=formatActivePeriods(item.activePeriods);document.querySelectorAll("#pattern-ranges [data-range]").forEach(b=>{const selected=b.dataset.range===patternRange;b.classList.toggle("selected",selected);b.setAttribute("aria-pressed",String(selected));});$("pattern-custom").hidden=patternRange!=="custom";if(!bounds){$("pattern-range-label").textContent="Choose a valid custom range.";$("pattern-stats").replaceChildren();$("pattern-timeline").replaceChildren();return;}$("pattern-range-label").textContent=`${formatDate(bounds.start)} – ${formatDate(bounds.end)}`;const entries=patternEntries(item,bounds.start,bounds.end),eligible=entries.filter(e=>e.eligible),completed=eligible.filter(e=>e.status==="completed"),missed=eligible.length-completed.length,streaks=calculateItemStreaks(entries),completionDates=completed.map(entry=>entry.date),stats=[["Completed days",completed.length],["Eligible days",eligible.length],["Consistency",eligible.length?`${Math.round(completed.length/eligible.length*100)}%`:"Not measured"],["Current streak",streaks.current],["Longest streak",streaks.longest],["Missed days",missed],["First completion",completionDates.length?formatDate(completionDates[0]):"—"],["Last completion",completionDates.length?formatDate(completionDates.at(-1)):"—"]];renderPatternStats(stats);renderPatternTimeline(entries);}
function renderPatternStats(stats){const root=$("pattern-stats");root.replaceChildren();stats.forEach(([label,value])=>{const box=document.createElement("div"),strong=document.createElement("strong"),span=document.createElement("span");box.className="stat";strong.textContent=value;span.textContent=label;box.append(strong,span);root.append(box);});}
function renderPatternTimeline(entries){const root=$("pattern-timeline");root.replaceChildren();[...entries].reverse().forEach(entry=>{const row=document.createElement("button"),date=document.createElement("span"),state=document.createElement("span");row.type="button";row.className=`pattern-day ${entry.status}`;row.dataset.patternDate=entry.date;date.textContent=isWeekendKey(entry.date)?`Weekend, ${unitDateText(entry.date)}`:`${parseDate(entry.date).toLocaleDateString(undefined,{weekday:"short"})}, ${formatDate(entry.date)}`;state.className="pattern-day-state";state.textContent=entry.status==="completed"?"Completed":entry.status==="missed"?"Missed":entry.status==="inactive"?"Inactive":"No record yet";row.append(date,state);if(entry.status==="inactive"&&!getDay(entry.date)){row.disabled=true;row.removeAttribute("data-pattern-date");}root.append(row);});}
function patternRangeBounds(item){const end=dateKey(),first=item.activePeriods?.[0]?.start||item.createdDate||end;if(patternRange==="custom"){if(!$("pattern-from").value)$("pattern-from").value=first>end?end:first;if(!$("pattern-to").value)$("pattern-to").value=end;const start=$("pattern-from").value,customEnd=$("pattern-to").value;if(!validDateKey(start)||!validDateKey(customEnd)||start>customEnd)return null;return{start,end:customEnd>end?end:customEnd};}if(patternRange==="all")return{start:first>end?end:first,end};const amount=patternRange==="7"?6:patternRange==="30"?29:null;if(amount!==null)return{start:shiftDate(end,-amount),end};const d=parseDate(end),months=patternRange==="3m"?3:patternRange==="6m"?6:12;d.setMonth(d.getMonth()-months);return{start:shiftDate(dateKey(d),1),end};}
function patternEntries(item,start,end){const result=[];for(let cursor=unitKey(start);cursor<=end;cursor=nextUnit(cursor)){if(!canLogUnit(cursor))continue;const eligible=isItemEligible(item,cursor)||isItemEligible(item,unitEnd(cursor)),day=getDay(cursor),snapshot=day&&(item.type==="move"?day.moves:day.priorities).find(x=>x.id===item.id);let status="inactive";if(eligible&&(!snapshot||!isLogged(day)))status="unrecorded";else if(eligible&&validStatus(snapshot.status)==="done")status="completed";else if(eligible)status="missed";result.push({date:cursor,eligible,status});}return result;}
function calculateItemStreaks(entries){let longest=0,run=0;entries.forEach(entry=>{if(entry.status==="completed"){run++;longest=Math.max(longest,run);}else if(entry.eligible)run=0;else run=0;});let current=0;for(let i=entries.length-1;i>=0&&entries[i].status==="completed";i--)current++;return{current,longest};}
async function openPatternDay(date){const item=getRegistryItem(patternSelectedId);if(!item)return;let day=getDay(date);if(!day&&isItemEligible(item,date))day={...blankDay(date,[]),moves:[]};if(day&&isItemEligible(item,date)){const list=item.type==="move"?day.moves:day.priorities;if(!list.some(snapshot=>snapshot.id===item.id)){list.push(item.type==="move"?{id:item.id,label:item.name,status:"pending",enabled:true,order:list.length}:{id:item.id,text:item.name,status:"pending",order:list.length});await persistDay(day);}}openHistoricalDay(date);}

function ensureBackupUi(){const exportButton=$("export-json"),stack=exportButton.closest(".button-stack"),importLabel=$("import-json").closest("label");exportButton.textContent="Export Backup";if(importLabel.firstChild?.nodeType===Node.TEXT_NODE)importLabel.firstChild.textContent="Import Backup — Select File";const status=document.createElement("p");status.id="backup-status";status.className="save-status";status.setAttribute("aria-live","polite");stack.insertAdjacentElement("afterend",status);const workflow=document.createElement("section");workflow.id="backup-preview";workflow.className="backup-preview";workflow.hidden=true;workflow.setAttribute("aria-labelledby","backup-preview-title");workflow.innerHTML='<h3 id="backup-preview-title">Import preview</h3><dl id="backup-preview-details" class="backup-preview-details"></dl><div><strong>Migration warnings</strong><ul id="backup-warnings"></ul></div><div><strong>Validation errors</strong><ul id="backup-errors"></ul></div><p id="backup-invalid-count" class="field-note"></p><div class="backup-actions"><button id="backup-merge-start" type="button">Merge Backup</button><button id="backup-restore-start" class="secondary" type="button">Restore Backup</button><button id="backup-cancel-import" class="secondary" type="button">Cancel Import</button></div><div id="backup-merge-confirmation" class="backup-confirmation" hidden><p>Merge missing items and records. Existing records and settings stay in place.</p><div class="button-row"><button id="backup-confirm-merge" type="button">Confirm Merge</button><button id="backup-cancel-merge" class="secondary" type="button">Cancel</button></div></div><div id="backup-restore-confirmation" class="backup-confirmation" hidden><p>Current data will be downloaded as a recovery backup before it is replaced. Type <strong>RESTORE MINIMAL</strong> to continue.</p><label>Confirmation phrase<input id="backup-restore-phrase" autocomplete="off" spellcheck="false"></label><div class="button-row"><button id="backup-confirm-restore" class="danger" type="button">Export Recovery Backup and Restore</button><button id="backup-cancel-restore" class="secondary" type="button">Cancel</button></div></div><p id="backup-result" class="form-message" role="status" aria-live="polite"></p></section>';status.insertAdjacentElement("afterend",workflow);}
function renderBackupStatus(){const saved=config?.lastExportAt||localStorage.getItem("minimal.last-export"),date=saved&&new Date(saved);if(!saved||!date||Number.isNaN(date.getTime())){$("backup-status").textContent="No backup exported yet. Export Backup to save a local copy.";return;}const due=Date.now()-date.getTime()>=7*86400000;$("backup-status").textContent=`Last successful export: ${date.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}${due?" · Backup due":""}`;$("backup-status").classList.toggle("backup-due",due);}
function buildBackup(timestamp){const exportConfig={...JSON.parse(JSON.stringify(config)),lastExportAt:timestamp},exportDays=JSON.parse(JSON.stringify(days)),fallbackRaw=localStorage.getItem("minimal.2.2.fallback"),dates=exportDays.map(d=>d.date).sort();return{app:"Minimal",backupFormat:"PraxisMinimalBackup",backupFormatVersion:1,version:VERSION,schemaVersion:SCHEMA_VERSION,exportedAt:timestamp,dataRange:{from:dates[0]||null,to:dates.at(-1)||null},recordCounts:{items:exportConfig.items.length,days:exportDays.length},config:exportConfig,days:exportDays,storage:{active:fallback?"localStorage":"IndexedDB",fallbackKey:"minimal.2.2.fallback",fallbackRaw,fallbackSnapshot:{config:exportConfig,days:exportDays},lastExportKey:"minimal.last-export",lastExportAt:timestamp},statistics:exportStatistics()};}
function initiateBackupExport(kind="manual"){const timestamp=new Date().toISOString();config.lastExportAt=timestamp;const backup=buildBackup(timestamp);try{download(`minimal-${kind}-backup-${dateKey()}.json`,JSON.stringify(backup,null,2),"application/json");}catch(error){showToast("Backup could not be prepared for download.");return null;}try{localStorage.setItem("minimal.last-export",timestamp);}catch{/* The configuration copy remains authoritative. */}persistConfig().catch(()=>{});renderBackupStatus();return timestamp;}
async function exportJson(){if(!initiateBackupExport("user"))return;showToast("Backup download started.");}
function exportStatistics(){const result={};new Set(days.map(d=>d.date.slice(0,4))).forEach(year=>{const values=days.filter(d=>d.date.startsWith(year)).map(d=>score([...d.priorities,...d.moves]).percent).filter(v=>v!==null);result[year]={daysTracked:days.filter(d=>d.date.startsWith(year)).length,averageOverall:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null,targetDays:values.filter(v=>v>=80).length};});return result;}
function exportReadable(){const configured=config.moves.map(m=>`${m.enabled===false?"[disabled]":"[enabled]"} ${m.label}`).join("; ")||"None";const mark=i=>validStatus(i.status)==="done"?"[done]":validStatus(i.status)==="skipped"?"[skipped]":"[pending]";const lines=[`MINIMAL ${VERSION} EXECUTION BACKUP — ${new Date().toLocaleString()}`,"",`LOCATION LABEL: ${config.locationLabel||"None"}`,`CURRENT SMALL MOVES: ${configured}`,"",...[...days].sort((a,b)=>b.date.localeCompare(a.date)).flatMap(d=>{const s=score([...d.priorities,...d.moves]);return[`${formatDate(d.date)} — ${s.percent===null?"Not measured":s.percent+"%"}`,`Priorities: ${d.priorities.map(p=>`${mark(p)} ${p.text}`).join("; ")||"None"}`,`Small Moves: ${d.moves.map(m=>`${m.enabled===false?"[disabled]":mark(m)} ${m.label}`).join("; ")||"None"}`,`Conclusion: ${d.conclusion||"—"}`,""];})];download(`minimal-readable-${dateKey()}.txt`,lines.join("\n"),"text/plain");}
async function importJson(e){const file=e.target.files?.[0];e.target.value="";if(!file)return;cancelBackupImport();if(file.size>50*1024*1024){renderBackupPreview({errors:["Backup exceeds the 50 MB import limit."],warnings:[],skipped:0,schema:"Unknown",exportedAt:"Unknown",dateRange:"Unavailable",itemCount:0,dayCount:0});return;}try{const raw=JSON.parse(await file.text()),preview=await prepareBackup(raw);pendingBackup=preview.valid?preview:null;renderBackupPreview(preview);}catch{pendingBackup=null;renderBackupPreview({errors:["File is not valid JSON or could not be read."],warnings:[],skipped:0,schema:"Unknown",exportedAt:"Unknown",dateRange:"Unavailable",itemCount:0,dayCount:0});}}
async function prepareBackup(raw){const errors=[],warnings=[];if(!raw||typeof raw!=="object"||Array.isArray(raw))errors.push("Backup must contain a JSON object.");const schema=Number(raw?.schemaVersion??raw?.schema??1);if(![1,2,3,4].includes(schema))errors.push(`Unsupported schema version: ${String(raw?.schemaVersion??raw?.schema??"missing")}.`);if(raw?.app!=="Minimal")errors.push("Backup application marker is missing or unsupported.");if(raw?.backupFormatVersion&&Number(raw.backupFormatVersion)!==1)errors.push("Backup file format version is unsupported.");if(raw?.exportedAt&&Number.isNaN(new Date(raw.exportedAt).getTime()))errors.push("Export timestamp is malformed.");let rawConfig=raw?.config||raw?.state?.config||raw?.storage?.fallbackSnapshot?.config||raw?.fallbackStorage?.snapshot?.config;let rawDays=raw?.days||raw?.state?.days||raw?.storage?.fallbackSnapshot?.days||raw?.fallbackStorage?.snapshot?.days;if(!rawConfig||typeof rawConfig!=="object")errors.push("Configuration data is missing.");if(!Array.isArray(rawDays))errors.push("Day records are missing or malformed.");if(errors.length)return{valid:false,errors,warnings,skipped:0,schema:Number.isFinite(schema)?schema:"Unknown",exportedAt:raw?.exportedAt||"Unknown",dateRange:"Unavailable",itemCount:0,dayCount:0};if(schema<4||!rawConfig.identityMigrated||(rawConfig.items||[]).some(item=>!Array.isArray(item?.activePeriods)))warnings.push("Stable item identities and active periods will be inferred from older snapshots where possible.");if(raw.storage?.fallbackRaw||raw.fallbackStorage?.raw)warnings.push("This backup contains a localStorage fallback copy in addition to its primary records.");let skipped=0;const cleanConfig={...rawConfig};for(const key of ["moves","items","launchers"]){if(Array.isArray(cleanConfig[key])){const before=cleanConfig[key].length;cleanConfig[key]=cleanConfig[key].filter(entry=>entry&&typeof entry==="object"&&!Array.isArray(entry));skipped+=before-cleanConfig[key].length;if(key==="items"){const valid=cleanConfig.items.filter(sanitizeRegistryItem);skipped+=cleanConfig.items.length-valid.length;cleanConfig.items=valid;}}}let importedConfig=sanitizeConfig(cleanConfig);const cleanDays=[],seenDates=new Set();for(const rawDay of rawDays){if(!rawDay||typeof rawDay!=="object"||!validDateKey(rawDay.date)){skipped++;continue;}if(seenDates.has(rawDay.date)){skipped++;warnings.push(`Repeated day record skipped: ${rawDay.date}.`);continue;}seenDates.add(rawDay.date);const dayInput={...rawDay};for(const [key,labelKey,max] of [["priorities","text",10],["planned","text",10],["moves","label",10]]){const list=rawDay[key];if(list===undefined){dayInput[key]=[];continue;}if(!Array.isArray(list)){dayInput[key]=[];skipped++;continue;}if(list.length>max)skipped+=list.length-max;dayInput[key]=list.slice(0,max).filter(entry=>{const valid=entry&&typeof entry==="object"&&!Array.isArray(entry)&&typeof entry[labelKey]==="string"&&entry[labelKey].trim();if(!valid)skipped++;return Boolean(valid);});}if(Array.isArray(rawDay.focusSessions)){const sessions=[];rawDay.focusSessions.forEach(session=>{const clean=sanitizeFocusSession(session,rawDay.date);if(clean)sessions.push(clean);else skipped++;});dayInput.focusSessions=sessions;}else if(rawDay.focusSessions!==undefined){dayInput.focusSessions=[];skipped++;}const clean=sanitizeDay(dayInput);if(clean)cleanDays.push(clean);else skipped++;}
 if(skipped)warnings.push(`${skipped} malformed, repeated, or over-limit record(s) will be skipped.`);const isolated=await migrateBackupIdentity(importedConfig,cleanDays,schema);importedConfig=isolated.config;const importedDays=isolated.days;const dates=importedDays.map(d=>d.date).sort(),period=dates.length?`${formatDate(dates[0])} – ${formatDate(dates.at(-1))}`:"No dated records";return{valid:true,raw,schema,exportedAt:raw.exportedAt||"Not recorded",dateRange:period,itemCount:countBackupItems(importedConfig),dayCount:importedDays.length,config:importedConfig,days:importedDays,warnings,errors,skipped};}
async function migrateBackupIdentity(candidateConfig,candidateDays,schema){const previousConfig=config,previousDays=days;try{config=candidateConfig;days=candidateDays;if(schema<4)config.identityMigrated=false;await migrateItemIdentity(false);return{config,days};}finally{config=previousConfig;days=previousDays;}}
function countBackupItems(value){const ids=new Set((value.items||[]).map(item=>item.id));(value.moves||[]).forEach(item=>ids.add(item.id));return ids.size;}
function renderBackupPreview(preview){const root=$("backup-preview");root.hidden=false;const details=$("backup-preview-details"),values=[["Schema version",preview.schema],["Export date",preview.exportedAt],["Data range",preview.dateRange],["Items",preview.itemCount],["Day records",preview.dayCount]];details.replaceChildren();values.forEach(([label,value])=>{const term=document.createElement("dt"),definition=document.createElement("dd");term.textContent=label;definition.textContent=value;details.append(term,definition);});renderBackupMessages("backup-warnings",preview.warnings||[]);renderBackupMessages("backup-errors",preview.errors||[]);$("backup-invalid-count").textContent=`Invalid or repeated records skipped during preview: ${preview.skipped||0}. No app data has been changed.`;const canContinue=Boolean(preview.valid)&&!(preview.errors||[]).length;$("backup-merge-start").disabled=!canContinue;$("backup-restore-start").disabled=!canContinue;$("backup-result").textContent="";}
function renderBackupMessages(id,messages){const list=$(id);list.replaceChildren();if(!messages.length){const item=document.createElement("li");item.textContent="None";list.append(item);return;}messages.forEach(message=>{const item=document.createElement("li");item.textContent=message;list.append(item);});}
function showBackupConfirmation(mode){if(!pendingBackup?.valid)return;$("backup-merge-confirmation").hidden=mode!=="merge";$("backup-restore-confirmation").hidden=mode!=="restore";if(mode==="restore"){$("backup-restore-phrase").value="";$("backup-restore-phrase").focus();}}
function hideBackupConfirmation(mode){$(mode==="merge"?"backup-merge-confirmation":"backup-restore-confirmation").hidden=true;if(mode==="restore")$("backup-restore-phrase").value="";}
function cancelBackupImport(){pendingBackup=null;const root=$("backup-preview");if(root)root.hidden=true;if($("backup-merge-confirmation"))$("backup-merge-confirmation").hidden=true;if($("backup-restore-confirmation"))$("backup-restore-confirmation").hidden=true;if($("backup-restore-phrase"))$("backup-restore-phrase").value="";$("backup-result")?.replaceChildren();if($("import-json"))$("import-json").value="";}
async function confirmBackupMerge(){if(!pendingBackup?.valid)return;const result=mergeBackupIntoCurrent(pendingBackup.config,pendingBackup.days,pendingBackup.skipped);try{await writeDataset(result.config,result.days);config=result.config;days=result.days;await migrateWeekendUnits();syncAfterSave();hideBackupConfirmation("merge");$("backup-result").textContent=`Merge complete: ${result.imported} imported, ${result.duplicates} duplicates, ${result.conflicts} conflicts kept current, ${result.skipped} skipped.`;pendingBackup=null;$("backup-merge-start").disabled=true;$("backup-restore-start").disabled=true;applyAccent();renderAll();showToast("Backup merged. Existing conflicting records were kept.");}catch{showToast("Merge could not be saved. Current app data remains intact.");}}
async function confirmBackupRestore(){if(!pendingBackup?.valid)return;if($("backup-restore-phrase").value!=="RESTORE MINIMAL")return showToast("Type RESTORE MINIMAL to confirm replacement.");const recoveryAt=initiateBackupExport("recovery");if(!recoveryAt)return;const restoredConfig=JSON.parse(JSON.stringify(pendingBackup.config));restoredConfig.lastExportAt=recoveryAt;try{await writeDataset(restoredConfig,pendingBackup.days);config=restoredConfig;days=pendingBackup.days;try{localStorage.setItem("minimal.last-export",recoveryAt);}catch{/* The restored config stores the date. */}await syncTrackNow();location.reload();}catch{showToast("Restore could not be saved. Current app data remains intact; the recovery backup was downloaded.");}}
function mergeBackupIntoCurrent(incomingConfig,incomingDays,initialSkipped=0){const mergedConfig=JSON.parse(JSON.stringify(config)),mergedDays=JSON.parse(JSON.stringify(days)),counts={imported:0,duplicates:0,conflicts:0,skipped:initialSkipped};const currentItems=new Map((mergedConfig.items||[]).map(item=>[item.id,item])),preexistingItemIds=new Set(currentItems.keys());(incomingConfig.items||[]).forEach(item=>{const old=currentItems.get(item.id);if(!old){mergedConfig.items.push(item);currentItems.set(item.id,item);counts.imported++;}else if(JSON.stringify(old)===JSON.stringify(item))counts.duplicates++;else counts.conflicts++;});incomingConfig.moves.forEach(move=>{const old=mergedConfig.moves.find(existing=>existing.id===move.id);if(old){if(JSON.stringify(old)===JSON.stringify(move))counts.duplicates++;else counts.conflicts++;}else if(preexistingItemIds.has(move.id)){counts.conflicts++;}else if(mergedConfig.moves.length<10){mergedConfig.moves.push({...move,order:mergedConfig.moves.length});counts.imported++;}else{counts.skipped++;}});const currentByDate=new Map(mergedDays.map(day=>[day.date,day]));incomingDays.forEach(incoming=>{const current=currentByDate.get(incoming.date);if(!current){mergedDays.push(incoming);currentByDate.set(incoming.date,incoming);counts.imported+=Math.max(countDayRecords(incoming),1);return;}for(const key of ["priorities","planned","moves"]){const list=current[key],existing=new Map(list.map(record=>[record.id,record]));incoming[key].forEach(record=>{const old=existing.get(record.id);if(!old){if(list.length>=10){counts.skipped++;return;}list.push(record);existing.set(record.id,record);counts.imported++;}else if(JSON.stringify(old)===JSON.stringify(record))counts.duplicates++;else counts.conflicts++;});}const sessions=new Map((current.focusSessions||[]).map(session=>[session.id,session]));(incoming.focusSessions||[]).forEach(session=>{const old=sessions.get(session.id);if(!old){current.focusSessions.push(session);sessions.set(session.id,session);counts.imported++;}else if(JSON.stringify(old)===JSON.stringify(session))counts.duplicates++;else counts.conflicts++;});for(const key of ["conclusion","rolloverResolved"]){if(!current[key]&&incoming[key]){current[key]=incoming[key];counts.imported++;}else if(current[key]&&incoming[key]){if(current[key]===incoming[key])counts.duplicates++;else counts.conflicts++;}}for(const key of ["milestoneCelebrated","reminderShown","reminderDismissed"]){if(!current[key]&&incoming[key]){current[key]=true;counts.imported++;}}});mergedConfig.items=mergedConfig.items||[];mergedConfig.identityMigrated=true;return{config:mergedConfig,days:mergedDays,...counts};}
function countDayRecords(day){return day.priorities.length+day.planned.length+day.moves.length+(day.focusSessions||[]).length+(day.conclusion?1:0);}
function writeDataset(nextConfig,nextDays){if(fallback){localStorage.setItem("minimal.2.2.fallback",JSON.stringify({config:nextConfig,days:nextDays}));return Promise.resolve();}return new Promise((resolve,reject)=>{const transaction=db.transaction(["config","days"],"readwrite");transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error("Storage transaction failed"));transaction.onabort=()=>reject(transaction.error||new Error("Storage transaction aborted"));transaction.objectStore("config").put(nextConfig);const store=transaction.objectStore("days");store.clear();nextDays.forEach(day=>store.put(day));});}
async function clearAll(){if($("clear-phrase").value!=="DELETE MINIMAL")return showToast("Confirmation phrase does not match.");if(db){db.close();await new Promise(resolve=>{const r=indexedDB.deleteDatabase(DB_NAME);r.onsuccess=r.onerror=r.onblocked=resolve;});db=null;}localStorage.removeItem("minimal.2.2.fallback");localStorage.removeItem("minimal.last-export");localStorage.removeItem("minimal.accent");config=defaultConfig();days=[];fallback=false;await openDatabase();await syncReset();await persistConfig();await ensureToday();$("clear-confirm").hidden=true;$("clear-phrase").value="";$("focus-layer").hidden=true;document.body.classList.remove("focus-open");activeDate=defaultLogUnit();editable=true;renderAll();showToast("All Minimal data was permanently removed.");}
async function shareFeedback(){const value=text($("feedback").value,1000,true);if(!value)return showToast("Write feedback first.");const body=`Minimal ${VERSION}\n${value}`;try{if(navigator.share)await navigator.share({title:"Minimal feedback",text:body});else if(navigator.clipboard)await navigator.clipboard.writeText(body);else throw new Error();showToast(navigator.share?"Feedback shared by you.":"Feedback copied.");}catch(e){if(e.name!=="AbortError")showToast("Sharing is unavailable. Copy the text manually.");}}

function sanitizeFocusTimer(v){if(!v||typeof v!=="object"||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!["priority","move","break"].includes(v.itemType))return null;const duration=clampInteger(v.duration,60,10800,1500),completed=Boolean(v.completed),running=!completed&&Boolean(v.running)&&Number.isFinite(Number(v.endAt));return{date:v.date,itemType:v.itemType,itemId:v.itemId?safeId(v.itemId,"item"):null,itemLabel:text(v.itemLabel,140)||"Focus session",duration,remaining:clampInteger(v.remaining,0,duration,duration),running,endAt:running?Number(v.endAt):null,completed,acknowledged:completed&&Boolean(v.acknowledged),sessionRecorded:Boolean(v.sessionRecorded),isBreak:v.itemType==="break"||Boolean(v.isBreak)};}
function sanitizeFocusSession(v,date){if(!v||typeof v!=="object"||!["priority","move"].includes(v.itemType))return null;const completed=new Date(v.completedAt);if(Number.isNaN(completed.getTime()))return null;return{id:safeId(v.id,"focus"),date,itemType:v.itemType,itemId:v.itemId?safeId(v.itemId,"item"):null,itemLabel:text(v.itemLabel,140)||"Focus session",plannedDuration:clampInteger(v.plannedDuration,60,10800,1500),completedAt:completed.toISOString()};}
function sanitizeConfig(v){if(!v||typeof v!=="object")return defaultConfig();const moves=Array.isArray(v.moves)?v.moves.filter(m=>m&&typeof m==="object").slice(0,10).map((m,i)=>({id:safeId(m.id,"move"),label:text(m.label,80)||"Untitled Small Move",enabled:m.enabled!==false,order:i})):[],items=Array.isArray(v.items)?v.items.slice(0,10000).map(sanitizeRegistryItem).filter(Boolean):[],launchers=Array.isArray(v.launchers)?v.launchers.filter(a=>a&&typeof a==="object").slice(0,30).map((a,i)=>({id:safeId(a.id,"app"),name:text(a.name,40)||"App",url:normalizeUrl(a.url)||"https://example.com/",symbol:text(a.symbol,3),color:validColor(a.color)?a.color:"#9cffc8",pinned:Boolean(a.pinned),order:i})):DEFAULT_LAUNCHERS,reminder=v.reminder&&typeof v.reminder==="object"?v.reminder:{};return{key:"main",version:VERSION,name:text(v.name,40),initials:text(v.initials,3).toUpperCase(),locationLabel:text(v.locationLabel,40),accent:ACCENTS[v.accent]?v.accent:"mint",milestoneEnabled:v.milestoneEnabled!==false,reminder:{enabled:Boolean(reminder.enabled),time:/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)?reminder.time:"18:00"},focusTimer:sanitizeFocusTimer(v.focusTimer),moves,items,identityMigrated:Boolean(v.identityMigrated),launchers,updatedAt:Number(v.updatedAt)||Date.now(),lastDate:validDateKey(v.lastDate)?v.lastDate:null,lastExportAt:validDateKey(String(v.lastExportAt||"").slice(0,10))?v.lastExportAt:null,weekendMigratedAt:Number(v.weekendMigratedAt)||null,migrated:Boolean(v.migrated)};}
function sanitizeRegistryItem(v){if(!v||typeof v!=="object"||!["priority","move"].includes(v.type))return null;const periods=Array.isArray(v.activePeriods)?v.activePeriods.map(p=>({start:p?.start,end:p?.end||null})).filter(p=>validDateKey(p.start)&&(!p.end||validDateKey(p.end)&&p.end>=p.start)).sort((a,b)=>a.start.localeCompare(b.start)):[];return{id:safeId(v.id,v.type),type:v.type,name:text(v.name,v.type==="move"?80:140)||"Untitled",createdDate:validDateKey(v.createdDate)?v.createdDate:periods[0]?.start||dateKey(),activePeriods:periods,deleted:Boolean(v.deleted)};}
function sanitizeDay(v){if(!v||typeof v!=="object"||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||Number.isNaN(parseDate(v.date).getTime()))return null;const items=(list,max,labelKey)=>Array.isArray(list)?list.slice(0,max).map((x,i)=>({id:safeId(x.id,"item"),[labelKey]:text(x[labelKey],labelKey==="label"?80:140)||"Untitled",status:validStatus(x.status,x.done),order:i})):[];const moves=Array.isArray(v.moves)?v.moves.slice(0,10).map((m,i)=>({id:safeId(m.id,"move"),label:text(m.label,80)||"Untitled Small Move",status:validStatus(m.status,m.done),enabled:m.enabled!==false,order:i})):[],focusSessions=Array.isArray(v.focusSessions)?v.focusSessions.slice(0,1000).map(s=>sanitizeFocusSession(s,v.date)).filter(Boolean):[];return{date:v.date,priorities:items(v.priorities,10,"text"),planned:items(v.planned,10,"text"),moves,focusSessions,conclusion:text(v.conclusion,conclusionMax(v.date),true),weekend:isWeekendKey(v.date),milestoneCelebrated:Boolean(v.milestoneCelebrated),reminderShown:Boolean(v.reminderShown),reminderDismissed:Boolean(v.reminderDismissed),loggedAt:Number(v.loggedAt)||null,rolloverResolved:["carry","archive","delete"].includes(v.rolloverResolved)?v.rolloverResolved:null,updatedAt:Number(v.updatedAt)||Date.now()};}
function normalizeUrl(raw){if(typeof raw!=="string"||!/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()))return null;try{const u=new URL(raw.trim());if(!SAFE_PROTOCOLS.has(u.protocol)||u.protocol==="javascript:"||u.protocol==="data:")return null;if(u.protocol==="http:"&&!(["localhost","127.0.0.1"].includes(u.hostname)))return null;if(["https:","http:"].includes(u.protocol)&&(!u.hostname||u.username||u.password))return null;return u.href;}catch{return null;}}
function text(v,max,multiline=false){if(typeof v!=="string")return"";let s=v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"");if(!multiline)s=s.replace(/\s+/g," ");return s.trim().slice(0,max);}
function clampInteger(value,min,max,fallback){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,Math.round(number))):fallback;}function validStatus(value,legacyDone=false){return["pending","done","skipped"].includes(value)?value:legacyDone?"done":"pending";}function validColor(v){return typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);}function safeId(v,p){return typeof v==="string"&&/^[\w-]{1,100}$/.test(v)?v:uid(p);}function uid(p){return `${p}-${crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2)}`;}
function normalizeItemName(value){return text(value,140).toLocaleLowerCase();}
function validDateKey(value){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=parseDate(value);return!Number.isNaN(parsed.getTime())&&dateKey(parsed)===value;}
function getRegistryItem(id){return(config.items||[]).find(item=>item.id===id);}
function periodsFromDates(dates){const unique=[...new Set(dates)].sort(),periods=[];unique.forEach(date=>{const last=periods.at(-1);if(last&&shiftDate(last.end,1)===date)last.end=date;else periods.push({start:date,end:date});});return periods;}
function markItemEligible(id,date){const item=getRegistryItem(id);if(!item||!validDateKey(date))return;item.deleted=false;const periods=item.activePeriods||(item.activePeriods=[]);if(isItemEligible(item,date))return;periods.push({start:date,end:date});periods.sort((a,b)=>a.start.localeCompare(b.start));const merged=[];periods.forEach(period=>{const last=merged.at(-1),end=period.end||dateKey();if(last&&period.start<=shiftDate(last.end||dateKey(),1)){if(last.end===null||period.end===null)last.end=null;else if(period.end>last.end)last.end=period.end;}else merged.push({...period});});item.activePeriods=merged;}
function closeActivePeriod(item,end){const last=item?.activePeriods?.at(-1);if(!last||last.end!==null)return;if(end<last.start)item.activePeriods.pop();else last.end=end;}
function setItemEnabled(id,enabled){const item=getRegistryItem(id);if(!item)return;item.deleted=false;if(enabled){const last=item.activePeriods.at(-1);if(last?.end===shiftDate(dateKey(),-1))last.end=null;else if(!isItemEligible(item,dateKey()))item.activePeriods.push({start:dateKey(),end:null});}else closeActivePeriod(item,shiftDate(dateKey(),-1));}
function isItemEligible(item,date){return Boolean(item?.activePeriods?.some(period=>date>=period.start&&(!period.end||date<=period.end)));}
function formatActivePeriods(periods=[]){if(!periods.length)return"No active period recorded";return periods.map(period=>`${formatDate(period.start)} – ${period.end?formatDate(period.end):"present"}`).join(" · ");}
function getDay(date){const key=unitKey(date);return days.find(d=>d.date===key);}function latestDayBefore(date){return days.filter(d=>d.date<date).sort((a,b)=>b.date.localeCompare(a.date))[0];}
function formatDate(k){return parseDate(k).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});}function monthName(i,short=false){return new Date(2020,i,1).toLocaleDateString(undefined,{month:short?"short":"long"});}
function showView(name){if(name==="today"&&activeDate!==todayKey()&&activeDate!==defaultLogUnit()&&isLogged(getDay(activeDate)))editable=false;document.querySelectorAll(".view").forEach(v=>{const active=v.id===`${name}-view`;v.hidden=!active;v.classList.toggle("active",active);});document.querySelectorAll(".bottom-nav [data-view]").forEach(b=>{const active=b.dataset.view===(name==="patterns"?"history":name);b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");});if(name==="today"&&activeDate!==todayKey()&&!editable)renderToday();if(name==="history")renderHistory();if(name==="patterns")renderPatterns();location.hash=name;}
function tick(){const n=new Date();$("clock").textContent=n.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});if(dateKey()!==config?.lastDate)ensureToday().then(()=>{renderAll();checkReminder();});}function renderOnline(){const label=config?.locationLabel||"On-device";$("online-status").textContent=`${label} · ${navigator.onLine?"Online":"Offline"}`;}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);return true;}
function showToast(message,duration=3200){clearTimeout(toastTimer);$("toast").textContent=message;$("toast").hidden=false;toastTimer=setTimeout(()=>$("toast").hidden=true,duration);}
function registerServiceWorker(){if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){const register=()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>showToast("Offline support could not start."));if(document.readyState==="complete")register();else addEventListener("load",register,{once:true});}}

async function addPastMove(e){e.preventDefault();if(!editable||activeDate>=todayKey())return;const day=currentDay(),input=$("past-move-input"),label=text(input.value,80);if(!label)return;if(day.moves.length>=10)return showToast("The daily limit is 10 Small Moves.");if(day.moves.some(m=>m.label.toLowerCase()===label.toLowerCase()))return showToast("That Small Move is already listed.");day.moves.push({id:uid("move"),label,status:"pending",enabled:true,order:day.moves.length});input.value="";await persistDay(day);renderAll();}

/* ---------- Cloudflare sync (see docs/SYNC.md) ----------
 * The phone keeps its full copy in IndexedDB and works offline. Each save is
 * queued by sync-client.js and uploaded when signed in and online. */
let syncClient=null,syncTrackTimer=null,syncPushTimer=null,syncMessage="";
const SYNC_FALLBACK_KEY="minimal.sync";
const syncStore={
  async get(){
    if(fallback||!db){try{return JSON.parse(localStorage.getItem(SYNC_FALLBACK_KEY)||"null");}catch{return null;}}
    try{return (await idbGet("sync","state"))?.value||null;}catch{return null;}
  },
  async set(value){
    if(!fallback&&db){try{await idbPut("sync",{key:"state",value});return;}catch{/* fall through to localStorage */}}
    try{localStorage.setItem(SYNC_FALLBACK_KEY,JSON.stringify(value));}catch{showToast("Sync state could not be saved on this phone.");}
  }
};
const syncGetState=()=>({config,days});
async function syncApplyState(next){
  const nextConfig=sanitizeConfig(next.config),nextDays=next.days.map(sanitizeDay).filter(Boolean);
  await writeDataset(nextConfig,nextDays);
  config=nextConfig;days=nextDays;
  applyAccent();renderAll();
  return{config,days};
}
async function initSync(){
  const lib=window.MinimalSyncClient;
  if(!lib)return;
  syncClient=new lib.SyncClient({fetch:(path,init)=>fetch(path,init),store:syncStore});
  await syncClient.load();
  syncClient.setBase(config,days);
}
function startSync(){
  if(!syncClient)return;
  addEventListener("online",()=>syncNow());
  addEventListener("offline",renderSync);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncNow();});
  setInterval(()=>{if(!document.hidden)syncNow();},5*60*1000);
  renderSync();
  syncNow();
}
function syncAfterSave(){
  if(!syncClient?.state)return;
  clearTimeout(syncTrackTimer);
  syncTrackTimer=setTimeout(async()=>{
    await syncClient.track(config,days);
    renderSync();
    clearTimeout(syncPushTimer);
    syncPushTimer=setTimeout(syncNow,2000);
  },250);
}
async function syncTrackNow(){
  if(!syncClient?.state)return;
  clearTimeout(syncTrackTimer);
  await syncClient.track(config,days);
}
async function syncNow(){
  if(!syncClient?.state?.signedIn||!navigator.onLine)return renderSync();
  try{await syncClient.sync(syncGetState,syncApplyState);syncMessage="";}
  catch(error){syncMessage=error.offline?"Offline. Changes are saved on this phone and will sync later.":error.message;}
  renderSync();
}
function isFreshDevice(){
  return !config.name&&!(config.moves||[]).length&&!days.some(d=>isLogged(d)||d.priorities.length||d.planned.length||d.conclusion);
}
async function runFirstSync(){
  const fresh=isFreshDevice();
  if(!fresh){
    const at=initiateBackupExport("pre-sync");
    if(!at)throw new Error("The safety backup could not be saved, so nothing was uploaded.");
    try{localStorage.setItem("minimal.backup.pre-sync",JSON.stringify(buildBackup(at)));}catch{/* the downloaded file is the backup */}
  }
  await syncClient.firstSync(syncGetState,syncApplyState,{fresh});
  syncMessage=fresh?"Downloaded your data from Cloudflare.":"Uploaded this phone's data to Cloudflare.";
}
async function signInToSync(e){
  e.preventDefault();
  const input=$("sync-passcode"),button=$("sync-signin"),passcode=input.value;
  if(!passcode)return;
  button.disabled=true;
  try{
    await syncClient.login(passcode);
    if(!syncClient.state.firstSyncAt)await runFirstSync();else await syncNow();
    showToast("Signed in. Sync is on.");
  }catch(error){
    syncMessage=error.status===404||error.status===405?"Sync is not available at this address. Open the Cloudflare version of Minimal.":error.status===401?"Wrong passcode.":error.message;
  }finally{
    input.value="";button.disabled=false;renderSync();
  }
}
async function uploadAgain(){
  try{await runFirstSync();}catch(error){syncMessage=error.message;}
  renderSync();
}
async function signOutOfSync(everywhere){
  try{await syncClient.logout(everywhere);syncMessage=everywhere?"Signed out on every device.":"Signed out. Changes stay on this phone.";}
  catch(error){syncMessage=error.message;}
  renderSync();
}
async function syncReset(){
  if(!syncClient)return;
  try{await syncClient.logout();}catch{/* offline or already signed out */}
  await syncClient.reset();
  syncClient.setBase(config,days);
}
async function dismissConflicts(){
  try{await syncClient.dismissConflicts(syncClient.state.conflicts.map(c=>c.id));}catch(error){syncMessage=error.message;}
  renderSync();
}
function bindSync(){
  $("sync-signin-form").addEventListener("submit",signInToSync);
  $("sync-now").addEventListener("click",()=>syncNow());
  $("sync-upload-again").addEventListener("click",uploadAgain);
  $("sync-signout").addEventListener("click",()=>signOutOfSync(false));
  $("sync-signout-all").addEventListener("click",()=>signOutOfSync(true));
  $("sync-dismiss-conflicts").addEventListener("click",dismissConflicts);
}
function describeConflict(c){
  const show=v=>v===null?"deleted":c.entity==="item"?`“${v.text||v.label}” ${v.status}`:c.entity==="note"?`“${String(v).slice(0,60)}”`:c.entity==="setting"?"a different value":"a change";
  const date=c.key.slice(0,10),where=c.entity==="setting"?`Setting “${c.key}”`:validDateKey(date)?(isWeekendKey(unitKey(date))?`Weekend of ${unitDateText(unitKey(date))}`:formatDate(date)):c.entity;
  return `${where}: kept ${show(c.kept)}, replaced ${show(c.lost)}.`;
}
function renderSync(){
  if(!syncClient?.state||!$("sync-panel"))return;
  const s=syncClient.state,n=syncClient.pending,waiting=`${n} change${n===1?"":"s"} waiting`;
  const last=s.lastSyncAt?new Date(s.lastSyncAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"not yet";
  $("sync-signin-form").hidden=s.signedIn;
  $("sync-signed-in").hidden=!s.signedIn;
  $("sync-status").textContent=s.signedIn?`${navigator.onLine?"Signed in":"Offline"} · Last synced ${last} · ${waiting}`:s.firstSyncAt?`Signed out · ${waiting} on this phone`:"Not signed in. Your data is only on this phone.";
  $("sync-message").textContent=syncMessage;
  const list=$("sync-conflicts");
  list.replaceChildren(...s.conflicts.map(c=>{const li=document.createElement("li");li.textContent=describeConflict(c);return li;}));
  $("sync-conflict-count").textContent=`(${s.conflicts.length})`;
  $("sync-conflicts-box").hidden=!s.conflicts.length;
}

/* ---------- History (Clay, with the week heatmap) ---------- */
function unitLevel(key){
  if(!canLogUnit(key))return "open";
  const day=getDay(key),state=unitState(day);
  if(state==="notlogged")return "notlogged";
  if(state==="missed")return "missed";
  const p=dayScore(day).percent;
  if(p===null)return "unmeasured";
  return p>=80?"l4":p>=60?"l3":p>=40?"l2":"l1";
}
function unitShortName(key){
  if(isWeekendKey(key)){const a=parseDate(key),b=parseDate(unitEnd(key));return a.getMonth()===b.getMonth()?`Weekend · ${a.getDate()}–${b.getDate()}`:`Weekend · ${formatDate(key)}`;}
  const d=parseDate(key);return `${d.toLocaleDateString(undefined,{weekday:"long"})} ${d.getDate()}`;
}
function unitValueText(key,level){
  if(level==="open")return isWeekendKey(key)?"Log on Monday":"Log tomorrow";
  if(level==="notlogged")return "Not logged";
  if(level==="missed")return "Missed";
  if(level==="unmeasured")return "—";
  return `${dayScore(getDay(key)).percent}%`;
}
function renderHistory(){
  $("history-date").max=dateKey();
  if(!$("history-date").value)$("history-date").value=defaultLogUnit();
  const year=$("history-year").value||String(new Date().getFullYear()),keys=historyUnits(year),records=days.filter(d=>d.date.startsWith(year));
  renderYearSummary(records,year);
  renderHeatmap(year);
  const list=$("history-list");list.replaceChildren();
  let group=null,groupMonth="";
  keys.forEach(key=>{
    const d=parseDate(key),monthKey=key.slice(0,7);
    if(monthKey!==groupMonth){
      groupMonth=monthKey;
      // One collapsible section per month; only the most recent starts open.
      const section=document.createElement("details"),head=document.createElement("summary"),h=document.createElement("h3"),meta=document.createElement("span");
      section.className="month-group";section.open=!list.childElementCount;
      head.className="month-head";h.textContent=monthName(d.getMonth());
      const mStart=`${monthKey}-01`,mEnd=dateKey(new Date(d.getFullYear(),d.getMonth()+1,0)),sum=clipSummary(mStart,mEnd);
      meta.textContent=sum.units?`${sum.logged} of ${sum.units} logged${sum.average===null?"":` · ${sum.average}%`}`:"";
      head.append(h,meta);
      group=document.createElement("div");group.className="card month-days";
      section.append(head,group);list.append(section);
    }
    const level=unitLevel(key),b=document.createElement("button");
    b.type="button";b.className=`history-row ${level}`;b.dataset.date=key;
    const dot=document.createElement("span"),name=document.createElement("span"),value=document.createElement("span");
    dot.className=`heat-dot ${level}`;dot.setAttribute("aria-hidden","true");
    name.className="history-row-name";name.textContent=unitShortName(key);
    value.className="history-row-value";value.textContent=unitValueText(key,level);
    const day=getDay(key);
    if(day?.conclusion&&level!=="notlogged"){const note=document.createElement("small");note.className="history-row-note";note.textContent=day.conclusion;name.append(note);}
    b.append(dot,name,value);group.append(b);
  });
  $("history-empty").hidden=keys.length>0;
}
function renderYearSummary(records,year){
  const sum=clipSummary(`${year}-01-01`,`${year}-12-31`),counted=new Set(sum.keys),loggedRecords=records.filter(d=>counted.has(d.date)&&isLogged(d)),streaks=calculateStreaks(records);
  const tiles=[[sum.average===null?"—":`${sum.average}%`,"average logged day"],[`${sum.logged}`,`of ${sum.units} days logged`],[`${sum.reached}`,"days at 80% or more"],[`${streaks.longest}`,"longest streak"]];
  const root=$("year-stats");root.replaceChildren();
  tiles.forEach(([value,label])=>{const d=document.createElement("div"),s=document.createElement("strong"),l=document.createElement("span");d.className="year-tile";s.textContent=value;l.textContent=label;d.append(s,l);root.append(d);});
  const months=Array.from({length:12},(_,month)=>{const s=clipSummary(dateKey(new Date(Number(year),month,1)),dateKey(new Date(Number(year),month+1,0)));return{month,avg:s.average,units:s.units};}).filter(m=>m.units>0);
  const best=months.filter(m=>m.avg!==null).sort((a,b)=>b.avg-a.avg)[0];
  const extra=[`${sum.notLogged} not logged`,`${sum.missed} missed`,`current streak ${streaks.current}`];
  if(year===String(new Date().getFullYear())){const wk=weekUnits(dateKey()),lastWk=weekUnits(shiftDate(dateKey(),-7)),thisW=clipSummary(wk[0],wk.at(-1)).average,lastW=clipSummary(lastWk[0],lastWk.at(-1)).average;if(thisW!==null)extra.push(`this week ${thisW}%`);if(lastW!==null)extra.push(`last week ${lastW}%`);}
  if(best)extra.push(`best month ${monthName(best.month)} (${best.avg}%)`);
  extra.push(`${loggedRecords.reduce((n,d)=>n+score(d.priorities).done,0)} priorities and ${loggedRecords.reduce((n,d)=>n+score(d.moves).done,0)} Small Moves done`);
  $("year-extra").textContent=extra.join(" · ");
  const bars=$("monthly-bars");bars.replaceChildren();
  months.forEach(m=>{const col=document.createElement("div"),value=document.createElement("span"),bar=document.createElement("span"),fill=document.createElement("span"),label=document.createElement("span");col.className="month-col";value.className="month-value";value.textContent=m.avg===null?"—":`${m.avg}%`;bar.className="month-bar";fill.style.height=`${m.avg||0}%`;fill.className=m.avg!==null&&best&&m.month===best.month?"best":"";bar.append(fill);label.className="month-label";label.textContent=monthName(m.month,true);col.append(value,bar,label);bars.append(col);});
  $("months-section").hidden=months.length===0;
}
function renderHeatmap(year){
  const root=$("heatmap");root.replaceChildren();
  const yStart=`${year}-01-01`,yEnd=`${year}-12-31`,first=firstUnit(),start=first>yStart?first:yStart,today=dateKey(),end=today<yEnd?today:yEnd;
  if(start>end){$("heat-section").hidden=true;return;}
  $("heat-section").hidden=false;
  const monday=k=>shiftDate(k,-((parseDate(k).getDay()+6)%7));
  const weeks=[];for(let w=monday(end);w>=monday(start);w=shiftDate(w,-7))weeks.push(w);
  weeks.forEach(w=>{
    const row=document.createElement("div"),label=document.createElement("span");
    row.className="heat-row";label.className="heat-label";
    const d=parseDate(w);label.textContent=`${monthName(d.getMonth(),true)} ${d.getDate()}`;
    row.append(label);
    weekUnits(w).forEach(u=>{
      if(u<start||u>yEnd||u>todayKey()){const blank=document.createElement("span");blank.className="heat-cell blank";blank.setAttribute("aria-hidden","true");row.append(blank);return;}
      const level=unitLevel(u),cell=document.createElement("button");
      cell.type="button";cell.className=`heat-cell ${level}`;cell.dataset.date=u;
      cell.setAttribute("aria-label",`${isWeekendKey(u)?`Weekend of ${unitDateText(u)}`:formatDate(u)}: ${unitValueText(u,level)}`);
      row.append(cell);
    });
    root.append(row);
  });
}
