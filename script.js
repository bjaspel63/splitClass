const signalingUrl = "wss://splitclass-production.up.railway.app";

const video = document.getElementById("video");
const roomInput = document.getElementById("roomInput");
const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnCloseSessionTeacher = document.getElementById("btnCloseSessionTeacher");
const btnCloseSessionStudent = document.getElementById("btnCloseSessionStudent");
const status = document.getElementById("status");
const setupSection = document.getElementById("setup");
const mainSection = document.getElementById("main");
const leftPane = document.getElementById("leftPane");
const studentsListContainer = document.getElementById("studentsListContainer");
const studentsList = document.getElementById("studentsList");
const studentCountDisplay = document.getElementById("studentCountDisplay");
const notesArea = document.getElementById("notesArea");
const editorFrame = document.getElementById("editorFrame");

const studentNameInput = document.getElementById("studentNameInput");

const displayName = document.getElementById("displayName");
const displayRoom = document.getElementById("displayRoom");

const nameContainer = document.getElementById("nameContainer");
const roomContainer = document.getElementById("roomContainer");

const teacherControls = document.getElementById("teacherControls");
const studentControls = document.getElementById("studentControls");

const pdfUploadInput = document.getElementById("pdfUpload");
const pdfViewerContainer = document.getElementById("pdfViewerContainer");
const pdfViewer = document.getElementById("pdfViewer");
const btnClearPdf = document.getElementById("btnClearPdf");

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

// Add a flag to track if an error was shown
let hasError = false;

/* --- UI Helpers --- */

function updateStudentCount() {
  if (!isTeacher) return;

  const count = Object.keys(teacherPeers).length;
  studentCountDisplay.textContent = count;

  studentsList.innerHTML = "";
  studentsListContainer.classList.remove("hidden"); // Always show container here

  if (count > 0) {
    for (const info of Object.values(teacherPeers)) {
      const li = document.createElement("li");
      li.textContent = info.name || "Anonymous";
      studentsList.appendChild(li);
    }
  } else {
    const li = document.createElement("li");
    li.innerHTML = "<em>No students yet</em>";
    studentsList.appendChild(li);
  }
}

function updateUIForRole() {
  if (isTeacher) {

    leftPane.classList.remove("student-full");
    leftPane.classList.add("teacher-no-video");

    studentsListContainer.classList.remove("hidden");
    video.classList.add("hidden");

    // Show PDF viewer if PDF loaded, else show notes
    if (pdfViewer.src && pdfViewer.src.trim() !== "") {
      notesArea.classList.add("hidden");
      pdfViewerContainer.classList.remove("hidden");
      btnClearPdf.style.display = "inline-block";
    } else {
      notesArea.classList.remove("hidden");
      pdfViewerContainer.classList.add("hidden");
      btnClearPdf.style.display = "none";
    }

    editorFrame.classList.add("hidden");

    document.getElementById("rightPane").style.display = "flex";

    teacherControls.classList.remove("hidden");
    studentControls.classList.add("hidden");

    mainSection.classList.remove("student-role");
    mainSection.classList.add("teacher-role");

    // Show PDF upload button for teacher
    if (pdfUploadInput) pdfUploadInput.style.display = "inline-block";

  } else {
    leftPane.classList.remove("teacher-no-video");
    leftPane.classList.add("student-full");

    video.classList.remove("hidden");
    studentsListContainer.classList.add("hidden");

    notesArea.classList.add("hidden");
    editorFrame.classList.remove("hidden");

    // Hide PDF viewer & upload for students
    pdfViewerContainer.classList.add("hidden");
    btnClearPdf.style.display = "none";
    if (pdfUploadInput) pdfUploadInput.style.display = "none";

    document.getElementById("rightPane").style.display = "flex";

    teacherControls.classList.add("hidden");
    studentControls.classList.remove("hidden");

    mainSection.classList.remove("teacher-role");
    mainSection.classList.add("student-role");
  }
}

function showJoinedInfo() {
  studentNameInput.classList.add("hidden");
  studentNameInput.previousElementSibling.classList.add("hidden");
  roomInput.classList.add("hidden");
  roomInput.previousElementSibling.classList.add("hidden");

  if (isTeacher) {
    nameContainer.classList.add("hidden");
    roomContainer.classList.remove("hidden");
    displayRoom.textContent = roomName || '';
  } else {
    nameContainer.classList.remove("hidden");
    displayName.textContent = studentName;
    roomContainer.classList.remove("hidden");
    displayRoom.textContent = roomName || '';
  }
}

/* --- Download Notes --- */
function downloadNotes() {
  if (!notesArea.value.trim()) {
    alert("No notes to download.");
    return;
  }
  const blob = new Blob([notesArea.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes_${roomName || "session"}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* --- Reset UI after error --- */
function resetUIAfterError() {
  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }

  setupSection.classList.remove("hidden");
  mainSection.classList.add("hidden");

  btnTeacher.classList.remove("hidden");
  btnStudent.classList.remove("hidden");

  studentNameInput.classList.remove("hidden");
  studentNameInput.previousElementSibling.classList.remove("hidden");
  roomInput.classList.remove("hidden");
  roomInput.previousElementSibling.classList.remove("hidden");

  nameContainer.classList.add("hidden");
  roomContainer.classList.add("hidden");

  teacherControls.classList.add("hidden");
  studentControls.classList.add("hidden");

  studentsListContainer.classList.add("hidden");
  studentCountDisplay.textContent = "0";

  studentsList.innerHTML = "";
  notesArea.value = "";

  leftPane.classList.remove("teacher-no-video", "student-full");
  document.getElementById("rightPane").style.display = "flex";

  for (const key in teacherPeers) delete teacherPeers[key];
  studentId = null;
  studentName = null;
  roomName = null;
  isTeacher = false;
  isSharing = false;
  hasError = false;

  // Also clear PDF viewer & uploader
  if (pdfViewer) pdfViewer.src = "";
  if (pdfViewerContainer) pdfViewerContainer.classList.add("hidden");
  if (btnClearPdf) btnClearPdf.style.display = "none";
  if (pdfUploadInput) pdfUploadInput.value = "";
}

/* --- Signaling & WebRTC --- */

function sendSignal(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function connectSignaling(room, role, extraPayload = {}) {
  console.log("Connecting as", role, "to room", room);
  hasError = false; // reset error flag

  ws = new WebSocket(signalingUrl);

  ws.onopen = () => {
    console.log("WebSocket connection opened");
    sendSignal({ type: "join", room, payload: { role, ...extraPayload } });
    status.textContent = "Connected to signaling server.";
  };

  ws.onmessage = async (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      console.warn("Failed to parse signaling message");
      return;
    }

    console.log("Signaling message received:", data);

    switch (data.type) {
      case "error":
        hasError = true;
        status.textContent = `Error: ${data.message || "Unknown error"}`;
        resetUIAfterError();
        break;

      case "joined":
        isTeacher = (data.role === "teacher");
        status.textContent = `Joined room as ${data.role}.`;

        roomName = room;
        studentName = extraPayload.name || "Anonymous";
        
        const roomNameDisplay = document.getElementById("roomNameDisplay");
        if (roomNameDisplay) {
          roomNameDisplay.style.display = "block";
          roomNameDisplay.textContent = "Room Name: " + roomName;
        }

        btnTeacher.classList.add("hidden");
        btnStudent.classList.add("hidden");

        setupSection.classList.add("hidden");
        mainSection.classList.remove("hidden");

        showJoinedInfo();
        updateUIForRole();

        if (isTeacher) {
          if (Array.isArray(data.students)) {
            data.students.forEach(({ id, name }) => {
              teacherPeers[id] = { pc: null, name: name || "Anonymous" };
            });
          }
          updateStudentCount();
          btnShareScreen.style.display = "inline-block";
          btnShareScreen.disabled = false;
          teacherControls.classList.remove("hidden");
          status.textContent = `Teacher ready — ${Object.keys(teacherPeers).length} student(s) connected`;
        } else {
          if (data.id) {
            studentId = data.id;
            studentControls.classList.remove("hidden");
            status.textContent = `Student ready: ${studentName}`;
          }
        }
        break;

      case "student-joined":
        if (isTeacher && data.id) {
          teacherPeers[data.id] = teacherPeers[data.id] || { pc: null, name: data.name || "Anonymous" };
          updateStudentCount();
          status.textContent = `Student joined: ${data.name || "Anonymous"}`;
          if (isSharing) {
            offerToStudent(data.id);
          }
        }
        break;

      case "student-left":
        if (isTeacher && data.id) {
          if (teacherPeers[data.id]) {
            if (teacherPeers[data.id].pc) {
              try {
                teacherPeers[data.id].pc.close();
              } catch {}
            }
            delete teacherPeers[data.id];
            updateStudentCount();
            status.textContent = `Student left`;
          }
        }
        break;

      case "offer":
        if (!isTeacher) {
          await handleOfferAsStudent(data.payload);
        }
        break;

      case "answer":
        if (isTeacher && data.from) {
          const peerInfo = teacherPeers[data.from];
          if (peerInfo && peerInfo.pc) {
            try {
              await peerInfo.pc.setRemoteDescription(new RTCSessionDescription(data.payload));
            } catch (err) {
              console.warn("Failed to set remote description (answer) for", data.from, err);
            }
          }
        }
        break;

      case "candidate":
        if (isTeacher) {
          const from = data.from;
          const cand = data.payload;
          if (from && teacherPeers[from] && teacherPeers[from].pc) {
            try {
              await teacherPeers[from].pc.addIceCandidate(cand);
            } catch {}
          }
        } else {
          if (studentPc) {
            try {
              await studentPc.addIceCandidate(data.payload);
            } catch {}
          }
        }
        break;

      case "teacher-left":
        status.textContent = "Teacher disconnected.";
        if (studentPc) {
          try {
            studentPc.close();
          } catch {}
          studentPc = null;
        }
        break;

      default:
        console.warn("Unknown signaling message:", data);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket connection closed");
    if (!hasError) {
      status.textContent = "Disconnected from signaling server.";
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    if (!hasError) {
      status.textContent = "Signaling server error.";
    }
  };
}

/* --- Teacher: offer peers with screen stream --- */

async function offerToStudent(studentId) {
  if (!screenStream) return;
  if (teacherPeers[studentId] && teacherPeers[studentId].pc) {
    try {
      teacherPeers[studentId].pc.close();
    } catch {}
    teacherPeers[studentId].pc = null;
  }

  const pc = new RTCPeerConnection(rtcConfig);
  teacherPeers[studentId].pc = pc;

  screenStream.getTracks().forEach((track) => pc.addTrack(track, screenStream));

  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      sendSignal({ type: "candidate", room: roomName, payload: evt.candidate, to: studentId });
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", room: roomName, payload: offer, to: studentId });
  } catch (err) {
    console.error("Failed to create/send offer", err);
  }
}

/* --- Student: handle offer --- */

async function handleOfferAsStudent(offer) {
  if (!studentPc) {
    studentPc = new RTCPeerConnection(rtcConfig);

    studentPc.onicecandidate = (evt) => {
      if (evt.candidate) {
        sendSignal({ type: "candidate", room: roomName, payload: evt.candidate });
      }
    };

    studentPc.ontrack = (evt) => {
      if (video.srcObject !== evt.streams[0]) {
        video.srcObject = evt.streams[0];
      }
    };
  }

  try {
    await studentPc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await studentPc.createAnswer();
    await studentPc.setLocalDescription(answer);
    sendSignal({ type: "answer", room: roomName, payload: answer });
  } catch (err) {
    console.error("Error handling offer on student", err);
  }
}

/* --- Screen sharing --- */

async function startScreenShare() {
  if (!isTeacher) return;
  if (isSharing) {
    stopScreenShare();
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    video.srcObject = screenStream;
    isSharing = true;
    btnShareScreen.textContent = "Stop Sharing";

    for (const studentId of Object.keys(teacherPeers)) {
      offerToStudent(studentId);
    }

    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    status.textContent = "Failed to share screen: " + err.message;
    console.error(err);
  }
}

function stopScreenShare() {
  if (!screenStream) return;
  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  isSharing = false;
  video.srcObject = null;
  btnShareScreen.textContent = "Share Screen";

  for (const peer of Object.values(teacherPeers)) {
    if (peer.pc) {
      try {
        peer.pc.close();
      } catch {}
      peer.pc = null;
    }
  }
}

/* --- Close session --- */

function closeSession() {
  if (!confirm("Are you sure you want to close the session?")) {
    return; // User canceled, do nothing
  }

  if (ws) {
    try {
      sendSignal({ type: "leave", room: roomName });
      ws.close();
    } catch {}
    ws = null;
  }

  if (isTeacher) {
    stopScreenShare();
    for (const peer of Object.values(teacherPeers)) {
      if (peer.pc) {
        try {
          peer.pc.close();
        } catch {}
        peer.pc = null;
      }
    }
  } else {
    if (studentPc) {
      try {
        studentPc.close();
      } catch {}
      studentPc = null;
    }
    video.srcObject = null;
  }

  const roomNameDisplay = document.getElementById("roomNameDisplay");
  if (roomNameDisplay) {
    roomNameDisplay.textContent = ""; // clear text
    roomNameDisplay.style.display = "none"; // optionally hide
  }
  status.textContent = "Session closed.";

  // Reset UI
  setupSection.classList.remove("hidden");
  mainSection.classList.add("hidden");

  leftPane.classList.remove("teacher-no-video", "student-full");
  document.getElementById("rightPane").style.display = "flex";

  teacherControls.classList.add("hidden");
  studentControls.classList.add("hidden");

  btnShareScreen.style.display = "none";
  btnShareScreen.disabled = true;

  studentsListContainer.classList.add("hidden");
  studentCountDisplay.textContent = "0";

  for (const key in teacherPeers) delete teacherPeers[key];
  studentId = null;
  studentName = null;
  roomName = null;
  isTeacher = false;
  isSharing = false;
  studentsList.innerHTML = "";
  notesArea.value = "";

  // Clear input fields after closing session
  roomInput.value = "";
  studentNameInput.value = "";

  studentNameInput.classList.remove("hidden");
  studentNameInput.previousElementSibling.classList.remove("hidden");
  roomInput.classList.remove("hidden");
  roomInput.previousElementSibling.classList.remove("hidden");

  nameContainer.classList.add("hidden");
  roomContainer.classList.add("hidden");

  displayName.textContent = "";
  displayRoom.textContent = "";

  btnTeacher.classList.remove("hidden");
  btnStudent.classList.remove("hidden");

  // Also clear PDF viewer & uploader
  if (pdfViewer) pdfViewer.src = "";
  if (pdfViewerContainer) pdfViewerContainer.classList.add("hidden");
  if (btnClearPdf) btnClearPdf.style.display = "none";
  if (pdfUploadInput) pdfUploadInput.value = "";
}

/* --- Event listeners --- */

btnTeacher.addEventListener("click", () => {
  status.textContent = "";
  roomName = roomInput.value.trim();
  const nameVal = studentNameInput.value.trim() || "Teacher";

  const display = document.getElementById("roomNameDisplay");

  if (!roomName) {
    status.textContent = "Please enter a room name.";
    display.textContent = "";
    return;
  }

  display.textContent = "Room: " + roomName;

  isTeacher = true;
  connectSignaling(roomName, "teacher", { name: nameVal });
});

btnStudent.addEventListener("click", () => {
  status.textContent = "";
  roomName = roomInput.value.trim();
  const nameVal = studentNameInput.value.trim();

  const display = document.getElementById("roomNameDisplay");

  if (!roomName) {
    status.textContent = "Please enter a room name.";
    display.textContent = "";
    return;
  }
  if (!nameVal) {
    status.textContent = "Please enter your name.";
    display.textContent = "";
    return;
  }

  display.textContent = "Room: " + roomName;

  isTeacher = false;
  connectSignaling(roomName, "student", { name: nameVal });
});

btnShareScreen.addEventListener("click", () => {
  startScreenShare();
});

btnCloseSessionTeacher.addEventListener("click", () => {
  closeSession();
});

btnCloseSessionStudent.addEventListener("click", () => {
  closeSession();
});

/* --- Download notes event --- */
const btnDownloadNotes = document.getElementById("btnDownloadNotes");
if (btnDownloadNotes) {
  btnDownloadNotes.addEventListener("click", downloadNotes);
}

/* --- PDF Upload & Viewer --- */

if (pdfUploadInput && pdfViewer && pdfViewerContainer && btnClearPdf) {
  pdfUploadInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      const fileURL = URL.createObjectURL(file);
      pdfViewer.src = fileURL;

      // Show PDF viewer and hide notes area
      pdfViewerContainer.classList.remove("hidden");
      btnClearPdf.style.display = "inline-block";
      notesArea.classList.add("hidden");

    } else {
      alert("Please upload a valid PDF file.");
      pdfUploadInput.value = ""; // reset input
    }
  });

  btnClearPdf.addEventListener("click", () => {
    pdfViewer.src = "";
    pdfViewerContainer.classList.add("hidden");
    btnClearPdf.style.display = "none";

    // Show notes area back after clearing PDF
    notesArea.classList.remove("hidden");

    pdfUploadInput.value = "";
  });
}

/* --- Init --- */

document.addEventListener("DOMContentLoaded", () => {
  status.textContent = "Enter room name and your name, then select role to join.";
  btnShareScreen.style.display = "none";
  teacherControls.classList.add("hidden");
  studentControls.classList.add("hidden");
  studentsListContainer.classList.add("hidden");

  notesArea.classList.remove("hidden"); // Show notes by default on init
  editorFrame.classList.remove("hidden");
  nameContainer.classList.add("hidden");
  roomContainer.classList.add("hidden");

  btnTeacher.classList.remove("hidden");
  btnStudent.classList.remove("hidden");

  // Hide PDF viewer & uploader initially
  if (pdfUploadInput) pdfUploadInput.style.display = "none";
  if (pdfViewerContainer) pdfViewerContainer.classList.add("hidden");
  if (btnClearPdf) btnClearPdf.style.display = "none";
});