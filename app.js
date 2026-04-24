import { firebaseConfig } from "./firebase-config.js";

const PEOPLE_COUNT = 6;
const TIMES = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
const roomId = ensureRoomId();
const STORAGE_KEY = `meeting-grid-v2:${roomId}`;
const state = loadState();
let selectedPerson = 0;
let selectedMode = "available";
let remoteSave = null;
let remoteReady = false;
let applyingRemote = false;

const personList = document.querySelector("#personList");
const schedule = document.querySelector("#schedule");
const startDate = document.querySelector("#startDate");
const dayCount = document.querySelector("#dayCount");
const bestSlot = document.querySelector("#bestSlot");
const bestCount = document.querySelector("#bestCount");
const recommendations = document.querySelector("#recommendations");
const syncStatus = document.querySelector("#syncStatus");

startDate.value = state.startDate;
dayCount.value = String(state.dayCount);

renderAll();
connectRemote();

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    document.querySelectorAll(".mode").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

startDate.addEventListener("change", () => {
  state.startDate = startDate.value;
  saveAndRender();
});

dayCount.addEventListener("change", () => {
  state.dayCount = Number(dayCount.value);
  saveAndRender();
});

document.querySelector("#resetButton").addEventListener("click", () => {
  if (!confirm("이 약속방의 일정을 모두 지울까요?")) return;
  Object.assign(state, defaultState());
  startDate.value = state.startDate;
  dayCount.value = String(state.dayCount);
  selectedPerson = 0;
  saveAndRender();
});

document.querySelector("#copyButton").addEventListener("click", async () => {
  copyText(buildShareText(), "추천 시간이 복사됐습니다.");
});

document.querySelector("#shareButton").addEventListener("click", async () => {
  copyText(window.location.href, "약속방 링크가 복사됐습니다.");
});

function defaultState() {
  return {
    startDate: toDateInputValue(new Date()),
    dayCount: 7,
    people: Array.from({ length: PEOPLE_COUNT }, (_, index) => `친구 ${index + 1}`),
    availability: {},
    updatedAt: Date.now(),
  };
}

function loadState() {
  const fallback = defaultState();
  try {
    return normalizeState({ ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) });
  } catch {
    return fallback;
  }
}

function normalizeState(nextState) {
  return {
    ...defaultState(),
    ...nextState,
    people: Array.from({ length: PEOPLE_COUNT }, (_, index) => nextState.people?.[index] || `친구 ${index + 1}`),
    availability: nextState.availability || {},
  };
}

function ensureRoomId() {
  const url = new URL(window.location.href);
  const current = url.searchParams.get("room");
  if (current) return current;

  const generated = Math.random().toString(36).slice(2, 9);
  url.searchParams.set("room", generated);
  window.history.replaceState(null, "", url.toString());
  return generated;
}

async function connectRemote() {
  if (!hasFirebaseConfig()) {
    syncStatus.textContent = "로컬 모드";
    return;
  }

  syncStatus.textContent = "연결 중";

  try {
    const [{ initializeApp }, { getDatabase, ref, onValue, set }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js"),
    ]);

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const roomRef = ref(db, `rooms/${roomId}`);

    remoteSave = async () => {
      if (applyingRemote) return;
      state.updatedAt = Date.now();
      await set(roomRef, structuredClone(state));
    };

    onValue(roomRef, async (snapshot) => {
      const remoteState = snapshot.val();
      if (!remoteState && !remoteReady) {
        remoteReady = true;
        await remoteSave();
        syncStatus.textContent = "공유 중";
        return;
      }

      if (remoteState) {
        applyingRemote = true;
        Object.assign(state, normalizeState(remoteState));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        startDate.value = state.startDate;
        dayCount.value = String(state.dayCount);
        renderAll();
        applyingRemote = false;
      }

      remoteReady = true;
      syncStatus.textContent = "공유 중";
    });
  } catch (error) {
    console.error(error);
    syncStatus.textContent = "로컬 모드";
  }
}

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig?.apiKey &&
      firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE" &&
      firebaseConfig.databaseURL &&
      firebaseConfig.databaseURL !== "PASTE_YOUR_DATABASE_URL_HERE",
  );
}

function saveAndRender() {
  saveState();
  renderAll();
}

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (remoteSave) {
    try {
      syncStatus.textContent = "저장 중";
      await remoteSave();
      syncStatus.textContent = "공유 중";
    } catch (error) {
      console.error(error);
      syncStatus.textContent = "저장 실패";
    }
  }
}

function renderAll() {
  renderPeople();
  renderSchedule();
  renderSummary();
}

function getDates() {
  const base = new Date(`${state.startDate}T00:00:00`);
  return Array.from({ length: state.dayCount }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    return date;
  });
}

function keyFor(date, time) {
  return `${toDateInputValue(date)}_${time}`;
}

function renderPeople() {
  personList.innerHTML = "";
  state.people.forEach((name, index) => {
    const item = document.createElement("div");
    item.className = `person ${index === selectedPerson ? "active" : ""}`;

    const avatar = document.createElement("button");
    avatar.className = "avatar";
    avatar.type = "button";
    avatar.textContent = name.trim().slice(0, 1) || index + 1;
    avatar.title = `${name} 선택`;
    avatar.addEventListener("click", () => {
      selectedPerson = index;
      renderPeople();
    });

    const input = document.createElement("input");
    input.value = name;
    input.setAttribute("aria-label", `${index + 1}번 친구 이름`);
    input.addEventListener("focus", () => {
      selectedPerson = index;
      renderPeople();
    });
    input.addEventListener("input", () => {
      state.people[index] = input.value || `친구 ${index + 1}`;
      saveState();
      renderSchedule();
      renderSummary();
    });

    item.append(avatar, input);
    personList.append(item);
  });
}

function renderSchedule() {
  const dates = getDates();
  schedule.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.setProperty("--days", dates.length);

  grid.append(cell("", "head time"));
  dates.forEach((date) => {
    grid.append(cell(formatDate(date), "head"));
  });

  TIMES.forEach((time) => {
    grid.append(cell(time, "time"));
    dates.forEach((date) => {
      const key = keyFor(date, time);
      const values = state.availability[key] || {};
      const available = countBy(values, "available");
      const maybe = countBy(values, "maybe");
      const slot = cell("", "slot");
      if (available === PEOPLE_COUNT) slot.classList.add("best");

      const count = document.createElement("div");
      count.className = "slot-count";
      count.textContent = `${available} 가능 · ${maybe} 애매`;

      const chips = document.createElement("div");
      chips.className = "chips";
      state.people.forEach((name, personIndex) => {
        const status = values[personIndex] || "busy";
        const chip = document.createElement("span");
        chip.className = `chip ${status}`;
        chip.textContent = initials(name, personIndex);
        chip.title = `${name}: ${statusLabel(status)}`;
        chips.append(chip);
      });

      slot.addEventListener("click", () => {
        state.availability[key] = { ...values, [selectedPerson]: selectedMode };
        saveAndRender();
      });

      slot.append(count, chips);
      grid.append(slot);
    });
  });

  schedule.append(grid);
}

function renderSummary() {
  const ranked = getRankedSlots();
  const top = ranked[0];

  if (!top) {
    bestSlot.textContent = "선택 전";
    bestCount.textContent = `0/${PEOPLE_COUNT}`;
    recommendations.innerHTML = `<p class="label">시간칸을 누르면 추천 시간이 표시됩니다.</p>`;
    return;
  }

  bestSlot.textContent = `${formatDate(top.date)} ${top.time}`;
  bestCount.textContent = `${top.available}/${PEOPLE_COUNT}`;
  recommendations.innerHTML = "";

  ranked.slice(0, 5).forEach((slot) => {
    const item = document.createElement("div");
    item.className = "rec";
    item.innerHTML = `<strong>${formatDate(slot.date)} ${slot.time}</strong><span>${slot.available} 가능 · ${slot.maybe} 애매</span>`;
    recommendations.append(item);
  });
}

function getRankedSlots() {
  const rows = [];
  getDates().forEach((date) => {
    TIMES.forEach((time) => {
      const values = state.availability[keyFor(date, time)] || {};
      const available = countBy(values, "available");
      const maybe = countBy(values, "maybe");
      if (available > 0 || maybe > 0) rows.push({ date, time, available, maybe });
    });
  });

  return rows.sort((a, b) => b.available - a.available || b.maybe - a.maybe);
}

function buildShareText() {
  const ranked = getRankedSlots().slice(0, 5);
  if (!ranked.length) return "아직 입력된 시간이 없습니다.";
  return ranked
    .map((slot, index) => `${index + 1}. ${formatDate(slot.date)} ${slot.time}: ${slot.available}/${PEOPLE_COUNT} 가능, ${slot.maybe}명 애매`)
    .join("\n");
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    alert(message);
  } catch {
    prompt("아래 내용을 복사하세요.", text);
  }
}

function countBy(values, target) {
  return Object.values(values).filter((value) => value === target).length;
}

function cell(text, className) {
  const element = document.createElement("div");
  element.className = `cell ${className}`;
  element.textContent = text;
  return element;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initials(name, index) {
  return name.trim().slice(0, 2) || String(index + 1);
}

function statusLabel(status) {
  return {
    available: "가능",
    maybe: "애매",
    busy: "불가",
  }[status];
}
