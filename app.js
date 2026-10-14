const STORAGE_KEY = "stringlog-data-v2";
const OLD_STORAGE_KEY = "stringlog-data-v1";

const state = loadData();
let selectedRacketId = state.selectedRacketId || "r1";
let selectedView = state.selectedView === "tests" ? "tests" : "rackets";
let selectedTestType = state.selectedTestType === "tension" ? "tension" : "string";
let deferredPrompt = null;

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0,10);
const newId = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

const TEST_TYPES = {
  string: {
    label: "TEST CORDA",
    question: "Che corda stai testando?",
    intro: "Prova corde diverse e annota le sensazioni sessione dopo sessione.",
    empty: "Nessun test di corde"
  },
  tension: {
    label: "TEST TENSIONE",
    question: "Che tensione stai testando?",
    intro: "Prova tensioni diverse e annota come cambia la risposta della racchetta.",
    empty: "Nessun test di tensioni"
  }
};

function defaultState(){
  return {
    version: 4,
    selectedRacketId: "r1",
    rackets: [
      { id: "r1", name: "Racchetta 1" },
      { id: "r2", name: "Racchetta 2" }
    ],
    stringings: [],
    tests: []
  };
}

function normalizeState(data){
  const out = data || defaultState();
  out.version = 4;
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
  if(!Array.isArray(out.tests)) out.tests = [];
  out.tests.forEach(t => {
    if(t.type !== "tension") t.type = "string";
    if(!Array.isArray(t.entries)) t.entries = [];
    t.rating = Number(t.rating) || 0;
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
  state.version = 4;
  state.selectedRacketId = selectedRacketId;
  state.selectedView = selectedView;
  state.selectedTestType = selectedTestType;
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

function findTest(id){
  return state.tests.find(t => t.id === id) || null;
}

function racketName(id){
  return state.rackets.find(r => r.id === id)?.name || "";
}

function testTitle(t){
  return (t.type === "tension" ? t.tension : t.stringName) || "—";
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
  renderView();
  renderRackets();
  renderActive();
  renderHistory();
  renderStats();
  renderTests();
}

function renderView(){
  $("viewRackets").classList.toggle("hidden", selectedView !== "rackets");
  $("viewTests").classList.toggle("hidden", selectedView !== "tests");
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === selectedView);
  });
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

function ratingHtml(rating){
  if(!rating) return "";
  return `<div class="rating" aria-label="Voto ${rating} su 5">${"★".repeat(rating)}<span class="off">${"★".repeat(5 - rating)}</span></div>`;
}

function noteHtml(test, entry, index){
  return `
    <div class="session note-entry">
      <div class="session-main">
        <span class="note-date">${formatDate(entry.date)}</span>
        <p class="note-text">${escapeHtml(entry.text)}</p>
      </div>
      <div></div>
      <div class="session-actions">
        <button class="mini-btn edit-note" type="button"
          data-test-id="${test.id}" data-note-index="${index}">Modifica</button>
        <button class="mini-btn delete delete-note" type="button"
          data-test-id="${test.id}" data-note-index="${index}">Elimina</button>
      </div>
    </div>`;
}

function testHtml(t){
  const secondary = t.type === "tension"
    ? t.stringName
    : (t.tension ? `Tensione ${t.tension}` : "");
  const racket = racketName(t.racketId);
  const notes = t.entries.map((entry, index) => ({...entry, _index:index}))
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""))
    .map(entry => noteHtml(t, entry, entry._index))
    .join("");

  return `
    <article class="history-item test-item">
      <div class="history-top">
        <div>
          <h3>${escapeHtml(testTitle(t))}</h3>
          <p>${secondary ? `${escapeHtml(secondary)} · ` : ""}dal ${formatDate(t.date)}</p>
        </div>
        ${ratingHtml(t.rating)}
      </div>
      <div class="history-meta">
        ${t.gauge ? `<span class="chip">${escapeHtml(t.gauge)}</span>` : ""}
        ${racket ? `<span class="chip">${escapeHtml(racket)}</span>` : ""}
        <span class="chip">${t.entries.length} ${t.entries.length === 1 ? "nota" : "note"}</span>
      </div>
      <div class="history-actions">
        <button class="mini-btn add-note" data-id="${t.id}" type="button">+ Nota</button>
        <button class="mini-btn edit-test" data-id="${t.id}" type="button">Modifica</button>
        <button class="mini-btn delete delete-test" data-id="${t.id}" type="button">Elimina</button>
      </div>
      ${t.entries.length ? `<div class="test-notes">${notes}</div>` : ""}
    </article>`;
}

function renderTests(){
  const type = TEST_TYPES[selectedTestType];
  document.querySelectorAll(".segment").forEach(btn => {
    const active = btn.dataset.testType === selectedTestType;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  $("countString").textContent = state.tests.filter(t => t.type === "string").length;
  $("countTension").textContent = state.tests.filter(t => t.type === "tension").length;
  $("testIntro").textContent = type.intro;

  const tests = state.tests
    .filter(t => t.type === selectedTestType)
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  if(!tests.length){
    $("testList").innerHTML = `
      <div class="empty-card">
        <div class="ball">🧪</div>
        <h3>${type.empty}</h3>
        <p>Inizia il primo test: potrai aggiungere note dopo ogni sessione e modificarle quando vuoi.</p>
        <button id="emptyNewTestBtn" class="primary empty-action" type="button">+ Inizia un test</button>
      </div>`;
    $("emptyNewTestBtn").addEventListener("click", () => openTestDialog());
    return;
  }

  $("testList").innerHTML = tests.map(testHtml).join("");

  document.querySelectorAll(".add-note").forEach(btn => {
    btn.addEventListener("click", () => openNoteDialog(btn.dataset.id));
  });
  document.querySelectorAll(".edit-test").forEach(btn => {
    btn.addEventListener("click", () => openTestDialog(btn.dataset.id));
  });
  document.querySelectorAll(".delete-test").forEach(btn => {
    btn.addEventListener("click", () => deleteTest(btn.dataset.id));
  });
  document.querySelectorAll(".edit-note").forEach(btn => {
    btn.addEventListener("click", () => openNoteDialog(btn.dataset.testId, Number(btn.dataset.noteIndex)));
  });
  document.querySelectorAll(".delete-note").forEach(btn => {
    btn.addEventListener("click", () => deleteNote(btn.dataset.testId, Number(btn.dataset.noteIndex)));
  });
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

function setRatingInput(value){
  $("testRating").value = String(value);
  document.querySelectorAll("#ratingInput .star").forEach(star => {
    star.classList.toggle("on", Number(star.dataset.value) <= value);
  });
}

function setTestLayout(type){
  const isString = type === "string";
  $("testStringWrap").classList.toggle("main-field", isString);
  $("testTensionWrap").classList.toggle("main-field", !isString);
  $("testStringLabel").textContent = isString ? TEST_TYPES.string.question : "Corda";
  $("testTensionLabel").textContent = isString ? "Tensione" : TEST_TYPES.tension.question;
  $("testString").required = isString;
  $("testTension").required = !isString;
}

function openTestDialog(id){
  const t = id ? findTest(id) : null;
  if(id && !t) return;
  const type = t ? t.type : selectedTestType;

  $("testForm").reset();
  $("testId").value = t ? t.id : "";
  $("testType").value = type;
  $("testRacket").innerHTML = `<option value="">Nessuna</option>` +
    state.rackets.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");

  if(t){
    $("testString").value = t.stringName || "";
    $("testTension").value = t.tension || "";
    $("testGauge").value = t.gauge || "";
    $("testDate").value = t.date || today();
    $("testRacket").value = t.racketId || "";
  }else{
    // Parte dall'incordatura attiva della racchetta selezionata, se c'è
    const active = activeStringing();
    $("testString").value = active?.stringName || "";
    $("testTension").value = active?.tension || "";
    $("testGauge").value = active?.gauge || "";
    $("testDate").value = today();
    $("testRacket").value = selectedRacketId;
  }

  setRatingInput(t ? t.rating : 0);
  setTestLayout(type);
  $("testDialogLabel").textContent = TEST_TYPES[type].label;
  $("testDialogTitle").textContent = t ? "Modifica test" : "Nuovo test";
  $("testFirstNoteWrap").classList.toggle("hidden", Boolean(t));
  $("testDialog").showModal();
}

function openNoteDialog(testId, index = null){
  const t = findTest(testId);
  const entry = index == null ? null : t?.entries?.[index];
  if(!t || (index != null && !entry)) return;

  $("noteForm").reset();
  $("noteTestId").value = t.id;
  $("noteIndex").value = index == null ? "" : String(index);
  $("noteDate").value = entry ? entry.date || today() : today();
  $("noteText").value = entry ? entry.text : "";
  $("noteDialogTestName").textContent = `${TEST_TYPES[t.type].label} · ${testTitle(t)}`;
  $("noteDialogTitle").textContent = entry ? "Modifica nota" : "Nuova nota";
  $("noteDialog").showModal();
}

function deleteTest(id){
  const t = findTest(id);
  if(!t) return;

  if(!confirm(`Eliminare il test "${testTitle(t)}"? Verranno eliminate anche tutte le note associate. Questa operazione non può essere annullata.`)){
    return;
  }

  state.tests.splice(state.tests.indexOf(t), 1);
  saveData();
}

function deleteNote(testId, index){
  const t = findTest(testId);
  const entry = t?.entries?.[index];
  if(!t || !entry) return;

  if(!confirm(`Eliminare la nota del ${formatDate(entry.date)}?`)){
    return;
  }

  t.entries.splice(index, 1);
  saveData();
}

// La × chiude il dialog senza inviare il modulo (altrimenti salverebbe i dati)
document.querySelectorAll("dialog .icon-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    btn.closest("dialog").close();
  });
});

$("newStringingBtn").addEventListener("click", openStringingDialog);

$("stringingForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const item = {
    id: newId(),
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

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedView = btn.dataset.view;
    saveData();
    window.scrollTo(0, 0);
  });
});

document.querySelectorAll(".segment").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedTestType = btn.dataset.testType;
    saveData();
  });
});

$("newTestBtn").addEventListener("click", () => openTestDialog());

document.querySelectorAll("#ratingInput .star").forEach(star => {
  star.addEventListener("click", () => {
    const value = Number(star.dataset.value);
    // Un secondo tocco sulla stessa stella toglie il voto
    setRatingInput(Number($("testRating").value) === value ? 0 : value);
  });
});

$("testForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    type: $("testType").value === "tension" ? "tension" : "string",
    date: $("testDate").value,
    stringName: $("testString").value.trim(),
    tension: $("testTension").value.trim(),
    gauge: $("testGauge").value.trim(),
    racketId: $("testRacket").value,
    rating: Number($("testRating").value) || 0
  };

  const t = findTest($("testId").value);
  if(t){
    Object.assign(t, data);
  }else{
    const firstNote = $("testFirstNote").value.trim();
    state.tests.unshift({
      id: newId(),
      ...data,
      entries: firstNote ? [{date: data.date, text: firstNote}] : []
    });
  }

  $("testDialog").close();
  saveData();
});

$("noteForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const t = findTest($("noteTestId").value);
  if(!t) return;

  const text = $("noteText").value.trim();
  if(!text){
    alert("Scrivi il testo della nota.");
    return;
  }

  const entry = {date: $("noteDate").value, text};
  const index = $("noteIndex").value;
  if(index === ""){
    t.entries.push(entry);
  }else if(t.entries[Number(index)]){
    t.entries[Number(index)] = entry;
  }

  $("noteDialog").close();
  saveData();
});

$("exportBtn").addEventListener("click", async () => {
  const payload = {
    app: "StringLog Tennis",
    version: 4,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const json = JSON.stringify(payload,null,2);

  // Sul telefono apre il menu di condivisione, da cui si può scegliere Google Drive.
  // Il file è .txt perché Chrome non permette di condividere file .json; il contenuto resta JSON.
  const file = new File([json], `stringlog-backup-${today()}.txt`, {type:"text/plain"});
  if(navigator.canShare?.({files:[file]})){
    try{
      await navigator.share({files:[file], title:"Backup StringLog"});
      return;
    }catch(e){
      if(e.name === "AbortError") return;
    }
  }

  const blob = new Blob([json], {type:"application/json"});
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
    state.tests = normalized.tests;
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
