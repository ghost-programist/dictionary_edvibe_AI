(function () {
  const STORAGE_KEY = "edvibe_words_v1";

  /** @typedef {{ id: string, word: string, translation: string, langPair: string, learned?: boolean }} WordEntry */

  /** @returns {WordEntry[]} */
  function loadWords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.map((w) => ({
        ...w,
        learned: w.learned === true,
      }));
    } catch {
      return [];
    }
  }

  /** @param {WordEntry} w */
  function isLearned(w) {
    return w.learned === true;
  }

  /** @param {WordEntry[]} words */
  function saveWords(words) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const wordListEl = document.getElementById("wordList");
  const totalLabelEl = document.getElementById("totalLabel");
  const addForm = document.getElementById("addForm");
  const wordInput = document.getElementById("wordInput");
  const translationInput = document.getElementById("translationInput");
  const langPairSelect = document.getElementById("langPair");
  const selectAllEl = document.getElementById("selectAll");
  const btnRepetition = document.getElementById("btnRepetition");
  const mainApp = document.getElementById("mainApp");
  const selectionBar = document.getElementById("selectionBar");
  const btnDeleteSelected = document.getElementById("btnDeleteSelected");
  const selectionBarLabel = document.getElementById("selectionBarLabel");

  /** @type {WordEntry[]} */
  let words = loadWords();

  /** @type {'learn' | 'learned'} */
  let currentTab = "learn";

  /** @type {Set<string>} */
  const selected = new Set();

  /** @type {WordEntry[]} */
  let lessonPool = [];

  /** @type {WordEntry[]} */
  let lessonWords = [];

  let lessonCount = 5;
  let s1Idx = 0;
  let s2Idx = 0;
  let s4Target = "";
  /** @type {string[]} */
  let s4SlotsArr = [];
  /** @type {string[]} */
  let s4BankArr = [];
  let s4StrikesLeft = 3;

  /** @type {Set<number>} */
  let s3MatchedLeft = new Set();

  let s3LeftPick = /** @type {number | null} */ (null);

  /** С какой вкладки начали урок (для отметки «выучено» только с «К изучению») */
  let lessonSourceTab = /** @type {'learn' | 'learned'} */ ("learn");

  /** Полный урок — 4 этапа (вкладка «К изучению»); повторение — 2 этапа (выученные слова) */
  let lessonMaxStep = 4;

  const lessonOverlay = document.getElementById("lessonOverlay");
  const lessonTitle = document.getElementById("lessonTitle");
  const lessonModesText = document.getElementById("lessonModesText");
  const lessonSetupCount = document.getElementById("lessonSetupCount");
  const lessonCountValue = document.getElementById("lessonCountValue");
  const lessonCountMinus = document.getElementById("lessonCountMinus");
  const lessonCountPlus = document.getElementById("lessonCountPlus");
  const lessonStartBtn = document.getElementById("lessonStartBtn");
  const lessonClose = document.getElementById("lessonClose");

  const lessonStep1 = document.getElementById("lessonStep1");
  const lessonStep2 = document.getElementById("lessonStep2");
  const lessonStep3 = document.getElementById("lessonStep3");
  const lessonStep4 = document.getElementById("lessonStep4");
  const lessonSetup = document.getElementById("lessonSetup");

  const s1Word = document.getElementById("s1Word");
  const s1Trans = document.getElementById("s1Trans");
  const s1RevealBar = document.getElementById("s1RevealBar");
  const s1Speak = document.getElementById("s1Speak");
  const s1Back = document.getElementById("s1Back");
  const s1Next = document.getElementById("s1Next");
  const dots1 = document.getElementById("dots1");
  const badge1 = document.getElementById("badge1");
  const badge2 = document.getElementById("badge2");
  const badge3 = document.getElementById("badge3");
  const badge4 = document.getElementById("badge4");
  const lessonStep1Desc = document.getElementById("lessonStep1Desc");
  const lessonStep2Desc = document.getElementById("lessonStep2Desc");

  const s2Prompt = document.getElementById("s2Prompt");
  const s2Options = document.getElementById("s2Options");
  const dots2 = document.getElementById("dots2");

  const s3Grid = document.getElementById("s3Grid");
  const s3Hint = document.getElementById("s3Hint");
  const dots3 = document.getElementById("dots3");

  const s4Prompt = document.getElementById("s4Prompt");
  const s4Slots = document.getElementById("s4Slots");
  const s4Bank = document.getElementById("s4Bank");
  const s4Strikes = document.getElementById("s4Strikes");
  const s4Clear = document.getElementById("s4Clear");
  const s4Check = document.getElementById("s4Check");
  const dots4 = document.getElementById("dots4");

  function visibleWords() {
    return words.filter((w) => (currentTab === "learned" ? isLearned(w) : !isLearned(w)));
  }

  function updateTotal() {
    const list = visibleWords();
    totalLabelEl.textContent = "Всего слов " + list.length;
    selectAllEl.disabled = list.length === 0;
  }

  function syncSelectAll() {
    const list = visibleWords();
    if (list.length === 0) {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = false;
      return;
    }
    const inView = list.filter((w) => selected.has(w.id)).length;
    selectAllEl.checked = inView === list.length;
    selectAllEl.indeterminate = inView > 0 && inView < list.length;
  }

  function updateSelectionBar() {
    const n = selected.size;
    if (!selectionBar || !selectionBarLabel) return;
    if (n === 0) {
      selectionBar.hidden = true;
      document.body.classList.remove("has-selection-bar");
      return;
    }
    selectionBar.hidden = false;
    document.body.classList.add("has-selection-bar");
    selectionBarLabel.textContent = "Удалить выбранные (" + n + ")";
  }

  function speak(text, langHint) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (langHint) {
      const map = {
        "ru-en": "ru-RU",
        "en-ru": "en-US",
        "pl-en": "pl-PL",
        "pl-ru": "pl-PL",
      };
      u.lang = map[langHint] || "";
    }
    window.speechSynthesis.speak(u);
  }

  function render() {
    wordListEl.innerHTML = "";
    if (words.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "Добавьте первое слово и перевод выше.";
      wordListEl.appendChild(li);
      selected.clear();
      updateTotal();
      syncSelectAll();
      updateSelectionBar();
      return;
    }

    const list = visibleWords();
    if (list.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent =
        currentTab === "learn"
          ? "Нет слов для изучения — все слова уже пройдены в уроке. Переключитесь на «Выученные слова»."
          : "Пока нет выученных слов — отметьте слова на вкладке «К изучению», пройдите урок до конца.";
      wordListEl.appendChild(li);
      selected.clear();
      updateTotal();
      syncSelectAll();
      updateSelectionBar();
      return;
    }

    list.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "word-item";
      li.dataset.id = entry.id;

      const btnSpeak = document.createElement("button");
      btnSpeak.type = "button";
      btnSpeak.className = "word-item__speak";
      btnSpeak.setAttribute("aria-label", "Прослушать");
      btnSpeak.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      btnSpeak.addEventListener("click", () => speak(entry.word, entry.langPair));

      const body = document.createElement("div");
      body.className = "word-item__body";
      const w = document.createElement("div");
      w.className = "word-item__word";
      w.textContent = entry.word;
      const t = document.createElement("div");
      t.className = "word-item__translation";
      t.textContent = entry.translation;
      body.appendChild(w);
      body.appendChild(t);

      const wrap = document.createElement("label");
      wrap.className = "word-item__check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(entry.id);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(entry.id);
        else selected.delete(entry.id);
        syncSelectAll();
        updateSelectionBar();
      });
      wrap.appendChild(cb);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "word-item__delete";
      del.setAttribute("aria-label", "Удалить");
      del.textContent = "×";
      del.addEventListener("click", () => {
        words = words.filter((x) => x.id !== entry.id);
        selected.delete(entry.id);
        saveWords(words);
        render();
      });

      li.appendChild(btnSpeak);
      li.appendChild(body);
      li.appendChild(wrap);
      li.appendChild(del);
      wordListEl.appendChild(li);
    });

    updateTotal();
    syncSelectAll();
    updateSelectionBar();
  }

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const word = wordInput.value.trim();
    const translation = translationInput.value.trim();
    if (!word || !translation) return;

    words.unshift({
      id: uid(),
      word,
      translation,
      langPair: langPairSelect.value,
      learned: false,
    });
    saveWords(words);
    wordInput.value = "";
    translationInput.value = "";
    wordInput.focus();
    activateTab("learn");
  });

  selectAllEl.addEventListener("change", () => {
    const list = visibleWords();
    if (list.length === 0) return;
    if (selectAllEl.checked) {
      list.forEach((w) => selected.add(w.id));
    } else {
      selected.clear();
    }
    render();
  });

  function getSelectedEntries() {
    return visibleWords().filter((w) => selected.has(w.id));
  }

  function markLessonWordsLearned() {
    const ids = new Set(lessonWords.map((w) => w.id));
    words = words.map((w) => (ids.has(w.id) ? { ...w, learned: true } : w));
    saveWords(words);
  }

  function showLessonView(which) {
    lessonSetup.hidden = which !== "setup";
    lessonStep1.hidden = which !== "s1";
    lessonStep2.hidden = which !== "s2";
    lessonStep3.hidden = which !== "s3";
    lessonStep4.hidden = which !== "s4";
  }

  function openLessonSetup() {
    const pool = visibleWords().slice();
    if (pool.length === 0) {
      alert(
        currentTab === "learn"
          ? "На этой вкладке пока нет слов — добавьте слова выше."
          : "На этой вкладке нет выученных слов — сначала пройдите урок на вкладке «К изучению»."
      );
      return;
    }
    lessonSourceTab = currentTab;
    lessonMaxStep = lessonSourceTab === "learned" ? 2 : 4;
    lessonPool = pool;
    if (lessonSetupCount) {
      lessonSetupCount.textContent =
        currentTab === "learned"
          ? "Слов для повторения: " + pool.length
          : "Слов для изучения: " + pool.length;
    }
    if (lessonTitle) {
      lessonTitle.textContent = lessonSourceTab === "learned" ? "Повторение" : "Урок новых слов";
    }
    if (lessonModesText) {
      lessonModesText.textContent = lessonMaxStep === 2 ? "2 этапа" : "4 этапа";
    }
    if (lessonStartBtn) {
      lessonStartBtn.textContent = lessonSourceTab === "learned" ? "Начать повторение" : "Начать урок";
    }
    lessonCount = Math.min(5, pool.length);
    updateLessonCounterButtons();
    showLessonView("setup");
    lessonOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function finishLesson() {
    lessonOverlay.hidden = true;
    document.body.style.overflow = "";
    if (mainApp) mainApp.scrollIntoView({ behavior: "smooth", block: "start" });
    render();
  }

  function completeLessonSuccessfully() {
    if (lessonSourceTab === "learn") {
      markLessonWordsLearned();
    }
    finishLesson();
  }

  function exitLesson() {
    finishLesson();
  }

  lessonClose.addEventListener("click", () => {
    if (confirm("Завершить тренировку и вернуться к списку?")) exitLesson();
  });

  lessonCountMinus.addEventListener("click", () => {
    if (lessonCountMinus.disabled) return;
    lessonCount = Math.max(1, lessonCount - 1);
    lessonCount = Math.min(lessonCount, lessonPool.length);
    updateLessonCounterButtons();
  });

  lessonCountPlus.addEventListener("click", () => {
    if (lessonCountPlus.disabled) return;
    lessonCount = Math.min(lessonPool.length, lessonCount + 1);
    updateLessonCounterButtons();
  });

  function buildDots(container, activeIndex, total) {
    container.innerHTML = "";
    const n = Math.min(total, 5);
    for (let i = 0; i < n; i++) {
      const d = document.createElement("span");
      if (i === Math.min(activeIndex, n - 1)) d.classList.add("is-active");
      container.appendChild(d);
    }
  }

  function startLesson() {
    lessonWords = shuffle(lessonPool).slice(0, lessonCount);
    s1Idx = 0;
    lessonMaxStep = lessonSourceTab === "learned" ? 2 : 4;
    renderStep1();
    showLessonView("s1");
  }

  lessonStartBtn.addEventListener("click", startLesson);

  function renderStep1() {
    const w = lessonWords[s1Idx];
    if (!w) return;
    s1Word.textContent = w.word;
    s1Trans.textContent = w.translation;
    s1Trans.hidden = true;
    s1RevealBar.hidden = false;
    s1RevealBar.textContent = "Нажмите, чтобы увидеть перевод ☝️";
    if (badge1) badge1.textContent = "ШАГ 1 ИЗ " + lessonMaxStep;
    if (lessonStep1Desc) {
      lessonStep1Desc.textContent =
        lessonSourceTab === "learned"
          ? "Повторение: карточки со словом и переводом"
          : "Просмотр изучаемых слов";
    }
    buildDots(dots1, s1Idx, lessonWords.length);
    if (s1Back) s1Back.disabled = s1Idx === 0;
  }

  s1RevealBar.addEventListener("click", () => {
    s1Trans.hidden = false;
    s1RevealBar.hidden = true;
  });

  s1Speak.addEventListener("click", () => {
    const w = lessonWords[s1Idx];
    if (w) speak(w.word, w.langPair);
  });

  s1Back.addEventListener("click", () => {
    if (s1Idx > 0) {
      s1Idx--;
      renderStep1();
    }
  });

  s1Next.addEventListener("click", () => {
    if (s1Idx < lessonWords.length - 1) {
      s1Idx++;
      renderStep1();
    } else {
      s2Idx = 0;
      renderStep2();
      showLessonView("s2");
    }
  });

  function renderStep2() {
    const w = lessonWords[s2Idx];
    if (!w) return;
    s2Prompt.textContent = w.word;
    if (badge2) badge2.textContent = "ШАГ 2 ИЗ " + lessonMaxStep;
    if (lessonStep2Desc) {
      lessonStep2Desc.textContent =
        lessonSourceTab === "learned"
          ? "Повторение: выберите верный перевод"
          : "Выбор правильного перевода";
    }
    buildDots(dots2, s2Idx, lessonWords.length);

    const allTrans = lessonWords.map((x) => x.translation);
    const wrongPool = shuffle(
      allTrans.filter((t) => t !== w.translation)
    );
    const distractors = wrongPool.slice(0, 2);
    while (distractors.length < 2) {
      distractors.push("—");
    }
    const choices = shuffle([w.translation, distractors[0], distractors[1]]);

    s2Options.innerHTML = "";
    choices.forEach((label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lesson-mc-opt";
      b.textContent = label;
      b.addEventListener("click", () => {
        if (label === w.translation) {
          b.classList.add("is-correct");
          setTimeout(() => {
            if (s2Idx < lessonWords.length - 1) {
              s2Idx++;
              renderStep2();
            } else if (lessonMaxStep === 2) {
              finishLesson();
            } else {
              initStep3();
              showLessonView("s3");
            }
          }, 280);
        } else {
          b.classList.add("is-wrong");
          setTimeout(() => b.classList.remove("is-wrong"), 500);
        }
      });
      s2Options.appendChild(b);
    });
  }

  /** @type {WordEntry[]} */
  let s3Pairs = [];

  function initStep3() {
    const n = Math.min(5, lessonWords.length);
    s3Pairs = shuffle(lessonWords.slice(0, n));
    s3MatchedLeft = new Set();
    s3LeftPick = null;
    if (badge3) badge3.textContent = "ШАГ 3 ИЗ " + lessonMaxStep;
    buildDots(dots3, 0, 1);
    s3Hint.textContent = "Сначала слово слева, затем перевод справа.";
    renderStep3();
  }

  function renderStep3() {
    const colL = document.createElement("div");
    colL.className = "lesson-match-col";
    const colR = document.createElement("div");
    colR.className = "lesson-match-col";

    s3Pairs.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.word;
      b.dataset.idx = String(i);
      if (s3MatchedLeft.has(i)) {
        b.classList.add("is-matched");
        b.disabled = true;
      } else {
        if (s3LeftPick === i) b.classList.add("is-picked");
        b.addEventListener("click", () => onS3Left(i));
      }
      colL.appendChild(b);
    });

    const right = shuffle(
      s3Pairs.map((x, i) => ({ text: x.translation, i }))
    );

    right.forEach((item) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.text;
      b.dataset.idx = String(item.i);
      if (s3MatchedLeft.has(item.i)) {
        b.classList.add("is-matched");
        b.disabled = true;
      } else {
        b.addEventListener("click", () => onS3Right(item.i));
      }
      colR.appendChild(b);
    });

    s3Grid.innerHTML = "";
    s3Grid.appendChild(colL);
    s3Grid.appendChild(colR);
  }

  function onS3Left(i) {
    if (s3MatchedLeft.has(i)) return;
    s3LeftPick = i;
    renderStep3();
  }

  function onS3Right(i) {
    if (s3MatchedLeft.has(i)) return;
    if (s3LeftPick === null) return;
    if (s3LeftPick === i) {
      s3MatchedLeft.add(i);
      s3LeftPick = null;
      if (s3MatchedLeft.size === s3Pairs.length) {
        setTimeout(() => {
          initStep4();
          showLessonView("s4");
        }, 200);
      } else {
        renderStep3();
      }
    } else {
      s3LeftPick = null;
      renderStep3();
    }
  }

  function pickWordForLetters(list) {
    if (!list.length) return null;
    const withLen = list.map((w) => ({
      w,
      plain: w.word.replace(/\s/g, ""),
    }));
    const nonempty = withLen.filter((x) => x.plain.length > 0);
    if (nonempty.length === 0) return list[0];
    const ok = nonempty.find((x) => x.plain.length >= 3);
    return (ok || nonempty[0]).w;
  }

  function initStep4() {
    let entry = pickWordForLetters(lessonWords);
    if (!entry) {
      completeLessonSuccessfully();
      return;
    }
    s4Target = entry.word.replace(/\s/g, "");
    if (!s4Target.length) {
      for (const w of lessonWords) {
        const p = w.word.replace(/\s/g, "");
        if (p.length) {
          entry = w;
          s4Target = p;
          break;
        }
      }
    }
    if (!s4Target.length) {
      completeLessonSuccessfully();
      return;
    }
    s4Prompt.textContent = entry.translation;
    if (badge4) badge4.textContent = "ШАГ 4 ИЗ " + lessonMaxStep;
    s4StrikesLeft = 3;
    if (s4Strikes) s4Strikes.textContent = "× × ×";
    s4SlotsArr = new Array(s4Target.length).fill("");
    s4BankArr = shuffle(s4Target.split(""));
    buildDots(dots4, 3, 4);
    renderStep4();
  }

  function renderStep4() {
    s4Slots.innerHTML = "";
    s4Target.split("").forEach((ch, idx) => {
      const slot = document.createElement("div");
      slot.className = "lesson-slot" + (s4SlotsArr[idx] ? " is-filled" : "");
      slot.textContent = s4SlotsArr[idx] || "";
      slot.addEventListener("click", () => {
        if (!s4SlotsArr[idx]) return;
        const c = s4SlotsArr[idx];
        s4SlotsArr[idx] = "";
        s4BankArr.push(c);
        renderStep4();
      });
      s4Slots.appendChild(slot);
    });

    s4Bank.innerHTML = "";
    s4BankArr.forEach((ch, bi) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ch;
      b.addEventListener("click", () => {
        const empty = s4SlotsArr.findIndex((x) => x === "");
        if (empty === -1) return;
        s4SlotsArr[empty] = ch;
        s4BankArr.splice(bi, 1);
        renderStep4();
      });
      s4Bank.appendChild(b);
    });
  }

  s4Clear.addEventListener("click", () => {
    s4BankArr = shuffle(s4Target.split(""));
    s4SlotsArr = new Array(s4Target.length).fill("");
    renderStep4();
  });

  s4Check.addEventListener("click", () => {
    const got = s4SlotsArr.join("");
    if (got.toLowerCase() === s4Target.toLowerCase()) {
      completeLessonSuccessfully();
    } else {
      s4StrikesLeft = Math.max(0, s4StrikesLeft - 1);
      if (s4Strikes) {
        s4Strikes.textContent = ["× × ×", "× ×", "×", ""][3 - s4StrikesLeft] || "";
      }
      if (s4StrikesLeft <= 0) {
        alert("Попробуйте ещё раз — очистите поля и составьте слово.");
        s4Clear.click();
        s4StrikesLeft = 3;
        if (s4Strikes) s4Strikes.textContent = "× × ×";
      }
    }
  });

  btnRepetition.addEventListener("click", openLessonSetup);

  btnDeleteSelected.addEventListener("click", () => {
    const n = selected.size;
    if (n === 0) return;
    const ok = confirm(
      "Удалить отмеченные слова (" + n + " шт.)? Это действие нельзя отменить."
    );
    if (!ok) return;
    const ids = new Set(selected);
    words = words.filter((w) => !ids.has(w.id));
    selected.clear();
    saveWords(words);
    render();
  });

  const tabLearn = document.getElementById("tab-learn");
  const tabLearned = document.getElementById("tab-learned");
  const panelWords = document.getElementById("panel-words");

  function activateTab(active) {
    currentTab = active === "learned" ? "learned" : "learn";
    const isLearn = currentTab === "learn";
    selected.clear();
    tabLearn.classList.toggle("tab--active", isLearn);
    tabLearned.classList.toggle("tab--active", !isLearn);
    tabLearn.setAttribute("aria-selected", String(isLearn));
    tabLearned.setAttribute("aria-selected", String(!isLearn));
    if (panelWords) {
      panelWords.setAttribute("aria-labelledby", isLearn ? "tab-learn" : "tab-learned");
    }
    if (btnRepetition) {
      btnRepetition.hidden = false;
    }
    render();
  }

  tabLearn.addEventListener("click", () => activateTab("learn"));
  tabLearned.addEventListener("click", () => activateTab("learned"));

  activateTab("learn");
})();
