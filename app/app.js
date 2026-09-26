const STORAGE_KEY = "lezioni_stato_v1";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";
let lessons = [];
let state = {};
let tokenClient, accessToken = null, gapiReady = false;

function loadState(){
  try{ state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch(e){ state = {}; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getLessonState(id){ return state[id] || {status:"todo"}; }
function setLessonState(id, patch){
  state[id] = Object.assign({}, getLessonState(id), patch);
  saveState();
  render();
}

function renderDays(){
  const el = document.getElementById("days");
  const names = ["D","L","M","M","G","V","S"];
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay()+6)%7));
  el.innerHTML = "";
  for(let i=0;i<7;i++){
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    const div = document.createElement("div");
    div.className = "day" + (d.toDateString()===today.toDateString() ? " today" : "");
    div.textContent = names[d.getDay()];
    el.appendChild(div);
  }
}

function render(){
  const list = document.getElementById("list");
  list.innerHTML = "";
  const done = lessons.filter(l => getLessonState(l.id).status==="done").length;
  document.getElementById("progress").textContent = `${done} di ${lessons.length} lezioni completate`;
  let lastPhase = null;
  lessons.forEach(lesson => {
    if(lesson.phase !== lastPhase){
      const h = document.createElement("div");
      h.className = "phase-title";
      h.textContent = lesson.phase;
      list.appendChild(h);
      lastPhase = lesson.phase;
    }
    const s = getLessonState(lesson.id);
    const card = document.createElement("div");
    card.className = "card" + (s.expanded ? " expanded" : "");

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <i class="ti ${lesson.icon}"></i>
      <div class="info">
        <div class="title ${s.status==='done'?'done':''}">${lesson.title}</div>
        <div class="meta">${lesson.duration} min${s.date ? " · " + formatDate(s.date) : ""}</div>
      </div>
      <span class="badge ${s.status}">${s.status==='done'?'fatta':s.status==='scheduled'?'programmata':'da fare'}</span>
    `;
    row.addEventListener("click", () => setLessonState(lesson.id, {expanded: !s.expanded}));
    card.appendChild(row);

    if(s.expanded){
      const actions = document.createElement("div");
      actions.className = "actions";
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = s.date || "";
      const moveBtn = document.createElement("button");
      moveBtn.textContent = "Sposta";
      moveBtn.addEventListener("click", (e) => { e.stopPropagation(); scheduleLesson(lesson, dateInput.value); });
      const doneBtn = document.createElement("button");
      doneBtn.textContent = s.status==="done" ? "Segna da rifare" : "Segna come fatta";
      doneBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleDone(lesson); });
      actions.appendChild(dateInput);
      actions.appendChild(moveBtn);
      actions.appendChild(doneBtn);
      card.appendChild(actions);
    }
    list.appendChild(card);
  });
}

function formatDate(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", {weekday:"short", day:"numeric", month:"short"});
}

async function scheduleLesson(lesson, dateStr){
  if(!dateStr){ showMsg("Scegli prima una data."); return; }
  if(!accessToken){ showMsg("Collega prima il calendario."); return; }
  const s = getLessonState(lesson.id);
  const start = dateStr + "T10:00:00";
  const end = dateStr + "T" + pad(10 + Math.ceil(lesson.duration/60)) + ":" + String(lesson.duration%60).padStart(2,"0") + ":00";
  try{
    let ev;
    if(s.eventId){
      ev = await gapi.client.calendar.events.patch({
        calendarId: "primary", eventId: s.eventId,
        resource: { summary: lesson.title, start:{dateTime:toLocal(start)}, end:{dateTime:toLocal(end)} }
      });
    } else {
      ev = await gapi.client.calendar.events.insert({
        calendarId: "primary",
        resource: {
          summary: lesson.title,
          description: `Lezione ${lesson.phase}: ${lesson.title} (${lesson.duration} min)`,
          start:{dateTime:toLocal(start)}, end:{dateTime:toLocal(end)}
        }
      });
    }
    setLessonState(lesson.id, {status:"scheduled", date:dateStr, eventId: ev.result.id, expanded:false});
    showMsg("Evento salvato su Google Calendar.");
  }catch(err){
    console.error(err);
    showMsg("Errore nel salvare l'evento su Google Calendar.");
  }
}

async function toggleDone(lesson){
  const s = getLessonState(lesson.id);
  const newStatus = s.status==="done" ? (s.date?"scheduled":"todo") : "done";
  setLessonState(lesson.id, {status:newStatus, expanded:false});
}

function pad(n){ return String(n).padStart(2,"0"); }
function toLocal(dtStr){ return dtStr; }
function showMsg(t){ document.getElementById("msg").textContent = t; setTimeout(()=>{document.getElementById("msg").textContent="";}, 4000); }

function initGoogle(){
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if(resp.error){ showMsg("Accesso al calendario negato."); return; }
      accessToken = resp.access_token;
      gapi.client.setToken({access_token: accessToken});
      document.getElementById("authStatus").textContent = "Calendario collegato";
      document.getElementById("authBtn").textContent = "Ricollega";
    }
  });
}
function loadGapi(){
  gapi.load("client", async () => {
    await gapi.client.init({});
    await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest");
    gapiReady = true;
  });
}

document.getElementById("authBtn").addEventListener("click", () => {
  if(!tokenClient){ showMsg("Google non ancora caricato, riprova tra poco."); return; }
  tokenClient.requestAccessToken();
});

window.addEventListener("load", () => {
  loadState();
  renderDays();
  fetch("lessons.json").then(r=>r.json()).then(data => { lessons = data; render(); });
  if(window.google && google.accounts) initGoogle(); else setTimeout(initGoogle, 800);
  if(window.gapi) loadGapi(); else setTimeout(loadGapi, 800);
});
