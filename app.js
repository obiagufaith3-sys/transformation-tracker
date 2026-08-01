// ==========================================
// 1. REUSE SUPABASE CLIENT FROM CONFIG
// ==========================================
// Grab the client created in supabase-config.js (prevents "Identifier already declared" error)
var supabase = window.supabaseClient;

// ==========================================
// 2. INDEXEDDB SETUP (Dexie.js)
// ==========================================
const db = new Dexie("120DayTrackerDB");

db.version(1).stores({
  days: "dayNumber, date, marker"
});

// ==========================================
// 3. STATE & DOM ELEMENTS
// ==========================================
let currentDay = 1;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingSeconds = 0;
let isSignUpMode = false;
let currentUser = null;

// DOM Selectors - Auth & View Containers
const authContainer = document.getElementById("auth-container");
const dashboardContainer = document.getElementById("dashboard-container");
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnSubmitAuth = document.getElementById("btn-submit-auth");
const btnToggleMode = document.getElementById("btn-toggle-mode");
const authError = document.getElementById("auth-error");
const userEmailDisplay = document.getElementById("user-email-display");
const btnLogout = document.getElementById("btn-logout");

// DOM Selectors - Navigation & Header
const currentDayTitle = document.getElementById("currentDayTitle");
const datePicker = document.getElementById("datePicker");
const prevDayBtn = document.getElementById("prevDayBtn");
const nextDayBtn = document.getElementById("nextDayBtn");
const dayJumpSelect = document.getElementById("dayJumpSelect");
const todayBtn = document.getElementById("todayBtn");
const themeSelect = document.getElementById("themeSelect");

// DOM Selectors - Marker Tags
const markerPicker = document.querySelector(".marker-picker");
const markerButtons = document.querySelectorAll(".marker-btn");

// DOM Selectors - Checklist
const addTaskForm = document.getElementById("addTaskForm");
const newTaskInput = document.getElementById("newTaskInput");
const checklistItems = document.getElementById("checklistItems");
const checklistProgress = document.getElementById("checklistProgress");

// DOM Selectors - Journal
const feelInput = document.getElementById("feelInput");
const avoidedInput = document.getElementById("avoidedInput");
const achievedInput = document.getElementById("achievedInput");

// DOM Selectors - Voice Notes
const recordBtn = document.getElementById("recordBtn");
const recordBtnText = document.getElementById("recordBtnText");
const recordingTimer = document.getElementById("recordingTimer");
const audioList = document.getElementById("audioList");

// Helper: Format date to local YYYY-MM-DD string without timezone shifts
function formatLocalDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Function to generate fresh starter templates
function createDefaultDayTemplate(dayNum, calculatedDate) {
  return {
    dayNumber: dayNum,
    date: calculatedDate,
    marker: "none",
    journal: { feel: "", avoided: "", achieved: "" },
    checklist: [
      { id: "1", text: "Drink 3L of water", completed: false },
      { id: "2", text: "30 min workout / physical exercise", completed: false }
    ],
    voiceNotes: []
  };
}

// ==========================================
// 4. AUTH & SESSION CONTROL ENGINE
// ==========================================
function setupAuthListeners() {
  // Toggle between Sign In and Sign Up mode
  btnToggleMode?.addEventListener("click", () => {
    isSignUpMode = !isSignUpMode;
    if (authError) authError.innerText = "";
    
    if (isSignUpMode) {
      if (btnSubmitAuth) btnSubmitAuth.innerText = "Sign Up";
      if (btnToggleMode) btnToggleMode.innerText = "Already have an account? Sign In";
    } else {
      if (btnSubmitAuth) btnSubmitAuth.innerText = "Sign In";
      if (btnToggleMode) btnToggleMode.innerText = "Need an account? Sign Up";
    }
  });

  // Handle Login / Registration Form Submission
  authForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabase) return;
    
    if (authError) authError.innerText = "";
    if (btnSubmitAuth) btnSubmitAuth.disabled = true;

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    let result;
    if (isSignUpMode) {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    const { data, error } = result;

    if (error) {
      if (authError) authError.innerText = error.message;
      if (btnSubmitAuth) btnSubmitAuth.disabled = false;
    } else if (data?.user) {
      if (btnSubmitAuth) btnSubmitAuth.disabled = false;
      showDashboard(data.user);
    }
  });

  // Sign Out Button Handler
  btnLogout?.addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    showAuth();
  });

  // Listen to Auth State Changes (Supports Persistent Offline Local Sessions)
  if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        showDashboard(session.user);
      } else {
        showAuth();
      }
    });
  }
}

function showDashboard(user) {
  currentUser = user;
  if (authContainer) authContainer.style.display = "none";
  if (dashboardContainer) dashboardContainer.style.display = "block";
  if (userEmailDisplay) userEmailDisplay.innerText = user.email || "User";
}

function showAuth() {
  currentUser = null;
  if (authContainer) authContainer.style.display = "flex";
  if (dashboardContainer) dashboardContainer.style.display = "none";
}

// ==========================================
// 5. INITIALIZATION & APP ENGINE
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. Setup Auth LISTENERS & Session Check
    setupAuthListeners();

    // 2. Restore UI Theme
    const savedTheme = localStorage.getItem("trackerTheme") || "light";
    if (themeSelect) themeSelect.value = savedTheme;
    document.documentElement.setAttribute("data-theme", savedTheme);

    // 3. Setup Tracker Event Listeners
    setupEventListeners();

    // 4. Populate Dropdown Options (Day 1 - 120)
    await populateJumpDropdown();

    // 5. Load Data for Current Active Day
    await loadDayData(currentDay);
  } catch (err) {
    console.error("Initialization Error:", err);
  }
});

// Populate Jump Select Dropdown (1 - 120) with Flag Indicators
async function populateJumpDropdown() {
  if (!dayJumpSelect) return;
  dayJumpSelect.innerHTML = "";

  let dayMap = new Map();
  try {
    const allDays = await db.days.toArray();
    dayMap = new Map(allDays.map((d) => [d.dayNumber, d.marker]));
  } catch (err) {
    console.warn("Could not fetch day markers yet:", err);
  }

  // Populate 1 to 120 options
  for (let i = 1; i <= 120; i++) {
    const option = document.createElement("option");
    option.value = i;
    const tag = dayMap.get(i);
    const flagSymbol = tag === "red" ? "🔴 " : tag === "blue" ? "🔵 " : "";
    option.textContent = `${flagSymbol}Day ${i}`;
    dayJumpSelect.appendChild(option);
  }
  
  dayJumpSelect.value = currentDay;
}

// ==========================================
// 6. TRACKER EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Theme Selector
  themeSelect?.addEventListener("change", (e) => {
    const selectedTheme = e.target.value;
    document.documentElement.setAttribute("data-theme", selectedTheme);
    localStorage.setItem("trackerTheme", selectedTheme);
  });

  // Previous Day Button
  prevDayBtn?.addEventListener("click", () => {
    if (currentDay > 1) {
      currentDay--;
      loadDayData(currentDay);
    }
  });

  // Next Day Button
  nextDayBtn?.addEventListener("click", () => {
    if (currentDay < 120) {
      currentDay++;
      loadDayData(currentDay);
    }
  });

  // Jump Dropdown Selection
  dayJumpSelect?.addEventListener("change", (e) => {
    const targetDay = parseInt(e.target.value, 10);
    if (!isNaN(targetDay) && targetDay >= 1 && targetDay <= 120) {
      currentDay = targetDay;
      loadDayData(currentDay);
    }
  });

  // Return to Today / Day 1 Shortcut
  todayBtn?.addEventListener("click", () => {
    currentDay = 1;
    loadDayData(currentDay);
  });

  // Flag Day Tag Picker
  markerPicker?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".marker-btn");
    if (!btn) return;

    const chosenColor = btn.getAttribute("data-color");
    await updateCurrentDayRecord((data) => {
      data.marker = chosenColor;
    });

    updateMarkerUI(chosenColor);
    await populateJumpDropdown();
    if (dayJumpSelect) dayJumpSelect.value = currentDay;
  });

  // Date Picker Handler
  datePicker?.addEventListener("change", async (e) => {
    const newDate = e.target.value;
    if (!newDate) return;

    await updateCurrentDayRecord((data) => {
      data.date = newDate;
    });

    // If Day 1 changes, cascade updates to all future initialized days
    if (currentDay === 1) {
      const allDays = await db.days.toArray();
      const [year, month, day] = newDate.split("-").map(Number);

      for (const d of allDays) {
        if (d.dayNumber > 1) {
          const baseDate = new Date(year, month - 1, day);
          baseDate.setDate(baseDate.getDate() + (d.dayNumber - 1));
          d.date = formatLocalDate(baseDate);
          await db.days.put(d);
        }
      }
    }
  });
}

// Dynamic Date Calculation
async function getCalculatedDateForDay(targetDayNum) {
  const day1Record = await db.days.get(1);
  const baseDateString = day1Record ? day1Record.date : formatLocalDate(new Date());

  const [year, month, day] = baseDateString.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  dateObj.setDate(dateObj.getDate() + (targetDayNum - 1));

  return formatLocalDate(dateObj);
}

// ==========================================
// 7. DATA LOAD & SAVE FUNCTIONS
// ==========================================
async function loadDayData(dayNum) {
  if (currentDayTitle) currentDayTitle.textContent = `Day ${dayNum}`;
  if (dayJumpSelect) dayJumpSelect.value = dayNum;

  let dayData = await db.days.get(dayNum);

  if (!dayData) {
    const calculatedDate = await getCalculatedDateForDay(dayNum);
    dayData = createDefaultDayTemplate(dayNum, calculatedDate);
    await db.days.put(dayData);
  }

  // Sync Input UI Values
  if (datePicker) datePicker.value = dayData.date;
  if (feelInput) feelInput.value = dayData.journal?.feel || "";
  if (avoidedInput) avoidedInput.value = dayData.journal?.avoided || "";
  if (achievedInput) achievedInput.value = dayData.journal?.achieved || "";

  // Sync Marker Tag UI
  updateMarkerUI(dayData.marker || "none");

  // Render Sub-components
  renderChecklist(dayData.checklist || []);
  renderVoiceNotes(dayData.voiceNotes || []);
}

async function updateCurrentDayRecord(updateFn) {
  let dayData = await db.days.get(currentDay);

  if (!dayData) {
    const calculatedDate = await getCalculatedDateForDay(currentDay);
    dayData = createDefaultDayTemplate(currentDay, calculatedDate);
  }

  updateFn(dayData);
  await db.days.put(dayData);
}

function updateMarkerUI(activeColor) {
  markerButtons.forEach((btn) => {
    if (btn.getAttribute("data-color") === activeColor) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// ==========================================
// 8. CHECKLIST ENGINE
// ==========================================
addTaskForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const taskText = newTaskInput.value.trim();
  if (!taskText) return;

  const newTask = {
    id: Date.now().toString(),
    text: taskText,
    completed: false
  };

  await updateCurrentDayRecord((data) => {
    data.checklist.push(newTask);
  });

  newTaskInput.value = "";
  await loadDayData(currentDay);
});

function renderChecklist(items) {
  if (!checklistItems) return;
  checklistItems.innerHTML = "";
  let completedCount = 0;

  items.forEach((item) => {
    if (item.completed) completedCount++;

    const li = document.createElement("li");
    li.className = `task-item ${item.completed ? "completed" : ""}`;

    li.innerHTML = `
      <div class="task-left">
        <input type="checkbox" ${item.completed ? "checked" : ""} data-id="${item.id}" />
        <span>${escapeHtml(item.text)}</span>
      </div>
      <button class="delete-btn" data-id="${item.id}" title="Delete Task">&times;</button>
    `;

    checklistItems.appendChild(li);
  });

  if (checklistProgress) checklistProgress.textContent = `${completedCount}/${items.length} completed`;

  // Checkbox Event Handling
  checklistItems.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      await updateCurrentDayRecord((data) => {
        const task = data.checklist.find((t) => t.id === id);
        if (task) task.completed = e.target.checked;
      });
      await loadDayData(currentDay);
    });
  });

  // Task Delete Handling
  checklistItems.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      await updateCurrentDayRecord((data) => {
        data.checklist = data.checklist.filter((t) => t.id !== id);
      });
      await loadDayData(currentDay);
    });
  });
}

// ==========================================
// 9. JOURNAL AUTO-SAVE ENGINE
// ==========================================
[feelInput, avoidedInput, achievedInput].forEach((textarea) => {
  textarea?.addEventListener("input", async () => {
    await updateCurrentDayRecord((data) => {
      data.journal = {
        feel: feelInput ? feelInput.value : "",
        avoided: avoidedInput ? avoidedInput.value : "",
        achieved: achievedInput ? achievedInput.value : ""
      };
    });
  });
});

// ==========================================
// 10. VOICE JOURNAL ENGINE (MediaRecorder API)
// ==========================================
recordBtn?.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
  } else {
    await startRecording();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      await updateCurrentDayRecord((data) => {
        data.voiceNotes.push({
          id: Date.now().toString(),
          timestamp: timeString,
          blob: audioBlob
        });
      });

      stream.getTracks().forEach((track) => track.stop());
      await loadDayData(currentDay);
    };

    mediaRecorder.start();
    if (recordBtnText) recordBtnText.textContent = "Stop Recording";

    recordingSeconds = 0;
    if (recordingTimer) recordingTimer.textContent = "00:00";
    recordingTimerInterval = setInterval(() => {
      recordingSeconds++;
      const m = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
      const s = String(recordingSeconds % 60).padStart(2, "0");
      if (recordingTimer) recordingTimer.textContent = `${m}:${s}`;
    }, 1000);

  } catch (err) {
    alert("Microphone permission is required to record voice notes.");
  }
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    clearInterval(recordingTimerInterval);
    if (recordBtnText) recordBtnText.textContent = "Start Recording";
    if (recordingTimer) recordingTimer.textContent = "00:00";
  }
}

function renderVoiceNotes(notes) {
  if (!audioList) return;
  audioList.innerHTML = "";

  if (notes.length === 0) {
    audioList.innerHTML = '<p class="subtitle">No voice recordings for today.</p>';
    return;
  }

  notes.forEach((note) => {
    const audioUrl = URL.createObjectURL(note.blob);
    const container = document.createElement("div");
    container.className = "task-item";

    container.innerHTML = `
      <div style="flex-grow: 1; padding-right: 10px;">
        <span class="subtitle">Recorded at ${note.timestamp}</span>
        <audio controls src="${audioUrl}"></audio>
      </div>
      <button class="delete-btn delete-audio-btn" data-id="${note.id}" title="Delete Recording">&times;</button>
    `;

    audioList.appendChild(container);
  });

  audioList.querySelectorAll(".delete-audio-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      await updateCurrentDayRecord((data) => {
        data.voiceNotes = data.voiceNotes.filter((n) => n.id !== id);
      });
      await loadDayData(currentDay);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}