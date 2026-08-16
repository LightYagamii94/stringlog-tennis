const STORAGE_KEY = "stringlog-data-v2";
const OLD_STORAGE_KEY = "stringlog-data-v1";

const state = loadData();
let selectedRacketId = state.selectedRacketId || "r1";
let deferredPrompt = null;

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0,10);

function defaultState(){
  return {
    version: 3,
    selectedRacketId: "r1",
    rackets: [
      { id: "r1", name: "Racchetta 1" },
      { id: "r2", name: "Racchetta 2" }
    ],
    stringings: []
  };
}

function normalizeState(data){
  const out = data || defaultState();
  out.version = 3;
  if(!Array.isArray(out.rackets) || out.rackets.length < 2){
    out.rackets = defaultState().rackets;
  }
  if(!Array.isArray(out.stringings)) out.stringings = [];
  out.stringings.forEach(s => {
    if(!s.racketId) s.racketId = "r1";
    if(!Array.isArray(s.sessions)) s.sessions = [];
    if(!("notes" in s)) s.notes = "";
    s.sessions.forEach(sess => {
      if(!("notes" in sess)) sess.notes = "";
    });
  });
  return out;
}

function loadData(){
  try{
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed && Array.isArray(parsed.stringings)){
      return normalizeState(parsed);
    }
  }catch(e){}

  try{
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if(old && Array.isArray(old.stringings)){
      const migrated = defaultState();
      migrated.stringings = old.stringings.map(s => ({
        ...s,
        racketId: "r1",
        sessions: Array.isArray(s.sessions) ? s.sessions : []
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }catch(e){}

  return defaultState();
}

function saveData(){
  state.version = 3;
  state.selectedRacketId = selectedRacketId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function currentRacket(){
  return state.rackets.find(r => r.id === selectedRacketId) || state.rackets[0];
}

function stringingsFor(racketId){
  return state.stringings.filter(s => s.racketId === racketId);
}

function activeStringing(racketId = selectedRacketId){
  return state.stringings.find(s => s.racketId === racketId && !s.brokenDate) || null;
}

function findStringing(id){
  return state.stringings.find(s => s.id === id) || null;
}

function totalHours(s){
  return (s.sessions || []).reduce((sum, x) => sum + Number(x.hours || 0), 0);
}

function formatDate(iso){
  if(!iso) return "—";
  return new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"})
    .format(new Date(iso+"T12:00:00"));
}

function formatHours(hours){
  if(hours == null || Number.isNaN(hours)) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if(h && m) return `${h}h ${m}m`;
  if(h) return `${h}h`;
  return `${m}m`;
}

function hoursToParts(value){
  const total = Math.round(Number(value || 0) * 60);
  return {h: Math.floor(total / 60), m: total % 60};
}

function partsToHours(h, m){
  return Number(h || 0) + Number(m || 0) / 60;
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function render(){
  renderRackets();
  renderActive();
  renderHistory();
  renderStats();
}

function renderRackets(){
  const racket = currentRacket();
  $("selectedRacketTitle").textContent = racket.name;
  $("dialogRacketName").textContent = racket.name;

  $("racketSelector").innerHTML = state.rackets.map((r, index) => {
    const active = activeStringing(r.id);
    const status = active
      ? `${escapeHtml(active.stringName)} · ${formatHours(totalHours(active))}`
      : "Nessuna corda attiva";

    return `
      <button class="racket-tab ${r.id === selectedRacketId ? "active" : ""}" data-racket-id="${r.id}" type="button">
        <span class="racket-number">RACCHETTA ${index + 1}</span>
        <span class="racket-name">${escapeHtml(r.name)}</span>
        <span class="racket-status">${status}</span>
      </button>`;
  }).join("");

  document.querySelectorAll(".racket-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRacketId = btn.dataset.racketId;
      saveData();
    });
  });
}

function sessionHtml(stringing, session, index, showDelete = true){
  return `
    <div class="session">
      <div class="session-main">
        <span>${formatDate(session.date)} · <strong>${formatHours(session.hours)}</strong></span>
        ${session.notes ? `<small>${escapeHtml(session.notes)}</small>` : ""}
      </div>
      <div></div>
      <div class="session-actions">
        <button class="mini-btn edit-session" type="button"
          data-stringing-id="${stringing.id}" data-session-index="${index}">Modifica</button>
        ${showDelete ? `<button class="mini-btn delete delete-session" type="button"
          data-stringing-id="${stringing.id}" data-session-index="${index}">Elimina</button>` : ""}
      </div>
    </div>`;
}

function bindSessionButtons(scope = document){
  scope.querySelectorAll(".edit-session").forEach(btn => {
    btn.addEventListener("click", () => {
      openEditSessionDialog(btn.dataset.stringingId, Number(btn.dataset.sessionIndex));
    });
  });
  scope.querySelectorAll(".delete-session").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteSession(btn.dataset.stringingId, Number(btn.dataset.sessionIndex));
    });
  });
}

function renderActive(){
  const holder = $("activeCard");
  const current = activeStringing();

  if(!current){
    holder.innerHTML = $("emptyActiveTemplate").innerHTML;
    return;
  }

  const hours = totalHours(current);
  const sessions = (current.sessions || []).map((s, index) => ({...s, _index:index}))
    .reverse()
    .map(s => sessionHtml(current, s, s._index))
    .join("");

  holder.innerHTML = `
    <article class="active-card">
      <div class="active-head">
        <div>
          <h3>${escapeHtml(current.stringName)}</h3>
          <p>${escapeHtml(currentRacket().name)}</p>
        </div>
        <div class="hours-ring">
          <strong>${hours < 100 ? hours.toFixed(hours % 1 ? 1 : 0) : Math.round(hours)}</strong>
          <span>ORE</span>
        </div>
      </div>

      <div class="meta">
        <div><span>Incordata</span><strong>${formatDate(current.date)}</strong></div>
        <div><span>Tensione</span><strong>${escapeHtml(current.tension || "—")}</strong></div>
        <div><span>Calibro</span><strong>${escapeHtml(current.gauge || "—")}</strong></div>
        <div><span>Sessioni</span><strong>${(current.sessions || []).length}</strong></div>
      </div>

      <div class="actions">
        <button id="addHoursBtn" class="primary" type="button">+ Aggiungi ore</button>
        <button id="editActiveBtn" class="ghost" type="button">Modifica</button>
        <button id="markBrokenBtn" class="ghost" type="button">Corda rotta</button>
      </div>
      <div class="secondary-actions">
        <button id="deleteActiveBtn" class="soft-danger" type="button">Elimina incordatura</button>
        <span></span>
      </div>

      ${(current.sessions || []).length ? `
      <div class="session-list">
        <h4>Sessioni di gioco — puoi correggerle in qualsiasi momento</h4>
        ${sessions}
      </div>` : ""}
    </article>`;

  $("addHoursBtn").addEventListener("click", openHoursDialog);
  $("editActiveBtn").addEventListener("click", () => openEditStringingDialog(current.id));
  $("markBrokenBtn").addEventListener("click", openBreakDialog);
  $("deleteActiveBtn").addEventListener("click", () => deleteStringing(current.id));
  bindSessionButtons(holder);
}

function renderHistory(){
  const history = stringingsFor(selectedRacketId)
    .filter(s => s.brokenDate)
    .sort((a,b) => b.brokenDate.localeCompare(a.brokenDate));

  if(!history.length){
    $("historyList").innerHTML = `<div class="no-history">Le incordature concluse di questa racchetta appariranno qui.</div>`;
    return;
  }

  $("historyList").innerHTML = history.map(s => {
    const sessions = (s.sessions || []).map((session,index) => sessionHtml(s, session, index)).join("");
    return `
      <article class="history-item">
        <div class="history-top">
          <div>
            <h3>${escapeHtml(s.stringName)}</h3>
            <p>${formatDate(s.date)} → ${formatDate(s.brokenDate)}</p>
          </div>
          <div class="history-hours">${formatHours(totalHours(s))}</div>
        </div>
        <div class="history-meta">
          ${s.gauge ? `<span class="chip">${escapeHtml(s.gauge)}</span>` : ""}
          ${s.tension ? `<span class="chip">${escapeHtml(s.tension)}</span>` : ""}
          <span class="chip">${(s.sessions || []).length} sessioni</span>
        </div>
        <div class="history-actions">
          <button class="mini-btn edit-history" data-id="${s.id}" type="button">Modifica</button>
          <button class="mini-btn delete delete-history" data-id="${s.id}" type="button">Elimina</button>
        </div>
        ${(s.sessions || []).length ? `
          <details class="history-sessions">
            <summary>Mostra / correggi sessioni di gioco</summary>
            ${sessions}
          </details>` : ""}
      </article>`;
  }).join("");

  document.querySelectorAll(".edit-history").forEach(btn => {
    btn.addEventListener("click", () => openEditStringingDialog(btn.dataset.id));
  });

  document.querySelectorAll(".delete-history").forEach(btn => {
    btn.addEventListener("click", () => deleteStringing(btn.dataset.id));
  });

  bindSessionButtons($("historyList"));
}

function renderStats(){
  const all = stringingsFor(selectedRacketId);
  const closed = all.filter(s => s.brokenDate);
  const values = closed.map(totalHours);
  $("statCount").textContent = all.length;
  $("statAverage").textContent = values.length
    ? formatHours(values.reduce((a,b)=>a+b,0)/values.length) : "—";
  $("statBest").textContent = values.length ? formatHours(Math.max(...values)) : "—";
}

function openStringingDialog(){
  if(activeStringing()){
    alert("Questa racchetta ha già un'incordatura attiva. Segnala prima la rottura della corda corrente.");
    return;
  }
  $("stringingForm").reset();
  $("stringDate").value = today();
  $("dialogRacketName").textContent = currentRacket().name;
  $("stringingDialog").showModal();
}

function openEditStringingDialog(id){
  const s = findStringing(id);
  if(!s) return;

  $("editStringingId").value = s.id;
  $("editStringDate").value = s.date || today();
  $("editStringName").value = s.stringName || "";
  $("editGauge").value = s.gauge || "";
  $("editTension").value = s.tension || "";
  $("editNotes").value = s.notes || "";
  $("editBrokenDate").value = s.brokenDate || "";

  const isClosed = Boolean(s.brokenDate);
  $("editBrokenDateWrap").classList.toggle("hidden", !isClosed);

  $("editStringingDialog").showModal();
}

function openHoursDialog(){
  $("hoursForm").reset();
  $("playDate").value = today();
  $("playHours").value = 1;
  $("playMinutes").value = 0;
  $("hoursDialog").showModal();
}

function openEditSessionDialog(stringingId, index){
  const s = findStringing(stringingId);
  const session = s?.sessions?.[index];
  if(!s || !session) return;

  const parts = hoursToParts(session.hours);
  $("editSessionStringingId").value = stringingId;
  $("editSessionIndex").value = String(index);
  $("editPlayDate").value = session.date || today();
  $("editPlayHours").value = parts.h;
  $("editPlayMinutes").value = parts.m;
  $("editPlayNotes").value = session.notes || "";
  $("editSessionDialog").showModal();
}

function openBreakDialog(){
  $("breakForm").reset();
  $("breakDate").value = today();
  $("breakDialog").showModal();
}

function deleteStringing(id){
  const s = findStringing(id);
  if(!s) return;

  const label = s.brokenDate ? "questa incordatura dallo storico" : "l'incordatura attiva";
  if(!confirm(`Eliminare ${label}? Verranno eliminate anche tutte le ore di gioco associate. Questa operazione non può essere annullata.`)){
    return;
  }

  const idx = state.stringings.findIndex(x => x.id === id);
  if(idx >= 0){
    state.stringings.splice(idx,1);
    saveData();
  }
}

function deleteSession(stringingId, index){
  const s = findStringing(stringingId);
  const session = s?.sessions?.[index];
  if(!s || !session) return;

  if(!confirm(`Eliminare la sessione di ${formatHours(session.hours)} del ${formatDate(session.date)}?`)){
    return;
  }

  s.sessions.splice(index,1);
  saveData();
}

$("newStringingBtn").addEventListener("click", openStringingDialog);

$("stringingForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    racketId: selectedRacketId,
    date: $("stringDate").value,
    stringName: $("stringName").value.trim(),
    gauge: $("gauge").value.trim(),
    tension: $("tension").value.trim(),
    notes: $("notes").value.trim(),
    sessions: [],
    brokenDate: null
  };
  state.stringings.unshift(item);
  $("stringingDialog").close();
  saveData();
});

$("editStringingForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = findStringing($("editStringingId").value);
  if(!s) return;

  s.date = $("editStringDate").value;
  s.stringName = $("editStringName").value.trim();
  s.gauge = $("editGauge").value.trim();
  s.tension = $("editTension").value.trim();
  s.notes = $("editNotes").value.trim();

  if(s.brokenDate){
    s.brokenDate = $("editBrokenDate").value || s.brokenDate;
  }

  $("editStringingDialog").close();
  saveData();
});

$("hoursForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const current = activeStringing();
  if(!current) return;

  const hours = partsToHours($("playHours").value, $("playMinutes").value);
  if(hours <= 0){
    alert("Inserisci una durata maggiore di zero.");
    return;
  }

  current.sessions.push({
    date: $("playDate").value,
    hours,
    notes: $("playNotes").value.trim()
  });

  $("hoursDialog").close();
  saveData();
});

$("editSessionForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const s = findStringing($("editSessionStringingId").value);
  const index = Number($("editSessionIndex").value);
  const session = s?.sessions?.[index];
  if(!s || !session) return;

  const hours = partsToHours($("editPlayHours").value, $("editPlayMinutes").value);
  if(hours <= 0){
    alert("Inserisci una durata maggiore di zero.");
    return;
  }

  session.date = $("editPlayDate").value;
  session.hours = hours;
  session.notes = $("editPlayNotes").value.trim();

  $("editSessionDialog").close();
  saveData();
});

$("breakForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const current = activeStringing();
  if(!current) return;
  current.brokenDate = $("breakDate").value;
  $("breakDialog").close();
  saveData();
});

$("editRacketsBtn").addEventListener("click", () => {
  $("racketName1").value = state.rackets[0].name;
  $("racketName2").value = state.rackets[1].name;
  $("racketsDialog").showModal();
});

$("racketsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n1 = $("racketName1").value.trim();
  const n2 = $("racketName2").value.trim();
  if(!n1 || !n2) return;
  state.rackets[0].name = n1;
  state.rackets[1].name = n2;
  $("racketsDialog").close();
  saveData();
});

$("exportBtn").addEventListener("click", () => {
  const payload = {
    app: "StringLog Tennis",
    version: 3,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stringlog-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("importBtn").addEventListener("click", () => $("importInput").click());

$("importInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if(!file) return;
  try{
    const parsed = JSON.parse(await file.text());
    const incoming = parsed?.data?.stringings ? parsed.data : parsed;
    if(!incoming || !Array.isArray(incoming.stringings)) throw new Error("Formato non valido");

    let normalized;
    if(Array.isArray(incoming.rackets)){
      normalized = normalizeState(incoming);
    }else{
      normalized = defaultState();
      normalized.stringings = incoming.stringings.map(s => ({
        ...s,
        racketId: "r1",
        sessions: Array.isArray(s.sessions) ? s.sessions : []
      }));
    }

    if(!confirm("Ripristinare questo backup? I dati attuali verranno sostituiti.")) return;

    state.rackets = normalized.rackets;
    state.stringings = normalized.stringings;
    selectedRacketId = normalized.selectedRacketId || state.rackets[0].id;
    saveData();
    alert("Backup ripristinato.");
  }catch(e){
    alert("Questo file non sembra essere un backup valido di StringLog.");
  }finally{
    event.target.value = "";
  }
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
});

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

render();
