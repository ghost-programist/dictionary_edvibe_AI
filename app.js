const HANDLE_DB = "word-trainer-file";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "words-json";
const FILE_TYPES = [
  {
    description: "JSON-словарь",
    accept: { "application/json": [".json"] },
  },
];

const els = {
  home: document.getElementById("home-view"),
  study: document.getElementById("study-view"),
  form: document.getElementById("add-form"),
  term: document.getElementById("term-input"),
  translation: document.getElementById("translation-input"),
  tabs: document.querySelectorAll(".tab"),
  unlearnedCount: document.getElementById("unlearned-count"),
  learnedCount: document.getElementById("learned-count"),
  learnBtn: document.getElementById("learn-btn"),
  countMenu: document.getElementById("count-menu"),
  hint: document.getElementById("list-hint"),
  list: document.getElementById("word-list"),
  exitStudy: document.getElementById("exit-study"),
  taskTitle: document.getElementById("task-title"),
  remain: document.getElementById("remain-label"),
  taskRoot: document.getElementById("task-root"),
  fileStatus: document.getElementById("file-status"),
  openFile: document.getElementById("open-file"),
  saveFile: document.getElementById("save-file"),
};

let words = [];
let fileHandle = null;
let tab = "unlearned";
let session = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadHandle() {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function storeHandle(handle) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, "readwrite").objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
}

function parseWordList(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => ({
      id: String(item.id || uid()),
      term: String(item.term || "").trim(),
      translation: String(item.translation || "").trim(),
      learned: Boolean(item.learned),
    }))
    .filter((item) => item.term && item.translation);
}

function setFileStatus(name) {
  els.fileStatus.textContent = `Файл словаря: ${name}`;
}

async function ensurePermission(handle, mode = "readwrite") {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const options = { mode };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function readFromHandle(handle) {
  const file = await handle.getFile();
  const text = (await file.text()).trim();
  words = text ? parseWordList(JSON.parse(text)) : [];
  setFileStatus(file.name);
}

async function writeToHandle(handle) {
  const writable = await handle.createWritable();
  await writable.write(`${JSON.stringify(words, null, 2)}\n`);
  await writable.close();
}

function downloadWordsFile() {
  const blob = new Blob([`${JSON.stringify(words, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "words.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function saveWords() {
  if (fileHandle && (await ensurePermission(fileHandle))) {
    await writeToHandle(fileHandle);
    return;
  }
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: "words.json",
        types: FILE_TYPES,
      });
      await storeHandle(fileHandle);
      await writeToHandle(fileHandle);
      setFileStatus(fileHandle.name);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  downloadWordsFile();
}

async function loadWords() {
  fileHandle = await loadHandle();
  if (fileHandle) {
    try {
      if (await ensurePermission(fileHandle, "readwrite")) {
        await readFromHandle(fileHandle);
        return;
      }
    } catch {
      fileHandle = null;
    }
  }
  try {
    const response = await fetch("words.json", { cache: "no-store" });
    if (response.ok) {
      words = parseWordList(await response.json());
      setFileStatus("words.json (откройте файл, чтобы записывать изменения)");
      return;
    }
  } catch {
    /* file:// or missing file */
  }
  words = [];
  setFileStatus("не выбран");
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function byTab(kind) {
  return words.filter((w) => (kind === "learned" ? w.learned : !w.learned));
}

function renderHome() {
  const current = byTab(tab);
  els.unlearnedCount.textContent = byTab("unlearned").length;
  els.learnedCount.textContent = byTab("learned").length;
  els.learnBtn.textContent = tab === "learned" ? "Повторить" : "Учить слова";
  els.learnBtn.disabled = current.length === 0;
  els.hint.textContent =
    current.length === 0
      ? tab === "learned"
        ? "Пока нет выученных слов."
        : "Добавьте слова, чтобы начать учёбу."
      : tab === "learned"
        ? "Повторите выученные слова тем же набором заданий."
        : "Выберите, сколько невыученных слов взять в занятие.";

  if (!current.length) {
    els.list.innerHTML = `<li class="empty">Список пуст</li>`;
    return;
  }

  els.list.innerHTML = current
    .map(
      (w) => `
      <li class="word-item">
        <div>
          <strong>${escapeHtml(w.term)}</strong>
          <span>${escapeHtml(w.translation)}</span>
        </div>
        <button class="btn danger" data-del="${w.id}" type="button">Удалить</button>
      </li>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.openFile.addEventListener("click", async () => {
  if (!window.showOpenFilePicker) {
    els.fileStatus.textContent =
      "Этот браузер не умеет открывать файл напрямую. Положите words.json рядом с сайтом.";
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
    if (!(await ensurePermission(handle))) return;
    fileHandle = handle;
    await storeHandle(handle);
    await readFromHandle(handle);
    renderHome();
  } catch (error) {
    if (error && error.name !== "AbortError") {
      els.fileStatus.textContent = "Не удалось открыть файл.";
    }
  }
});

els.saveFile.addEventListener("click", async () => {
  await saveWords();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const term = els.term.value.trim();
  const translation = els.translation.value.trim();
  if (!term || !translation) return;
  words.unshift({ id: uid(), term, translation, learned: false });
  await saveWords();
  els.form.reset();
  els.term.focus();
  renderHome();
});

els.list.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-del]");
  if (!btn) return;
  words = words.filter((w) => w.id !== btn.dataset.del);
  await saveWords();
  renderHome();
});

els.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    tab = button.dataset.tab;
    els.tabs.forEach((t) => t.classList.toggle("is-active", t === button));
    els.countMenu.classList.add("hidden");
    renderHome();
  });
});

els.learnBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const pool = byTab(tab);
  if (!pool.length) return;
  const options = uniqueCounts(pool.length);
  els.countMenu.innerHTML = `
    <p>Сколько слов взять в занятие?</p>
    <div class="count-options">
      ${options.map((n) => `<button type="button" data-count="${n}">${n}</button>`).join("")}
    </div>`;
  els.countMenu.classList.toggle("hidden");
});

els.countMenu.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-count]");
  if (!btn) return;
  startSession(Number(btn.dataset.count));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".learn-wrap")) {
    els.countMenu.classList.add("hidden");
  }
});

function uniqueCounts(max) {
  const preset = [1, 3, 5, 7, 10, 15, 20];
  const set = new Set(preset.filter((n) => n < max));
  set.add(max);
  return [...set].sort((a, b) => a - b);
}

function startSession(count) {
  const pool = shuffle(byTab(tab));
  const selected = pool.slice(0, count);
  session = {
    mode: tab,
    items: selected,
    task: 1,
    index: 0,
  };
  els.countMenu.classList.add("hidden");
  els.home.classList.add("hidden");
  els.study.classList.remove("hidden");
  renderTask();
}

els.exitStudy.addEventListener("click", leaveStudy);

function leaveStudy() {
  session = null;
  els.study.classList.add("hidden");
  els.home.classList.remove("hidden");
  renderHome();
}

function renderTask() {
  const { task, items, index } = session;
  const remaining = items.length - index;
  els.remain.textContent = `Осталось: ${remaining}`;
  els.taskTitle.textContent = `Задание ${task}`;

  if (task === 1) renderTask1();
  else if (task === 2) renderTask2();
  else if (task === 3) renderTask3();
  else if (task === 4) renderTask4();
}

function nextInTask() {
  session.index += 1;
  if (session.index >= session.items.length) {
    session.task += 1;
    session.index = 0;
    if (session.task === 3) {
      session.matchQueue = chunk(shuffle(session.items), Math.min(6, session.items.length));
      session.matchBatch = 0;
    }
    if (session.task > 4) {
      finishSession();
      return;
    }
  }
  renderTask();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function renderTask1() {
  const word = session.items[session.index];
  let revealed = false;
  els.taskRoot.innerHTML = `
    <div class="center-card">
      <p class="prompt">Нажмите на слово, чтобы увидеть перевод</p>
      <p id="flip-word" class="big-word">${escapeHtml(word.term)}</p>
      <div class="actions">
        <button id="next-1" class="btn primary" type="button" disabled>Дальше</button>
      </div>
    </div>`;
  const flip = document.getElementById("flip-word");
  const next = document.getElementById("next-1");
  flip.addEventListener("click", () => {
    revealed = !revealed;
    flip.textContent = revealed ? word.translation : word.term;
    flip.classList.toggle("revealed", revealed);
    next.disabled = false;
  });
  next.addEventListener("click", nextInTask);
}

function renderTask2() {
  const word = session.items[session.index];
  const options = buildOptions(word);
  els.taskRoot.innerHTML = `
    <div class="center-card">
      <p class="prompt">Выберите правильный перевод</p>
      <p class="big-word">${escapeHtml(word.term)}</p>
      <div class="options">
        ${options
          .map(
            (opt, i) =>
              `<button class="option" data-i="${i}" type="button">${escapeHtml(opt)}</button>`
          )
          .join("")}
      </div>
      <p id="feedback" class="feedback"></p>
    </div>`;
  els.taskRoot.querySelectorAll(".option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = options[Number(btn.dataset.i)];
      const feedback = document.getElementById("feedback");
      if (chosen === word.translation) {
        btn.classList.add("good");
        feedback.className = "feedback ok";
        feedback.textContent = "Верно";
        els.taskRoot.querySelectorAll(".option").forEach((b) => (b.disabled = true));
        setTimeout(nextInTask, 450);
      } else {
        btn.classList.add("wrong");
        feedback.className = "feedback bad";
        feedback.textContent = "Неверно, попробуйте ещё";
      }
    });
  });
}

function buildOptions(correct) {
  const others = session.items
    .filter((w) => w.id !== correct.id)
    .map((w) => w.translation);
  const uniqueOthers = [...new Set(others)].filter((t) => t !== correct.translation);
  const picks = shuffle(uniqueOthers).slice(0, 2);
  return shuffle([correct.translation, ...picks]);
}

function renderTask3() {
  if (!session.matchQueue) {
    session.matchQueue = chunk(shuffle(session.items), Math.min(6, session.items.length));
    session.matchBatch = 0;
  }
  if (session.matchBatch == null) session.matchBatch = 0;
  const batch = session.matchQueue[session.matchBatch] || session.matchQueue[0];
  const left = shuffle(batch);
  const right = shuffle(batch);
  let selectedLeft = null;
  const matched = new Set();
  const remainingPairs = () => batch.length - matched.size;

  els.remain.textContent = `Осталось: ${remainingPairs()}`;
  els.taskRoot.innerHTML = `
    <p class="prompt">Соедините слово с переводом</p>
    <div class="match-board">
      <div class="match-col" id="left-col">
        ${left
          .map((w) => `<button class="match-item" data-side="left" data-id="${w.id}" type="button">${escapeHtml(w.term)}</button>`)
          .join("")}
      </div>
      <div class="match-col" id="right-col">
        ${right
          .map(
            (w) =>
              `<button class="match-item" data-side="right" data-id="${w.id}" type="button">${escapeHtml(w.translation)}</button>`
          )
          .join("")}
      </div>
    </div>
    <p id="feedback" class="feedback"></p>`;

  function clearSelection() {
    els.taskRoot.querySelectorAll(".match-item.selected").forEach((el) => el.classList.remove("selected"));
    selectedLeft = null;
  }

  els.taskRoot.querySelectorAll(".match-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("correct")) return;
      const id = btn.dataset.id;
      const side = btn.dataset.side;
      const feedback = document.getElementById("feedback");
      if (side === "left") {
        clearSelection();
        selectedLeft = id;
        btn.classList.add("selected");
        return;
      }
      if (!selectedLeft) {
        feedback.className = "feedback bad";
        feedback.textContent = "Сначала выберите слово слева";
        return;
      }
      if (selectedLeft === id) {
        matched.add(id);
        els.taskRoot.querySelectorAll(`[data-id="${id}"]`).forEach((el) => {
          el.classList.add("correct");
          el.classList.remove("selected");
        });
        selectedLeft = null;
        feedback.className = "feedback ok";
        feedback.textContent = "Пара собрана";
        els.remain.textContent = `Осталось: ${remainingPairs()}`;
        if (matched.size === batch.length) {
          session.matchBatch += 1;
          if (session.matchBatch >= session.matchQueue.length) {
            session.task = 4;
            session.index = 0;
            setTimeout(renderTask, 450);
          } else {
            setTimeout(renderTask3, 450);
          }
        }
      } else {
        btn.classList.add("wrong");
        feedback.className = "feedback bad";
        feedback.textContent = "Это не та пара";
        setTimeout(() => btn.classList.remove("wrong"), 400);
      }
    });
  });
}

function renderTask4() {
  const word = session.items[session.index];
  const letters = scramble(word.term);
  const used = new Array(letters.length).fill(false);
  const built = [];

  els.taskRoot.innerHTML = `
    <div class="center-card">
      <p class="prompt">Составьте слово по переводу</p>
      <p class="big-word">${escapeHtml(word.translation)}</p>
      <div id="build" class="build"></div>
      <div id="letters" class="letters">
        ${letters
          .map(
            (ch, i) =>
              `<button class="letter" data-i="${i}" type="button">${escapeHtml(ch === " " ? "␣" : ch)}</button>`
          )
          .join("")}
      </div>
      <div class="actions">
        <button id="undo" class="btn ghost" type="button">Стереть</button>
        <button id="check" class="btn primary" type="button">Проверить</button>
      </div>
      <p id="feedback" class="feedback"></p>
    </div>`;

  const buildBox = document.getElementById("build");
  const feedback = document.getElementById("feedback");

  function paintBuild() {
    buildBox.innerHTML = built
      .map(
        (item) =>
          `<button class="letter used" type="button">${escapeHtml(item.ch === " " ? "␣" : item.ch)}</button>`
      )
      .join("");
  }

  els.taskRoot.querySelectorAll("#letters .letter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      if (used[i]) return;
      used[i] = true;
      btn.classList.add("used");
      built.push({ i, ch: letters[i] });
      paintBuild();
    });
  });

  document.getElementById("undo").addEventListener("click", () => {
    const last = built.pop();
    if (!last) return;
    used[last.i] = false;
    els.taskRoot.querySelector(`#letters [data-i="${last.i}"]`).classList.remove("used");
    paintBuild();
    feedback.textContent = "";
  });

  document.getElementById("check").addEventListener("click", () => {
    const value = built.map((item) => item.ch).join("");
    if (normalize(value) === normalize(word.term)) {
      feedback.className = "feedback ok";
      feedback.textContent = "Верно";
      setTimeout(nextInTask, 450);
    } else {
      feedback.className = "feedback bad";
      feedback.textContent = "Пока не совпадает, попробуйте ещё";
    }
  });
}

function scramble(term) {
  const chars = [...term];
  if (chars.length < 2) return chars;
  let mixed = shuffle(chars);
  let guard = 0;
  while (mixed.join("") === term && guard < 20) {
    mixed = shuffle(chars);
    guard += 1;
  }
  return mixed;
}

function normalize(value) {
  return value.replaceAll("␣", " ").trim();
}

async function finishSession() {
  if (session.mode === "unlearned") {
    const ids = new Set(session.items.map((w) => w.id));
    words = words.map((w) => (ids.has(w.id) ? { ...w, learned: true } : w));
    await saveWords();
  }
  els.remain.textContent = "Осталось: 0";
  els.taskTitle.textContent = "Готово";
  els.taskRoot.innerHTML = `
    <div class="center-card done-card">
      <h2>${session.mode === "learned" ? "Повтор завершён" : "Слова выучены"}</h2>
      <p class="lead">${
        session.mode === "learned"
          ? "Эти слова остаются во вкладке выученных."
          : "Они перенесены во вкладку «Выученные». Их можно повторить позже."
      }</p>
      <div class="actions">
        <button id="back-home" class="btn primary" type="button">К списку</button>
      </div>
    </div>`;
  document.getElementById("back-home").addEventListener("click", () => {
    tab = session.mode === "unlearned" ? "learned" : "learned";
    els.tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === "learned"));
    leaveStudy();
  });
}

loadWords().then(renderHome);
