const STORAGE_KEY = "lezioni_stato_v1";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

let lessons = [];
let state = {};
let tokenClient = null;
let accessToken = null;

// ---------- stato locale ----------
function loadState(){
  try{ state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch(e){ state = {}; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getLessonState(id){ return state[id] || { status: "todo" }; }
function setLessonState(id, patch){
  state[id] = Object.assign({}, getLessonState(id), patch);
  saveState();
  render();
}

// ---------- caricamento script esterni (con vera Promise, no timer a caso) ----------
function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossibile caricare " + src));
    document.head.appendChild(s);
  });
}

async function initGoogleApis(){
  try{
    await Promise.all([
      loadScript("https://accounts.google.com/gsi/client"),
      loadScript("https://apis.google.com/js/api.js")
    ]);
    await new Promise((resolve, reject) => {
      gapi.load("client", { callback: resolve, onerror: reject });
    });
    await gapi.client.init({
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"]
    });
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: onAuthResult
    });
    document.getElementById("authBtn").disabled = false;
  }catch(err){
    console.error(err);
    showSnackbar("Impossibile caricare le API di Google.", true);
  }
}

function onAuthResult(resp){
  if(resp.error){
    showSnackbar("Accesso al calendario negato.", true);
    return;
  }
  accessToken = resp.access_token;
  gapi.client.setToken({ access_token: accessToken });
  const card = document.getElementById("calendarCard");
  card.classList.add("connected");
  document.getElementById("authStatus").textContent = "Calendario collegato";
  document.getElementById("authBtn").textContent = "Ricollega";
  showSnackbar("Google Calendar collegato.");
}

document.addEventListener("click", (e) => {
  if(e.target.id === "authBtn"){
    if(!tokenClient){ showSnackbar("Google non ancora pronto, riprova tra poco.", true); return; }
    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }
});

// ---------- interfaccia ----------
function renderDays(){
  const el = document.getElementById("days");
  const names = ["D","L","M","M","G","V","S"];
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  el.innerHTML = "";
  for(let i = 0; i < 7; i++){
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const div = document.createElement("div");
    div.className = "day" + (d.toDateString() === today.toDateString() ? " today" : "");
    div.textContent = names[d.getDay()];
    el.appendChild(div);
  }
}

function formatDate(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

function statusLabel(s){
  return s === "done" ? "fatta" : s === "scheduled" ? "programmata" : "da fare";
}

function render(){
  const list = document.getElementById("list");
  list.innerHTML = "";
  const done = lessons.filter(l => getLessonState(l.id).status === "done").length;
  document.getElementById("progressText").textContent = `${done} di ${lessons.length} lezioni completate`;
  document.getElementById("progressFill").style.width = lessons.length ? `${(done/lessons.length)*100}%` : "0%";

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
    card.className = "card" + (s.expanded ? " expanded" : "") + (s.status === "done" ? " status-done" : "");

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="icon"><span class="material-symbols-rounded">${lesson.icon}</span></div>
      <div class="row-info">
        <div class="row-title ${s.status === "done" ? "done" : ""}">${lesson.title}</div>
        <div class="row-meta"><span>${lesson.duration} min</span>${s.date ? `<span>· ${formatDate(s.date)}</span>` : ""}</div>
      </div>
      <span class="chip ${s.status}">${statusLabel(s.status)}</span>
      <span class="material-symbols-rounded chevron">expand_more</span>
    `;
    row.addEventListener("click", () => setLessonState(lesson.id, { expanded: !s.expanded }));
    card.appendChild(row);

    if(s.expanded){
      const actions = document.createElement("div");
      actions.className = "actions";

      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = s.date || "";

      const moveBtn = document.createElement("button");
      moveBtn.className = "action-btn primary";
      moveBtn.innerHTML = `<span class="material-symbols-rounded">event</span>Sposta`;
      moveBtn.addEventListener("click", (e) => { e.stopPropagation(); scheduleLesson(lesson, dateInput.value); });

      const doneBtn = document.createElement("button");
      doneBtn.className = "action-btn secondary";
      const isDone = s.status === "done";
      doneBtn.innerHTML = `<span class="material-symbols-rounded">${isDone ? "replay" : "check"}</span>${isDone ? "Da rifare" : "Fatta"}`;
      doneBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleDone(lesson); });

      actions.appendChild(dateInput);
      actions.appendChild(moveBtn);
      actions.appendChild(doneBtn);
      card.appendChild(actions);
    }
    list.appendChild(card);
  });
}

function showSnackbar(text, isError){
  const el = document.getElementById("snackbar");
  el.textContent = text;
  el.className = "snackbar show" + (isError ? " error" : "");
  clearTimeout(showSnackbar._t);
  showSnackbar._t = setTimeout(() => { el.className = "snackbar"; }, 3500);
}

function pad(n){ return String(n).padStart(2, "0"); }

async function scheduleLesson(lesson, dateStr){
  if(!dateStr){ showSnackbar("Scegli prima una data.", true); return; }
  if(!accessToken){ showSnackbar("Collega prima il calendario.", true); return; }

  const s = getLessonState(lesson.id);
  const startHour = 10;
  const endMinutesTotal = startHour * 60 + lesson.duration;
  const endStr = `${pad(Math.floor(endMinutesTotal/60))}:${pad(endMinutesTotal%60)}:00`;
  const start = `${dateStr}T${pad(startHour)}:00:00`;
  const end = `${dateStr}T${endStr}`;

  const resource = {
    summary: lesson.title,
    description: `Lezione ${lesson.phase}: ${lesson.title} (${lesson.duration} min)`,
    start: { dateTime: start },
    end: { dateTime: end }
  };

  try{
    let ev;
    if(s.eventId){
      ev = await gapi.client.calendar.events.patch({ calendarId: "primary", eventId: s.eventId, resource });
    } else {
      ev = await gapi.client.calendar.events.insert({ calendarId: "primary", resource });
    }
    setLessonState(lesson.id, { status: "scheduled", date: dateStr, eventId: ev.result.id, expanded: false });
    showSnackbar("Evento salvato su Google Calendar.");
  }catch(err){
    console.error(err);
    const reason = err && err.result && err.result.error ? err.result.error.message : "errore sconosciuto";
    showSnackbar("Errore nel salvare l'evento: " + reason, true);
  }
}

function toggleDone(lesson){
  const s = getLessonState(lesson.id);
  const newStatus = s.status === "done" ? (s.date ? "scheduled" : "todo") : "done";
  setLessonState(lesson.id, { status: newStatus, expanded: false });
}

// ---------- avvio ----------
window.addEventListener("load", async () => {
  loadState();
  renderDays();
  document.getElementById("authBtn").disabled = true;
  try{
    const res = await fetch("lessons.json");
    lessons = await res.json();
  }catch(err){
    console.error(err);
    showSnackbar("Impossibile caricare le lezioni.", true);
  }
  render();
  initGoogleApis();
});
