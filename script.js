// script.js -- multi-student-ready client with student name input and attendance list
const signalingUrl = "wss://splitclass-production.up.railway.app";

const video = document.getElementById("video");
const roomInput = document.getElementById("roomInput");
const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnCloseSession = document.getElementById("btnCloseSession");
const status = document.getElementById("status");
const setupSection = document.getElementById("setup");
const mainSection = document.getElementById("main");
const teacherDisconnected = document.getElementById("teacherDisconnected");
const leftPane = document.getElementById("leftPane");
const studentCountDiv = document.getElementById("studentCount");

const studentNameContainer = document.getElementById("studentNameContainer");
const studentNameInput = document.getElementById("studentNameInput");

const studentsListContainer = document.getElementById("studentsListContainer");
const studentsList = document.getElementById("studentsList");
const studentCountDisplay = document.getElementById("studentCountDisplay");

let ws = null;
let roomName = null;
let isTeacher = false;
let screenStream = null;
let isSharing = false;

// Teacher side: map studentId -> { pc: RTCPeerConnection|null, name: string }
const teacherPeers = {};

// Student side: single RTCPeerConnection
let studentPc = null;
let studentId = null;
let studentName = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/* --------------------- Helpers --------------------- */

function updateStudentCount() {
  if (!isTeacher) return;
  const count = Object.keys(teacherPeers).length;
  studentCountDiv.textContent = `Students: ${count}`;
  studentCountDiv.style.display = count > 0 ? "inline-block" : "none";

  studentCountDisplay.textContent = count;
  if(count > 0) {
    studentsListContainer.classList.remove("hidden");
    studentsList.innerHTML = "";
    for (const [id, info] of Object.entries(teacherPeers)) {
      const li = document.createElement("li");
      li.textContent = info.name ? `${info.name} (${id})` : id;
      studentsList.appendChild(li);
    }
  } else {
    studentsListContainer.classList.add("hidden");
    studentsList.innerHTML = "";
  }
}

/* --------------------- Signaling --------------------- */

function sendSignal(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function connectSignaling(room, role, extraPayload = {}) {
  ws = new WebSocket(signalingUrl);

  ws.onopen = () => {
    sendSignal({ type: "join", room, payload: { role, ...extraPayload } });
    status.textContent = "Connected to signaling server.";
  };

  ws.onmessage = async (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch (e) { return; }

    switch (data.type) {
      case "joined":
        status.textContent = `Joined room as ${data.role}.`;
        setupSection.classList.add("hidden");
        mainSection.classList.remove("hidden");
        updateUIForRole();

        if (isTeacher) {
          // data.students is array of {id, name}
          if (Array.isArray(data.students)) {
            data.students.forEach(({id, name}) => {
              if (!teacherPeers[id]) teacherPeers[id] = { pc: null, name: name || id };
            });
          }
          updateStudentCount();
          btnShareScreen.disabled = false;
          status.textContent = `Teacher ready — ${Object.keys(teacherPeers).length} waiting`;
        } else {
          if (data.id) {
            studentId = data.id;
            studentName = data.name || extraPayload.name || "Anonymous";
            status.textContent = `Student ready: ${studentName} (id: ${studentId})`;
          }
        }
        break;

      case "student-joined":
        if (isTeacher && data.id) {
          teacherPeers[data.id] = teacherPeers[data.id] || { pc: null, name: data.name || data.id };
          updateStudentCount();
          status.textContent = `Student joined: ${data.name || data.id}`;
          if (isSharing) offerToStudent(data.id);
        }
        break;

      case "student-left":
        if (isTeacher && data.id) {
          if (teacherPeers[data.id]) {
            if (teacherPeers[data.id].pc) {
              try { teacherPeers[data.id].pc.close(); } catch(e) {}
            }
            delete teacherPeers[data.id];
            updateStudentCount();
            status.textContent = `Student left: ${data.id}`;
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
              console.warn("Failed to set remote desc (answer) for", data.from, err);
            }
          } else {
            console.warn("Answer received for unknown student or peer:", data.from);
          }
        }
        break;

      case "candidate":
        if (isTeacher) {
          const from = data.from;
          const cand = data.payload;
          if (from && teacherPeers[from] && teacherPeers[from].pc) {
            try { await teacherPeers[from].pc.addIceCandidate(cand); } catch (err) { console.warn("teacher addIce failed", err); }
          }
        } else {
          if (studentPc) {
            try { await studentPc.addIceCandidate(data.payload); } catch (err) { console.warn("student addIce failed", err); }
          }
        }
        break;

      case "teacher-left":
        teacherDisconnected.classList.remove("hidden");
        status.textContent = "Teacher disconnected.";
        if (studentPc) { try { studentPc.close(); } catch(e) {} studentPc = null; }
        break;

      default:
        console.warn("Unknown signaling message:", data);
    }
  };

  ws.onclose = () => {
    status.textContent = "Disconnected from signaling server.";
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    status.textContent = "Signaling server error.";
  };
}

/* --------------------- Teacher: offer / peers --------------------- */

async function offerToStudent(studentId) {
  if (!screenStream) return;
  if (teacherPeers[studentId] && teacherPeers[studentId].pc) {
    try { teacherPeers[studentId].pc.close(); } catch (e) {}
    teacherPeers[studentId].pc = null;
  }

  const pc = new RTCPeerConnection(rtcConfig);
  teacherPeers[studentId].pc = pc;

  screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));

  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      sendSignal({ type: "candidate", room: roomName, payload: evt.candidate, to: studentId });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      try { pc.close(); } catch (e) {}
      teacherPeers[studentId].pc = null;
      updateStudentCount();
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", room: roomName, payload: offer, to: studentId });
  } catch (err) {
    console.error("Error creating/sending offer to", studentId, err);
  }
}

/* Called when teacher toggles startSharing */
async function startSharing() {
  try {
    Object.values(teacherPeers).forEach(info => {
      if (info.pc) try { info.pc.close(); } catch {}
    });
    Object.keys(teacherPeers).forEach(k => teacherPeers[k].pc = null);

    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    video.srcObject = screenStream;

    isSharing = true;
    btnShareScreen.textContent = "Stop Sharing";
    leftPane.classList.add("fullscreen");
    mainSection.classList.add("fullscreen");
    teacherDisconnected.classList.add("hidden");

    const studentIds = Object.keys(teacherPeers);
    for (const id of studentIds) {
      await offerToStudent(id);
    }

    const track = screenStream.getVideoTracks()[0];
    if (track) {
      track.addEventListener("ended", () => {
        stopSharing();
      });
    }
  } catch (err) {
    console.error("startSharing error:", err);
    alert("Screen share permission denied or error: " + (err && err.message));
    status.textContent = "Screen share permission denied.";
  }
}

function stopSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }

  Object.keys(teacherPeers).forEach(id => {
    const info = teacherPeers[id];
    if (info.pc) {
      try { info.pc.close(); } catch(e) {}
      info.pc = null;
    }
  });

  isSharing = false;
  btnShareScreen.textContent = "Share Screen";
  leftPane.classList.remove("fullscreen");
  mainSection.classList.remove("fullscreen");
  video.srcObject = null;
  updateStudentCount();
}

/* --------------------- Student: handle offer --------------------- */

async function handleOfferAsStudent(offer) {
  if (studentPc) {
    try { studentPc.close(); } catch (e) {}
    studentPc = null;
  }

  const pc = new RTCPeerConnection(rtcConfig);
  studentPc = pc;

  pc.ontrack = (evt) => {
    if (video.srcObject !== evt.streams[0]) {
      video.srcObject = evt.streams[0];
    }
    teacherDisconnected.classList.add("hidden");
    setupSection.classList.add("hidden");
    mainSection.classList.remove("hidden");
  };

  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      sendSignal({ type: "candidate", room: roomName, payload: evt.candidate, to: "teacher" });
    }
  };

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ type: "answer", room: roomName, payload: answer });
  } catch (err) {
    console.error("Error handling offer as student:", err);
  }
}

/* --------------------- UI / Button handlers --------------------- */

function updateUIForRole() {
  if (isTeacher) {
    btnTeacher.style.display = "none";
    btnStudent.style.display = "none";
    btnShareScreen.style.display = "inline-block";
    btnCloseSession.style.display = "inline-block";
    studentNameContainer.style.display = "none";
    studentCountDiv.style.display = Object.keys(teacherPeers).length > 0 ? "inline-block" : "none";
  } else {
    btnTeacher.style.display = "none";
    btnStudent.style.display = "none";
    btnShareScreen.style.display = "none";
    btnCloseSession.style.display = "inline-block";
    studentNameContainer.style.display = "block";
    studentCountDiv.style.display = "none";
  }
}

btnTeacher.addEventListener("click", () => {
  roomName = roomInput.value.trim();
  if (!roomName) {
    alert("Please enter a room name.");
    return;
  }
  isTeacher = true;
  connectSignaling(roomName, "teacher");
});

btnStudent.addEventListener("click", () => {
  roomName = roomInput.value.trim();
  studentName = studentNameInput.value.trim();
  if (!roomName) {
    alert("Please enter a room name.");
    return;
  }
  if (!studentName) {
    alert("Please enter your name.");
    return;
  }
  isTeacher = false;
  connectSignaling(roomName, "student", { name: studentName });
});

btnShareScreen.addEventListener("click", () => {
  if (isSharing) {
    stopSharing();
  } else {
    startSharing();
  }
});

btnCloseSession.addEventListener("click", () => {
  if (ws) ws.close();
  resetUI();
});

function resetUI() {
  isTeacher = false;
  isSharing = false;
  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;

  // Close all peer connections
  Object.values(teacherPeers).forEach(({ pc }) => {
    if (pc) try { pc.close(); } catch {}
  });
  Object.keys(teacherPeers).forEach(k => delete teacherPeers[k]);

  if (studentPc) {
    try { studentPc.close(); } catch {}
    studentPc = null;
  }

  roomName = null;
  studentId = null;
  studentName = null;

  setupSection.classList.remove("hidden");
  mainSection.classList.add("hidden");
  btnTeacher.style.display = "inline-block";
  btnStudent.style.display = "inline-block";
  btnShareScreen.style.display = "none";
  btnCloseSession.style.display = "none";
  studentNameContainer.style.display = "block";
  studentCountDiv.style.display = "none";
  status.textContent = "";
  video.srcObject = null;
  teacherDisconnected.classList.add("hidden");
  updateStudentCount();
}

// Optional: Prevent form submission on Enter in inputs
[roomInput, studentNameInput].forEach(input =>
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
  })
);
