const DB_NAME="worklog-db";
const DB_VERSION=1;
const STORE="app";
const DB_KEY="data";
const LEGACY_KEY="worklog-data-v1";
const DEFAULT={
  types:[
    {id:"r300",name:"300円/h",rate:300,uncertain:false},
    {id:"r300u",name:"300円/h（仮定）",rate:300,uncertain:true},
    {id:"r600",name:"600円/h",rate:600,uncertain:false},
    {id:"r0",name:"0円/h",rate:0,uncertain:false}
  ],
  days:{}
};

let data=null;
let db=null;
let currentMonth=new Date(); currentMonth.setDate(1);
let selectedDate=null;
let selectedSlot=null;

const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
function clone(v){return JSON.parse(JSON.stringify(v));}
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function normalizeData(obj){
  const out=clone(DEFAULT);
  if(obj?.types?.length){
    out.types=obj.types.map((t,i)=>({
      id:t.id||`type${i}`,
      name:t.name||"作業",
      rate:Number(t.rate)||0,
      uncertain:Boolean(t.uncertain)
    }));
    // Old backups have only r300/r600/r0; add the new uncertain type.
    if(!out.types.some(t=>t.id==="r300u"))out.types.splice(1,0,clone(DEFAULT.types[1]));
  }
  if(obj?.days && typeof obj.days==="object"){
    out.days=obj.days;
    for(const d of Object.values(out.days)){
      d.clockIn=d.clockIn||"";d.clockOut=d.clockOut||"";d.slots=d.slots||{};d.logs=d.logs||[];d.specialPays=Array.isArray(d.specialPays)?d.specialPays:[];
    }
  }
  return out;
}

function openDB(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE)};
  req.onsuccess=()=>{db=req.result;resolve(db)};
  req.onerror=()=>reject(req.error);
});}
function dbGet(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function dbPut(value){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(value,DB_KEY);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function initData(){
  await openDB();
  const stored=await dbGet();
  if(stored){data=normalizeData(stored);await dbPut(data);return;}
  let legacy=null;
  try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||"null")}catch{}
  data=normalizeData(legacy||DEFAULT);
  await dbPut(data);
}
async function saveData(){await dbPut(data)}
function getDay(key){
  if(!data.days[key])data.days[key]={clockIn:"",clockOut:"",slots:{},logs:[],specialPays:[]};
  const d=data.days[key];d.logs=d.logs||[];d.slots=d.slots||{};d.specialPays=Array.isArray(d.specialPays)?d.specialPays:[];return d;
}
function typeFor(id){return data.types.find(t=>t.id===id)}
function dayTotals(key){
  const d=getDay(key);let gross=0,confirmed=0;
  for(const id of Object.values(d.slots)){const t=typeFor(id);if(!t)continue;const v=t.rate/4;gross+=v;if(!t.uncertain)confirmed+=v}
  const special=d.specialPays.reduce((s,p)=>s+(Number(p.amount)||0),0);
  gross+=special;
  confirmed+=special;
  return {gross,confirmed,special};
}
function monthTotals(){
  const prefix=`${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2,"0")}-`;
  return Object.keys(data.days).filter(k=>k.startsWith(prefix)).reduce((a,k)=>{const t=dayTotals(k);a.gross+=t.gross;a.confirmed+=t.confirmed;return a},{gross:0,confirmed:0});
}
function setView(name){
  ["calendarView","dayView","settingsView"].forEach(v=>$(v).classList.toggle("hidden",v!==name));
  $("calendarHeader").classList.toggle("hidden",name!=="calendarView");
  window.scrollTo(0,0);
}
function renderCalendar(){
  $("monthLabel").textContent=`${currentMonth.getFullYear()}年${currentMonth.getMonth()+1}月`;
  const cal=$("calendar");cal.innerHTML="";
  ["日","月","火","水","木","金","土"].forEach(x=>{const e=document.createElement("div");e.className="weekday";e.textContent=x;cal.appendChild(e)});
  const first=new Date(currentMonth),start=first.getDay(),days=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,0).getDate();
  for(let i=0;i<start;i++){const e=document.createElement("div");e.className="day empty";cal.appendChild(e)}
  for(let n=1;n<=days;n++){
    const d=new Date(currentMonth.getFullYear(),currentMonth.getMonth(),n),key=dateKey(d),t=dayTotals(key);
    const e=document.createElement("div");e.className="day";
    e.innerHTML=`<div class="day-number">${n}</div><div class="day-amount">${t.gross?yen(t.gross):""}${t.gross!==t.confirmed?`<small>(${yen(t.confirmed)})</small>`:""}</div>`;
    e.onclick=()=>openDay(key);cal.appendChild(e);
  }
  const mt=monthTotals();$("monthTotal").textContent=yen(mt.gross);$("monthConfirmed").textContent=mt.gross!==mt.confirmed?`(${yen(mt.confirmed)})`:"";
}
function openDay(key){
  selectedDate=key;setView("dayView");
  const d=getDay(key),dt=new Date(key+"T00:00:00");
  $("dayTitle").textContent=`${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;
  $("clockIn").value=d.clockIn||"";$("clockOut").value=d.clockOut||"";
  renderGrid();renderSpecialPays();renderLogs();
}
async function saveAttendance(){const d=getDay(selectedDate);d.clockIn=$("clockIn").value;d.clockOut=$("clockOut").value;await saveData();renderCalendar()}
$("clockIn").onchange=saveAttendance;$("clockOut").onchange=saveAttendance;

function renderGrid(){
  const grid=$("dayGrid");grid.innerHTML="";const rows=[["10:00",10],["11:00",11],["13:00",13],["14:00",14]],d=getDay(selectedDate);
  rows.forEach(([label,h])=>{
    const t=document.createElement("div");t.className="time-label";t.textContent=label;t.onclick=()=>openHourPicker(h);grid.appendChild(t);
    for(let q=0;q<4;q++){
      const slot=document.createElement("div");slot.className="slot";const key=`${h}:${q}`,id=d.slots[key],type=typeFor(id);
      if(type){slot.classList.add(type.uncertain?"rate300-uncertain":`rate${type.rate}`);slot.textContent=type.name.replace("/h","")}
      slot.onclick=()=>openPicker(key);grid.appendChild(slot);
    }
    if(h===11){const br=document.createElement("div");br.className="break";br.textContent="12:00〜13:00　休憩";grid.appendChild(br)}
  });
  const t=dayTotals(selectedDate);$("dayTotal").textContent=yen(t.gross);$("dayConfirmed").textContent=t.gross!==t.confirmed?`(${yen(t.confirmed)})`:"";
}
function pickerButtons(onSelect){
  const box=$("typeButtons");box.innerHTML="";
  data.types.forEach(t=>{const b=document.createElement("button");b.textContent=`${t.name}（${yen(t.rate/4)}/15分）`;b.onclick=()=>onSelect(t.id);box.appendChild(b)});
}
function openPicker(key){
  selectedSlot=key;$("pickerTitle").textContent="この15分を設定";pickerButtons(async id=>{getDay(selectedDate).slots[key]=id;await saveData();closePicker();renderGrid();renderCalendar()});$("picker").classList.remove("hidden");
}
function openHourPicker(hour){
  selectedSlot=`hour:${hour}`;$("pickerTitle").textContent=`${String(hour).padStart(2,"0")}:00〜${String(hour+1).padStart(2,"0")}:00 をまとめて設定`;
  pickerButtons(async id=>{const d=getDay(selectedDate);for(let q=0;q<4;q++)d.slots[`${hour}:${q}`]=id;await saveData();closePicker();renderGrid();renderCalendar()});$("picker").classList.remove("hidden");
}
function closePicker(){$("picker").classList.add("hidden");selectedSlot=null}
$("closePicker").onclick=closePicker;
$("clearSlot").onclick=async()=>{if(!selectedSlot)return;const d=getDay(selectedDate);if(selectedSlot.startsWith("hour:")){const h=selectedSlot.split(":")[1];for(let q=0;q<4;q++)delete d.slots[`${h}:${q}`]}else delete d.slots[selectedSlot];await saveData();closePicker();renderGrid();renderCalendar()};

function renderSpecialPays(){
  const box=$("specialPays"),d=getDay(selectedDate);box.innerHTML="";
  d.specialPays.forEach((p,i)=>{const e=document.createElement("div");e.className="special-pay";e.innerHTML=`<div><div class="memo">${escapeHtml(p.memo||"特別給")}</div></div><div class="amount">+${yen(p.amount)}</div><button class="special-pay-delete" aria-label="削除">削除</button>`;e.querySelector("button").onclick=async()=>{if(confirm("この特別給を削除しますか？")){d.specialPays.splice(i,1);await saveData();renderSpecialPays();renderGrid();renderCalendar()}};box.appendChild(e)});
}
$("addSpecialPay").onclick=()=>{$("specialPayAmount").value="";$('specialPayMemo').value="";$('specialPayModal').classList.remove("hidden");setTimeout(()=>$('specialPayAmount').focus(),50)};
$("closeSpecialPay").onclick=()=>$("specialPayModal").classList.add("hidden");
$("saveSpecialPay").onclick=async()=>{const amount=Number($("specialPayAmount").value);if(!Number.isFinite(amount)||amount<=0){alert("0より大きい金額を入力してください");return}getDay(selectedDate).specialPays.push({amount:Math.round(amount),memo:$("specialPayMemo").value.trim()||"特別給"});await saveData();$("specialPayModal").classList.add("hidden");renderSpecialPays();renderGrid();renderCalendar()};

function renderLogs(){
  const box=$("logs"),d=getDay(selectedDate);box.innerHTML="";
  d.logs.forEach((l,i)=>{const e=document.createElement("div");e.className="log";e.innerHTML=`<strong>${escapeHtml(l.text)}</strong><div class="meta">${escapeHtml(l.time)} / ${escapeHtml(typeFor(l.type)?.name||"不明")}</div>`;e.onclick=async()=>{if(confirm("この作業ログを削除しますか？")){d.logs.splice(i,1);await saveData();renderLogs()}};box.appendChild(e)});
}
$("addLog").onclick=async()=>{
  const text=prompt("作業内容");if(!text)return;const time=prompt("着手時刻（例 10:17）","10:00");if(!time)return;const names=data.types.map((t,i)=>`${i+1}: ${t.name}`).join("\n");const n=prompt(`作業種別の番号\n${names}`,"1");const type=data.types[Number(n)-1]?.id;if(!type)return;getDay(selectedDate).logs.push({text,time,type});await saveData();renderLogs();
};

$("backToCalendar").onclick=()=>{setView("calendarView");renderCalendar()};
$("backMonth").onclick=()=>{currentMonth.setMonth(currentMonth.getMonth()-1);renderCalendar()};
$("nextMonth").onclick=()=>{currentMonth.setMonth(currentMonth.getMonth()+1);renderCalendar()};
$("settingsBtn").onclick=()=>{setView("settingsView");renderSettings()};
$("backFromSettings").onclick=()=>{setView("calendarView");renderCalendar()};
function renderSettings(){
  const box=$("rateSettings");box.innerHTML="";data.types.forEach(t=>{const row=document.createElement("div");row.className="rate-row";row.innerHTML=`<input data-name="${t.id}" value="${escapeAttr(t.name)}"><input type="number" data-rate="${t.id}" value="${t.rate}" min="0">`;box.appendChild(row)});
}
$("saveSettings").onclick=async()=>{data.types.forEach(t=>{t.name=document.querySelector(`[data-name="${t.id}"]`).value;t.rate=Number(document.querySelector(`[data-rate="${t.id}"]`).value)||0});await saveData();alert("設定を保存しました");renderCalendar()};

function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$("exportJson").onclick=()=>download(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),"worklog-backup.json");
$("importJson").onclick=()=>$("jsonFile").click();
$("jsonFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj.types||!obj.days)throw 0;data=normalizeData(obj);await saveData();renderCalendar();alert("バックアップを読み込みました")}catch{alert("読み込みに失敗しました")}e.target.value=""};
$("exportCsv").onclick=()=>{
  const rows=[["日付","出勤","退勤","15分枠開始","作業種別","時給","15分金額","仮定","作業内容","着手時刻","特別給","特別給内容"]];
  Object.keys(data.days).sort().forEach(key=>{const d=data.days[key];for(const [slot,id] of Object.entries(d.slots)){const [h,q]=slot.split(":").map(Number),start=`${String(h).padStart(2,"0")}:${String(q*15).padStart(2,"0")}`,type=typeFor(id),log=d.logs.find(l=>l.type===id&&l.time===start);rows.push([key,d.clockIn||"",d.clockOut||"",start,type?.name||"",type?.rate??0,(type?.rate??0)/4,type?.uncertain?"仮定":"",log?.text||"",log?.time||"","",""])}if(d.specialPays.length)d.specialPays.forEach(p=>rows.push([key,d.clockIn||"",d.clockOut||"","","","","","","","",p.amount,p.memo||"特別給"]));if(!Object.keys(d.slots).length&&!d.specialPays.length&&d.logs.length===0)rows.push([key,d.clockIn||"",d.clockOut||"","","","","","","","","",""])});
  const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");download(new Blob([csv],{type:"text/csv;charset=utf-8"}),"worklog.csv");
};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}

(async()=>{try{await initData();renderCalendar();if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{})}catch(e){console.error(e);alert("データベースの初期化に失敗しました。JSONバックアップを確認してください。")}})();
