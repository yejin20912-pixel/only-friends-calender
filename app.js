const PEOPLE_COUNT = 6;
const DEFAULT_NAMES = ["예원", "민경", "다원", "지은", "예린", "예진"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const roomId = ensureRoomId();
const STORAGE_KEY = `meeting-calendar-v6:${roomId}`;

const state = loadState();
let selectedPerson = 0;
let selectedMode = "available";
let inputMonth = parseMonthKey(state.inputMonth);
let resultMonth = parseMonthKey(state.resultMonth);
let selectedResultDateKey = "";
let activeScreen = state.activeScreen || "input";
let remoteSave = null;
let applyingRemote = false;
let remoteReady = false;
let remoteUrl = "";
let lastRemoteSnapshot = "";

const personList = document.querySelector("#personList");
const submitStatus = document.querySelector("#submitStatus");
const perfectCount = document.querySelector("#perfectCount");
const selectedPersonLabel = document.querySelector("#selectedPersonLabel");
const selectedPersonGuide = document.querySelector("#selectedPersonGuide");
const monthLabel = document.querySelector("#monthLabel");
const resultMonthLabel = document.querySelector("#resultMonthLabel");
const inputCalendar = document.querySelector("#inputCalendar");
const resultCalendar = document.querySelector("#resultCalendar");
const dateDetails = document.querySelector("#dateDetails");
const inputScreen = document.querySelector("#inputScreen");
const resultScreen = document.querySelector("#resultScreen");
const showInputButton = document.querySelector("#showInputButton");
const showResultButton = document.querySelector("#showResultButton");

bindEvents();
renderAll();
connectRemote();

function bindEvents() {
  document.querySelectorAll(".status-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode;
      document.querySelectorAll(".status-button").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });

  document.querySelector("#prevMonthButton").addEventListener("click", () => {
    inputMonth = shiftMonth(inputMonth, -1);
    state.inputMonth = toMonthKey(inputMonth);
    saveState();
    renderInputCalendar();
  });

  document.querySelector("#nextMonthButton").addEventListener("click", () => {
    inputMonth = shiftMonth(inputMonth, 1);
    state.inputMonth = toMonthKey(inputMonth);
    saveState();
    renderInputCalendar();
  });

  document.querySelector("#resultPrevMonthButton").addEventListener("click", () => {
    resultMonth = shiftMonth(resultMonth, -1);
    state.resultMonth = toMonthKey(resultMonth);
    saveState();
    renderResultCalendar();
  });

  document.querySelector("#resultNextMonthButton").addEventListener("click", () => {
    resultMonth = shiftMonth(resultMonth, 1);
    state.resultMonth = toMonthKey(resultMonth);
    saveState();
    renderResultCalendar();
  });

  document.querySelector("#submitButton").addEventListener("click", () => {
    state.submitted[selectedPerson] = true;
    saveState();
    renderPeople();
    renderSummary();
  });

  document.querySelector("#resetAllButton").addEventListener("click", () => {
    if (!confirm("모든 입력값과 제출 상태를 지울까요?")) return;
    Object.assign(state, defaultState());
    selectedPerson = 0;
    selectedResultDateKey = "";
    inputMonth = parseMonthKey(state.inputMonth);
    resultMonth = parseMonthKey(state.resultMonth);
    activeScreen = "input";
    saveState();
    renderAll();
  });

  document.querySelector("#copyButton").addEventListener("click", async () => {
    await copyText(buildSummaryText());
  });

  document.querySelector("#goToResultButton").addEventListener("click", () => {
    setScreen("result");
  });

  document.querySelector("#backToInputButton").addEventListener("click", () => {
    setScreen("input");
  });

  showInputButton.addEventListener("click", () => {
    setScreen("input");
  });

  showResultButton.addEventListener("click", () => {
    setScreen("result");
  });
}

function defaultState() {
  const now = new Date();
  const monthKey = toMonthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  return {
    people: [...DEFAULT_NAMES],
    availability: {},
    submitted: Array.from({ length: PEOPLE_COUNT }, () => false),
    inputMonth: monthKey,
    resultMonth: monthKey,
    activeScreen: "input",
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeState(saved);
  } catch {
    return defaultState();
  }
}

function normalizeState(saved) {
  const fallback = defaultState();
  return {
    ...fallback,
    ...saved,
    people: Array.from({ length: PEOPLE_COUNT }, (_, index) => saved.people?.[index] || DEFAULT_NAMES[index]),
    submitted: Array.from({ length: PEOPLE_COUNT }, (_, index) => Boolean(saved.submitted?.[index])),
    availability: saved.availability || {},
    activeScreen: saved.activeScreen === "result" ? "result" : "input",
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncRemote();
}

async function connectRemote() {
  if (!hasFirebaseConfig()) return;

  try {
    remoteUrl = `${window.firebaseConfig.databaseURL}/rooms/${roomId}.json`;

    remoteSave = async () => {
      if (applyingRemote) return;
      const snapshot = JSON.stringify(state);
      lastRemoteSnapshot = snapshot;
      await fetch(remoteUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: snapshot,
      });
    };

    await pullRemote(true);
    window.setInterval(() => {
      pullRemote(false).catch((error) => console.error(error));
    }, 1500);
  } catch (error) {
    console.error(error);
  }
}

async function pullRemote(isInitial) {
  if (!remoteUrl) return;

  const response = await fetch(remoteUrl, {
    method: "GET",
    cache: "no-store",
  });
  const remoteState = await response.json();

  if (!remoteState && !remoteReady) {
    remoteReady = true;
    await remoteSave();
    return;
  }

  if (!remoteState) return;

  const snapshot = JSON.stringify(remoteState);
  if (!isInitial && snapshot === lastRemoteSnapshot) return;

  lastRemoteSnapshot = snapshot;
  applyingRemote = true;
  Object.assign(state, normalizeState(remoteState));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  inputMonth = parseMonthKey(state.inputMonth);
  resultMonth = parseMonthKey(state.resultMonth);
  activeScreen = state.activeScreen;
  renderAll();
  applyingRemote = false;
  remoteReady = true;
}

function hasFirebaseConfig() {
  return Boolean(
    window.firebaseConfig &&
      window.firebaseConfig.apiKey &&
      window.firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE" &&
      window.firebaseConfig.databaseURL &&
      window.firebaseConfig.databaseURL !== "PASTE_YOUR_DATABASE_URL_HERE",
  );
}

function syncRemote() {
  if (!remoteSave || applyingRemote) return;
  remoteSave().catch((error) => console.error(error));
}

function ensureRoomId() {
  const url = new URL(window.location.href);
  const current = url.searchParams.get("room");
  if (current) return current;
  return "main";
}

function renderAll() {
  renderScreen();
  renderPeople();
  renderSummary();
  renderInputCalendar();
  renderResultCalendar();
  renderDateDetails();
}

function renderScreen() {
  const isInput = activeScreen === "input";
  inputScreen.classList.toggle("is-active", isInput);
  resultScreen.classList.toggle("is-active", !isInput);
  showInputButton.classList.toggle("is-active", isInput);
  showResultButton.classList.toggle("is-active", !isInput);
  showInputButton.setAttribute("aria-pressed", String(isInput));
  showResultButton.setAttribute("aria-pressed", String(!isInput));
}

function setScreen(screen) {
  activeScreen = screen;
  state.activeScreen = screen;
  saveState();
  renderScreen();
}

function renderPeople() {
  personList.innerHTML = "";

  state.people.forEach((name, index) => {
    const card = document.createElement("div");
    card.className = `person-card${selectedPerson === index ? " is-active" : ""}${state.submitted[index] ? " is-done" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "person-index";
    selectButton.textContent = String(index + 1);
    selectButton.setAttribute("aria-label", `${index + 1}번 친구 선택`);
    selectButton.addEventListener("click", () => {
      selectedPerson = index;
      renderPeople();
      renderInputCalendar();
    });

    const body = document.createElement("div");
    body.className = "person-body";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "person-name";
    input.value = name;
    input.placeholder = DEFAULT_NAMES[index];
    input.setAttribute("aria-label", `${index + 1}번 친구 이름`);
    input.addEventListener("focus", () => {
      selectedPerson = index;
      renderPeople();
      renderInputCalendar();
    });
    input.addEventListener("input", () => {
      state.people[index] = input.value.trim() || DEFAULT_NAMES[index];
      saveState();
      renderPeople();
      renderResultCalendar();
      renderDateDetails();
    });

    const badge = document.createElement("span");
    badge.className = `person-badge ${state.submitted[index] ? "done" : "pending"}`;
    badge.textContent = state.submitted[index] ? "제출 완료" : "작성 중";

    body.append(input, badge);
    card.append(selectButton, body);
    personList.append(card);
  });

  selectedPersonLabel.textContent = state.people[selectedPerson];
  selectedPersonGuide.textContent = "가능한 날짜를 선택해주세요";
}

function renderSummary() {
  submitStatus.textContent = `${state.submitted.filter(Boolean).length}/${PEOPLE_COUNT} 제출`;
  perfectCount.textContent = `${getMonthPerfectCount(resultMonth)}일`;
}

function renderInputCalendar() {
  inputCalendar.innerHTML = "";
  monthLabel.textContent = formatMonth(inputMonth);
  inputCalendar.append(createWeekdayRow());

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  getCalendarDates(inputMonth).forEach(({ date, isCurrentMonth }) => {
    const key = toDateKey(date);
    const status = getPersonStatus(key, selectedPerson);
    const day = document.createElement("button");
    day.type = "button";
    day.className = `day input-${status}${isCurrentMonth ? "" : " muted"}`;
    day.setAttribute("aria-label", `${formatFullDate(key)} ${statusLabel(status)}`);

    const number = document.createElement("strong");
    number.textContent = String(date.getDate());

    day.append(number);
    day.addEventListener("click", () => {
      togglePersonDate(key, status);
    });

    grid.append(day);
  });

  inputCalendar.append(grid);
}

function renderResultCalendar() {
  resultCalendar.innerHTML = "";
  resultMonthLabel.textContent = formatMonth(resultMonth);
  perfectCount.textContent = `${getMonthPerfectCount(resultMonth)}일`;
  resultCalendar.append(createWeekdayRow());

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  getCalendarDates(resultMonth).forEach(({ date, isCurrentMonth }) => {
    const key = toDateKey(date);
    const result = getDateResult(key);
    const day = document.createElement("button");
    day.type = "button";
    day.className = `day result-${result.className}${selectedResultDateKey === key ? " selected" : ""}${isCurrentMonth ? "" : " muted"}`;
    day.setAttribute("aria-label", `${formatFullDate(key)} ${result.countText}`);

    const number = document.createElement("strong");
    number.textContent = String(date.getDate());

    day.append(number);
    day.addEventListener("click", () => {
      selectedResultDateKey = key;
      renderResultCalendar();
      renderDateDetails();
    });

    grid.append(day);
  });

  resultCalendar.append(grid);
}

function renderDateDetails() {
  if (!selectedResultDateKey) {
    dateDetails.textContent = "결과 달력에서 날짜를 누르면 가능한 사람 이름이 표시됩니다.";
    return;
  }

  const availableNames = [];
  const maybeNames = [];
  const busyNames = [];

  state.people.forEach((name, index) => {
    const status = getPersonStatus(selectedResultDateKey, index);
    if (status === "available") availableNames.push(name);
    else if (status === "maybe") maybeNames.push(name);
    else busyNames.push(name);
  });

  dateDetails.innerHTML = `
    <strong>${formatFullDate(selectedResultDateKey)}</strong>
    <p>가능: ${availableNames.length ? availableNames.join(", ") : "없음"}</p>
    <p>애매: ${maybeNames.length ? maybeNames.join(", ") : "없음"}</p>
    <p>불가: ${busyNames.length ? busyNames.join(", ") : "없음"}</p>
  `;
}

function togglePersonDate(key, currentStatus) {
  const nextStatus = currentStatus === selectedMode ? "busy" : selectedMode;
  const values = { ...(state.availability[key] || {}) };
  values[selectedPerson] = nextStatus;
  state.availability[key] = values;
  state.submitted[selectedPerson] = false;
  saveState();
  renderInputCalendar();
  renderResultCalendar();
  renderPeople();
  renderSummary();
  renderDateDetails();
}

function createWeekdayRow() {
  const row = document.createElement("div");
  row.className = "weekday-row";
  WEEKDAYS.forEach((weekday) => {
    const cell = document.createElement("div");
    cell.className = "weekday";
    cell.textContent = weekday;
    row.append(cell);
  });
  return row;
}

function getCalendarDates(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const firstGridDate = new Date(firstDay);
  firstGridDate.setDate(firstGridDate.getDate() - firstGridDate.getDay());
  const lastGridDate = new Date(lastDay);
  lastGridDate.setDate(lastGridDate.getDate() + (6 - lastGridDate.getDay()));

  const dates = [];
  for (let cursor = new Date(firstGridDate); cursor <= lastGridDate; cursor.setDate(cursor.getDate() + 1)) {
    dates.push({
      date: new Date(cursor),
      isCurrentMonth: cursor.getMonth() === monthDate.getMonth(),
    });
  }
  return dates;
}

function getPersonStatus(dateKey, personIndex) {
  return state.availability[dateKey]?.[personIndex] || "busy";
}

function getDateResult(dateKey) {
  let available = 0;

  for (let index = 0; index < PEOPLE_COUNT; index += 1) {
    const status = getPersonStatus(dateKey, index);
    if (status === "available") available += 1;
  }

  if (available === PEOPLE_COUNT) {
    return { className: "perfect", countText: `${available}명 가능` };
  }

  if (available >= 3) {
    return { className: "partial", countText: `${available}명 가능` };
  }

  if (available >= 1) {
    return { className: "rare", countText: `${available}명 가능` };
  }

  return { className: "none", countText: "가능 0명" };
}

function getMonthPerfectCount(monthDate) {
  return getCalendarDates(monthDate)
    .filter(({ isCurrentMonth }) => isCurrentMonth)
    .filter(({ date }) => getDateResult(toDateKey(date)).className === "perfect").length;
}

function buildSummaryText() {
  return getCalendarDates(resultMonth)
    .filter(({ isCurrentMonth }) => isCurrentMonth)
    .map(({ date }) => {
      const key = toDateKey(date);
      const available = [];
      const maybe = [];
      const busy = [];

      state.people.forEach((name, index) => {
        const status = getPersonStatus(key, index);
        if (status === "available") available.push(name);
        else if (status === "maybe") maybe.push(name);
        else busy.push(name);
      });

      return `${formatFullDate(key)} - 가능 ${available.length}명(${available.join(", ") || "없음"}), 애매 ${maybe.length}명(${maybe.join(", ") || "없음"}), 불가 ${busy.length}명`;
    })
    .join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("결과를 복사했습니다.");
  } catch {
    prompt("아래 내용을 복사하세요.", text);
  }
}

function statusLabel(status) {
  return {
    available: "가능",
    maybe: "애매",
    busy: "불가",
  }[status];
}

function shiftMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function parseMonthKey(value) {
  return new Date(`${value}T00:00:00`);
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatFullDate(key) {
  const date = new Date(`${key}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
