// Select elements
const appTitle = document.getElementById("appTitle");
const roomDisplay = document.getElementById("roomDisplay");

const setupSection = document.getElementById("setup");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const status = document.getElementById("status");

const teacherView = document.getElementById("teacherView");
const teacherStudentCount = document.getElementById("teacherStudentCount");
const studentsList = document.getElementById("studentsList");
const teacherNotes = document.getElementById("teacherNotes");
const btnDownloadNotes = document.getElementById("btnDownloadNotes");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnCloseSessionTeacher = document.getElementById("btnCloseSessionTeacher");

const studentView = document.getElementById("studentView");
const studentVideo = document.getElementById("studentVideo");
const btnCloseSessionStudent = document.getElementById("btnCloseSessionStudent");

// App state
let currentRole = null; // "teacher" or "student"
let currentRoom = null;
let currentName = null;

function resetApp() {
  // Clear inputs and status
  nameInput.value = "";
  roomInput.value = "";
  status.textContent = "";
  teacherNotes.value = "";
  studentsList.innerHTML = "";
  teacherStudentCount.textContent = "0";
  studentVideo.srcObject = null;

  // Reset UI to setup
  setupSection.classList.remove("hidden");
  teacherView.classList.add("hidden");
  studentView.classList.add("hidden");
  roomDisplay.classList.add("hidden");
  appTitle.textContent = "SplitClass + Trinket";

  currentRole = null;
  currentRoom = null;
  currentName = null;
}

// On teacher start
btnTeacher.addEventListener("click", () => {
  const name = nameInput.value.trim() || "Teacher";
  const room = roomInput.value.trim();

  if (!room) {
    status.textContent = "Please enter a room name.";
    return;
  }

  currentRole = "teacher";
  currentRoom = room;
  currentName = name;

  // Update UI
  setupSection.classList.add("hidden");
  teacherView.classList.remove("hidden");
  studentView.classList.add("hidden");

  appTitle.textContent = "SplitClass + Trinket";
  roomDisplay.textContent = `Room: ${room}`;
  roomDisplay.classList.remove("hidden");

  status.textContent = "";

  // (Here you can initialize signaling and other logic)
  // For demo, simulate some students:
  simulateStudents();
});

// On student join
btnStudent.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const room = roomInput.value.trim();

  if (!room) {
    status.textContent = "Please enter a room name.";
    return;
  }
  if (!name) {
    status.textContent = "Please enter your name.";
    return;
  }

  currentRole = "student";
  currentRoom = room;
  currentName = name;

  // Update UI
  setupSection.classList.add("hidden");
  teacherView.classList.add("hidden");
  studentView.classList.remove("hidden");

  appTitle.textContent = "SplitClass + Trinket";
  roomDisplay.textContent = `Room: ${room}`;
  roomDisplay.classList.remove("hidden");

  status.textContent = "";

  // (Here you can initialize signaling and other logic)
});

// Close session handlers
btnCloseSessionTeacher.addEventListener("click", () => {
  if (confirm("Are you sure you want to close the session?")) {
    resetApp();
  }
});

btnCloseSessionStudent.addEventListener("click", () => {
  if (confirm("Leave session and return to home?")) {
    resetApp();
  }
});

// Download notes button
btnDownloadNotes.addEventListener("click", () => {
  const notes = teacherNotes.value.trim();
  if (!notes) {
    alert("No notes to download.");
    return;
  }

  const blob = new Blob([notes], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes_${currentRoom || "session"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// Dummy function to simulate students in teacher view
function simulateStudents() {
  const fakeStudents = ["Alice", "Bob", "Charlie"];
  studentsList.innerHTML = "";
  fakeStudents.forEach(name => {
    const li = document.createElement("li");
    li.textContent = name;
    studentsList.appendChild(li);
  });
  teacherStudentCount.textContent = fakeStudents.length;
}

// Initialize app on load
resetApp();