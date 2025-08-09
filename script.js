const signalingUrl = "wss://splitclass-production.up.railway.app";

const joinPage = document.getElementById("joinPage");
const roomPage = document.getElementById("roomPage");

const studentNameInput = document.getElementById("studentNameInput");
const roomInput = document.getElementById("roomInput");
const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const status = document.getElementById("status");

const roomHeaderName = document.getElementById("headerRoomName");
const teacherButtons = document.getElementById("teacherButtons");
const studentButtons = document.getElementById("studentButtons");

const btnShareScreen = document.getElementById("btnShareScreen");
const btnDownloadNotes = document.getElementById("btnDownloadNotes");
const btnCloseSessionTeacher = document.getElementById("btnCloseSession");
const btnCloseSessionStudent = document.getElementById("btnCloseSessionStudent");

const teacherLeftPane = document.getElementById("teacherLeftPane");
const teacherRightPane = document.getElementById("teacherRightPane");
const studentLeftPane = document.getElementById("studentLeftPane");
const studentRightPane = document.getElementById("studentRightPane");

const studentsList = document.getElementById("studentsList");
const notesArea = document.getElementById("notesArea");
const video = document.getElementById("video");
const editorFrame = document.getElementById("editorFrame");

let ws = null;
let roomName = null;
let isTeacher = false;
let screenStream = null;
let isSharing = false;
const teacherPeers = {};
let studentPc = null;
let studentId = null;
let studentName = null;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/* --- UI Management --- */

function switchToRoomPage() {
  joinPage.style.display = "none";
  roomPage.style.display = "flex";
}

function switchToJoinPage() {
  roomPage.style.display = "none";
  joinPage.style.display = "flex";
  resetAll();
}

function setupTeacherLayout() {
  // Show teacher panes
  teacherLeftPane.style.display = "block";
  teacherRightPane.style.display = "flex";

  // Hide student panes
  studentLeftPane.style.display = "none";
  studentRightPane.style.display = "none";

  // Show teacher buttons, hide student buttons
  teacherButtons.style.display = "flex";
  studentButtons.style.display = "none";

  // Set room name in header
  roomHeaderName.textContent = roomName;

  // Clear notes area and students list
  notesArea.value = "";
  updateStudentCountUI();
}

function setupStudentLayout() {
  // Show student panes
  studentLeftPane.style.display = "block";
  studentRightPane.style.display = "block";

  // Hide teacher panes
  teacherLeftPane.style.display = "none";
  teacherRightPane.style.display = "none";

  // Show student buttons, hide teacher buttons
  studentButtons.style.display = "block";
  teacherButtons.style.display = "none";

  // Set room name in header
  roomHeaderName.textContent = roomName;

  // Clear video src and notes
  video.srcObject = null;
  notesArea.value = "";
  studentsList.innerHTML = "";
}

function updateStudentCountUI() {
  studentsList.innerHTML = "";
  const count = Object.keys(teacherPeers).length;
  if (count === 0) {
    studentsList.innerHTML = "<li>No students connected</li>";
  } else {
    Object.values(teacherPeers).forEach(({ name }) => {
      const li = document.createElement("li");
      li.textContent = name || "Anonymous";
      studentsList.appendChild(li);
    });
  }
}

/* --- Signaling and WebRTC ---

(Keep your existing signaling, offer, answer, candidate handlers here,
adjust event handlers below as needed to update UI) */

/* --- Event Handlers --- */

btnTeacher.addEventListener("click", () => {
  roomName = roomInput.value.trim();
  studentName = studentNameInput.value.trim() || "Teacher";
  if (!roomName) {
    status.textContent = "Please enter a room name.";
    return;
  }
  isTeacher = true;
  connectSignaling(roomName, "teacher", { name: studentName });
  switchToRoomPage();
  setupTeacherLayout();
  status.textContent = "Connecting as teacher...";
});

btnStudent.addEventListener("click", () => {
  roomName = roomInput.value.trim();
  studentName = studentNameInput.value.trim();
  if (!roomName) {
    status.textContent = "Please enter a room name.";
    return;
  }
  if (!studentName) {
    status.textContent = "Please enter your name.";
    return;
  }
  isTeacher = false;
  connectSignaling(roomName, "student", { name: studentName });
  switchToRoomPage();
  setupStudentLayout();
  status.textContent = "Connecting as student...";
});

btnShareScreen.addEventListener("click", () => {
  if (isSharing) {
    stopScreenShare();
  } else {
    startScreenShare();
  }
});

btnDownloadNotes.addEventListener("click", () => {
  const blob = new Blob([notesArea.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${roomName || "notes"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

btnCloseSessionTeacher.addEventListener("click", () => {
  closeSession();
  switchToJoinPage();
});

btnCloseSessionStudent.addEventListener("click", () => {
  closeSession();
  switchToJoinPage();
});

/* --- Reset State --- */

function resetAll() {
  // Reset everything
  status.textContent = "";
  roomName = null;
  studentName = null;
  isTeacher = false;
  isSharing = false;
  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;

  // Close all peer connections
  Object.values(teacherPeers).forEach(({ pc }) => {
    pc?.close();
  });
  for (const key in teacherPeers) delete teacherPeers[key];
  studentPc?.close();
  studentPc = null;

  // Clear UI elements
  studentsList.innerHTML = "";
  notesArea.value = "";
  video.srcObject = null;
  editorFrame.src = "https://trinket.io/embed/python3"; // Reset iframe if needed

  // Reset input fields
  studentNameInput.value = "";
  roomInput.value = "";

  // Hide all panes/buttons initially
  teacherLeftPane.style.display = "none";
  teacherRightPane.style.display = "none";
  studentLeftPane.style.display = "none";
  studentRightPane.style.display = "none";
  teacherButtons.style.display = "none";
  studentButtons.style.display = "none";
}

/* --- You should keep your existing signaling and WebRTC code here --- */
/* --- Add signaling event handlers to update teacherPeers and UI accordingly --- */
/* --- Call updateStudentCountUI() inside relevant signaling events --- */
/* --- Also handle screen share start/stop, offerToStudent(), handleOfferAsStudent(), etc. --- */

/* --- Init --- */

switchToJoinPage();
status.textContent = "Enter your name, room name and select role to join.";
