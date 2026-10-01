const KEY="worklog-data-v1";
const DEFAULT={
  types:[
    {id:"r300",name:"300円/h",rate:300},
    {id:"r600",name:"600円/h",rate:600},
    {id:"r0",name:"0円/h",rate:0}
  ],
  days:{}
};

let data=loadData();
let currentMonth=new Date();
currentMonth.setDate(1);
let selectedDate=null;
let selectedSlot=null;

const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function loadData(){try{return JSON.parse(localStorage.getItem(KEY))||structuredClone(DEFAULT)}catch{return structuredClone(DEFAULT)}}
function saveData(){localStorage.setItem(KEY,JSON.stringify(data));}
function getDay(key){if(!data.days[key])data.days[key]={clockIn:"",clockOut:"",slots:{},logs:[]};return data.days[key]}
function rateFor(id){return data.types.find(t=>t.id===id)?.rate ?? 0}
function dayTotal(key){
  const d=getDay(key);
  return Object.values(d.slots).reduce((sum,id)=>sum+rateFor(id)/4,0);
}
function monthTotal(){
  const y=currentMonth.getFullYear(),m=currentMonth.getMonth()+1;
  return Object.keys(data.days).filter(k=>k.startsWith(`${y}-${String(m).padStart(2,"0")}-`)).reduce((s,k)=>s+dayTotal(k),0);
}

function renderCalendar(){
  $("monthLabel").textContent=`${currentMonth.getFullYear()}年${currentMonth.getMonth()+1}月`;
  const cal=$("calendar"); cal.innerHTML="";
  ["日","月","火","水","木","金","土"].forEach(x=>{const e=document.createElement("div");e.className="weekday";e.textContent=x;cal.appendChild(e)});
  const first=new Date(currentMonth), start=first.getDay();
  const days=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,0).getDate();
  for(let i=0;i<start;i++){const e=document.createElement("div");e.className="day empty";cal.appendChild(e)}
  for(let n=1;n<=days;n++){
    const d=new Date(currentMonth.getFullYear(),currentMonth.getMonth(),n),key=dateKey(d);
    const e=document.createElement("div");e.className="day";
    e.innerHTML=`<div class="day-number">${n}</div><div class="day-amount">${dayTotal(key)?yen(dayTotal(key)):""}</div>`;
    e.onclick=()=>openDay(key);cal.appendChild(e);
  }
  $("monthTotal").textContent=yen(monthTotal());
}

function openDay(key){
  selectedDate=key;
  $("calendarView").classList.add("hidden");$("settingsView").classList.add("hidden");$("dayView").classList.remove("hidden");
  const d=getDay(key); const dt=new Date(key+"T00:00:00");
  $("dayTitle").textContent=`${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;
  $("clockIn").value=d.clockIn||"";$("clockOut").value=d.clockOut||"";
  renderGrid();renderLogs();
}
function saveAttendance(){
  const d=getDay(selectedDate);d.clockIn=$("clockIn").value;d.clockOut=$("clockOut").value;saveData();renderCalendar();
}
$("clockIn").onchange=saveAttendance;$("clockOut").onchange=saveAttendance;

function renderGrid(){
  const grid=$("dayGrid");grid.innerHTML="";
  const rows=[["10:00",10],["11:00",11],["13:00",13],["14:00",14]];
  rows.forEach(([label,h])=>{
    const t=document.createElement("div");t.className="time-label";t.textContent=label;grid.appendChild(t);
    for(let q=0;q<4;q++){
      const slot=document.createElement("div");slot.className="slot";
      const key=`${h}:${q}`;
      const id=getDay(selectedDate).slots[key];
      if(id){slot.classList.add("rate"+rateFor(id));slot.textContent=data.types.find(x=>x.id===id)?.name||""}
      slot.onclick=()=>openPicker(key);grid.appendChild(slot);
    }
    if(h===11){const br=document.createElement("div");br.className="break";br.textContent="12:00〜13:00　休憩";grid.appendChild(br)}
  });
  $("dayTotal").textContent=yen(dayTotal(selectedDate));
}
function openPicker(key){
  selectedSlot=key;const box=$("typeButtons");box.innerHTML="";
  data.types.forEach(t=>{const b=document.createElement("button");b.textContent=`${t.name}（${yen(t.rate/4)}/15分）`;b.onclick=()=>{getDay(selectedDate).slots[key]=t.id;saveData();closePicker();renderGrid();renderCalendar()};box.appendChild(b)});
  $("picker").classList.remove("hidden");
}
function closePicker(){$("picker").classList.add("hidden");selectedSlot=null}
$("closePicker").onclick=closePicker;
$("clearSlot").onclick=()=>{if(selectedSlot){delete getDay(selectedDate).slots[selectedSlot];saveData();renderGrid();renderCalendar()}closePicker()};

function renderLogs(){
  const box=$("logs"),d=getDay(selectedDate);box.innerHTML="";
  d.logs.forEach((l,i)=>{
    const e=document.createElement("div");e.className="log";
    e.innerHTML=`<strong>${escapeHtml(l.text)}</strong><div class="meta">${l.time} / ${escapeHtml(data.types.find(t=>t.id===l.type)?.name||"不明")}</div>`;
    e.onclick=()=>{if(confirm("この作業ログを削除しますか？")){d.logs.splice(i,1);saveData();renderLogs()}};
    box.appendChild(e);
  });
}
$("addLog").onclick=()=>{
  const text=prompt("作業内容");
  if(!text)return;
  const time=prompt("着手時刻（例 10:17）","10:00");
  if(!time)return;
  const names=data.types.map((t,i)=>`${i+1}: ${t.name}`).join("\n");
  const n=prompt(`作業種別の番号\n${names}`,"1");
  const type=data.types[Number(n)-1]?.id;if(!type)return;
  getDay(selectedDate).logs.push({text,time,type});saveData();renderLogs();
};

$("backToCalendar").onclick=()=>{$("dayView").classList.add("hidden");$("calendarView").classList.remove("hidden");renderCalendar()};
$("backMonth").onclick=()=>{currentMonth.setMonth(currentMonth.getMonth()-1);renderCalendar()};
$("nextMonth").onclick=()=>{currentMonth.setMonth(currentMonth.getMonth()+1);renderCalendar()};

$("settingsBtn").onclick=()=>{
  $("calendarView").classList.add("hidden");$("settingsView").classList.remove("hidden");
  const box=$("rateSettings");box.innerHTML="";
  data.types.forEach(t=>{const row=document.createElement("div");row.className="rate-row";row.innerHTML=`<input data-name="${t.id}" value="${escapeAttr(t.name)}"><input type="number" data-rate="${t.id}" value="${t.rate}" min="0">`;box.appendChild(row)});
};
$("backFromSettings").onclick=()=>{$("settingsView").classList.add("hidden");$("calendarView").classList.remove("hidden");renderCalendar()};
$("saveSettings").onclick=()=>{
  data.types.forEach(t=>{t.name=document.querySelector(`[data-name="${t.id}"]`).value;t.rate=Number(document.querySelector(`[data-rate="${t.id}"]`).value)||0});
  saveData();alert("設定を保存しました");renderCalendar();
};

function download(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$("exportJson").onclick=()=>download(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),"worklog-backup.json");
$("importJson").onclick=()=>$("jsonFile").click();
$("jsonFile").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const obj=JSON.parse(await f.text());if(!obj.types||!obj.days)throw 0;data=obj;saveData();renderCalendar();alert("バックアップを読み込みました")}catch{alert("読み込みに失敗しました")}
  e.target.value="";
};
$("exportCsv").onclick=()=>{
  const rows=[["日付","出勤","退勤","15分枠開始","作業種別","時給","15分金額","作業内容","着手時刻"]];
  Object.keys(data.days).sort().forEach(key=>{
    const d=data.days[key];
    for(const [slot,id] of Object.entries(d.slots)){
      const [h,q]=slot.split(":").map(Number),start=`${String(h).padStart(2,"0")}:${String(q*15).padStart(2,"0")}`;
      const type=data.types.find(t=>t.id===id);
      const log=d.logs.find(l=>l.type===id && l.time===start);
      rows.push([key,d.clockIn||"",d.clockOut||"",start,type?.name||"",type?.rate??0,(type?.rate??0)/4,log?.text||"",log?.time||""]);
    }
    if(Object.keys(d.slots).length===0 && d.logs.length===0)rows.push([key,d.clockIn||"",d.clockOut||"","","","","","",""]);
  });
  const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
  download(new Blob([csv],{type:"text/csv;charset=utf-8"}),"worklog.csv");
};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
renderCalendar();
