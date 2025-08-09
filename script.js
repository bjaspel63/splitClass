// script.js -- multi-student-ready client
// Handles teacher broadcasting screen share to multiple students
// and students receiving the stream via WebRTC signaling.

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

let ws = null;
let roomName = null;
let isTeacher = false;
let screenStream = null;
let isSharing = false;

// Teacher side: map studentId -> RTCPeerConnection
const teacherPeers = {};

// Student side: single RTCPeerConnection
let studentPc = null;
let studentId = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/* --------------------- Signaling --------------------- */

function sendSignal(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function connectSignaling(room, role) {
  ws = new WebSocket(signalingUrl);

  ws.onopen = () => {
    sendSignal({ type: "join", room, payload: { role } });
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
          const existing = Array.isArray(data.students) ? data.students : [];
          existing.forEach(id => {
            if (!teacherPeers[id]) teacherPeers[id] = null;
          });
          btnShareScreen.disabled = false;
          status.textContent = `Teacher ready — ${existing.length} waiting`;
        } else {
          if (data.id) {
            studentId = data.id;
            status.textContent = `Student ready (id: ${studentId})`;
          }
        }
        break;

      case "student-joined":
        if (isTeacher && data.id) {
          teacherPeers[data.id] = teacherPeers[data.id] || null;
          status.textContent = `Student joined: ${data.id}`;
          if (isSharing) offerToStudent(data.id);
        }
        break;

      case "student-left":
        if (isTeacher && data.id) {
          if (teacherPeers[data.id]) {
            try { teacherPeers[data.id].close(); } catch(e) {}
          }
          delete teacherPeers[data.id];
          status.textContent = `Student left: ${data.id}`;
        }
        break;

      case "offer":
        if (!isTeacher) {
          await handleOfferAsStudent(data.payload);
        }
        break;

      case "answer":
        if (isTeacher && data.from) {
          const pc = teacherPeers[data.from];
          if (pc) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
            } catch (err) {
              console.warn("Failed to set remote desc (answer) for", data.from, err);
            }
          } else {
            console.warn("Answer received for unknown student:", data.from);
          }
        }
        break;

      case "candidate":
        if (isTeacher) {
          const from = data.from;
          const cand = data.payload;
          if (from && teacherPeers[from]) {
            try { await teacherPeers[from].addIceCandidate(cand); } catch (err) { console.warn("teacher addIce failed", err); }
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
  if (teacherPeers[studentId]) {
    try { teacherPeers[studentId].close(); } catch (e) {}
    teacherPeers[studentId] = null;
  }

  const pc = new RTCPeerConnection(rtcConfig);
  teacherPeers[studentId] = pc;

  screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));

  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      sendSignal({ type: "candidate", room: roomName, payload: evt.candidate, to: studentId });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      try { pc.close(); } catch (e) {}
      teacherPeers[studentId] = null;
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
    Object.values(teacherPeers).forEach(p => { try { if (p) p.close(); } catch{} });
    Object.keys(teacherPeers).forEach(k => teacherPeers[k] = null);

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
    const p = teacherPeers[id];
    if (p) {
      try { p.close(); } catch (e) {}
    }
    teacherPeers[id] = null;
  });

  isSharing = false;
  btnShareScreen.textContent = "Share Screen";
  leftPane.classList.remove("fullscreen");
  mainSection.classList.remove("fullscreen");
  video.srcObject = null;
}

/* --------------------- Student: handle offer --------------------- */

async function handleOfferAsStudent(offer) {
  if (studentPc) {
    try { studentPc.close(); } catch(e) {}
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
    console.error("student handleOffer error:", err);
  }
}

/* --------------------- UI and helpers --------------------- */

function updateUIForRole() {
  if (isTeacher) {
    btnStudent.style.display = "none";
    btnTeacher.style.display = "none";
    btnShareScreen.style.display = "inline-block";
    btnShareScreen.disabled = true; // enabled after join
    btnCloseSession.style.display = "inline-block";
  } else {
    btnStudent.style.display = "none";
    btnTeacher.style.display = "none";
    btnShareScreen.style.display = "none";
    btnCloseSession.style.display = "inline-block";
  }
}

function resetToSetup() {
  try { if (ws && ws.readyState === WebSocket.OPEN) sendSignal({ type: "leave", room: roomName }); } catch {}
  if (ws) { try { ws.close(); } catch {} ws = null; }

  if (studentPc) { try { studentPc.close(); } catch {} studentPc = null; }
  Object.keys(teacherPeers).forEach(k => { if (teacherPeers[k]) try { teacherPeers[k].close(); } catch{} teacherPeers[k] = null; });

  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }

  roomName = null;
  isTeacher = false;
  isSharing = false;
  studentId = null;
  video.srcObject = null;

  teacherDisconnected.classList.add("hidden");
  setupSection.classList.remove("hidden");
  mainSection.classList.add("hidden");
  leftPane.classList.remove("fullscreen");
  mainSection.classList.remove("fullscreen");

  btnTeacher.style.display = "inline-block";
  btnStudent.style.display = "inline-block";
  btnShareScreen.style.display = "none";
  btnCloseSession.style.display = "none";

  status.textContent = "";
}

/* --------------------- Buttons --------------------- */

btnTeacher.onclick = () => {
  const val = roomInput.value.trim();
  if (!val) { alert("Please enter a room name."); return; }
  roomName = val;
  isTeacher = true;
  updateUIForRole();
  connectSignaling(roomName, "teacher");
};

btnStudent.onclick = () => {
  const val = roomInput.value.trim();
  if (!val) { alert("Please enter a room name."); return; }
  roomName = val;
  isTeacher = false;
  updateUIForRole();
  connectSignaling(roomName, "student");
};

btnShareScreen.onclick = () => {
  if (!isSharing) startSharing();
  else stopSharing();
};

btnCloseSession.onclick = () => {
  resetToSetup();
};

/* --------------------- End --------------------- */
