const signalingUrl = "wss://splitclass-production.up.railway.app";

const video = document.getElementById("video");
const roomInput = document.getElementById("roomInput");
const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnCloseSessionTeacher = document.getElementById("btnCloseSession"); // shared ID for both roles, handle carefully
const btnCloseSessionStudent = document.getElementById("btnCloseSession"); // same button for both; adjust usage if needed
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

const teacherControls = document.getElementById("teacherControls");
const studentControls = document.getElementById("studentControls");

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

/* --- UI Helpers --- */

function updateStudentCount() {
  if (!isTeacher) return;
  const count = Object.keys(teacherPeers).length;
  studentCountDisplay.textContent = count;

  if (count > 0) {
    studentsListContainer.style.display = "block";
    studentsList.innerHTML = "";
    for (const info of Object.values(teacherPeers)) {
      const li = document.createElement("li");
      li.textContent = info.name || "Anonymous";
      studentsList.appendChild(li);
    }
  } else {
    studentsListContainer.style.display = "none";
    studentsList.innerHTML = "";
  }
}

function updateUIForRole() {
  if (isTeacher) {
    leftPane.classList.remove("student-full");
    leftPane.classList.add("teacher-no-video");
    studentsListContainer.style.display = "block";
    video.style.display = "none";

    notesArea.classList.remove("hidden");
    editorFrame.classList.add("hidden");

    document.getElementById("rightPane").style.display = "flex";

    teacherControls.classList.remove("hidden");
    studentControls.classList.add("hidden");

  } else {
    leftPane.classList.remove("teacher-no-video");
    leftPane.classList.add("student-full");
    video.style.display = "block";
    studentsListContainer.style.display = "none";

    notesArea.classList.add("hidden");
    editorFrame.classList.remove("hidden");

    document.getElementById("rightPane").style.display = "flex";

    teacherControls.classList.add("hidden");
    studentControls.classList.remove("hidden");
  }
}

/**
 * Show joined info in setup section after role selected:
 * - Teacher: show only room name text (hide inputs and labels)
 * - Student: show student name and room name texts (hide inputs and labels)
 */
function showJoinedInfo() {
  studentNameInput.style.display = "none";
  studentNameInput.previousElementSibling.style.display = "none";
  roomInput.style.display = "none";
  roomInput.previousElementSibling.style.display = "none";

  if (isTeacher) {
    displayName.style.display = "none";
    displayRoom.textContent = roomName;
    displayRoom.style.display = "block";
  } else {
    displayName.textContent = studentName;
    displayName.style.display = "block";
    displayRoom.textContent = roomName;
    displayRoom.style.display = "block";
  }
}

/* --- Signaling & WebRTC --- */

function sendSignal(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function connectSignaling(room, role, extraPayload = {}) {
  console.log("Connecting as", role, "to room", room);
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
      case "joined":
        isTeacher = (data.role === "teacher");
        status.textContent = `Joined room as ${data.role}.`;

        roomName = room;
        studentName = extraPayload.name || "Anonymous";

        btnTeacher.style.display = "none";
        btnStudent.style.display = "none";

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
    status.textContent = "Disconnected from signaling server.";
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    status.textContent = "Signaling server error.";
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
  if (ws) {
    try {
      sendSignal({ type: "close", room: roomName });
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

  status.textContent = "Session closed.";
  setupSection.classList.remove("hidden");
  mainSection.classList.add("hidden");
  leftPane.classList.remove("teacher-no-video", "student-full");
  document.getElementById("rightPane").style.display = "flex";

  teacherControls.classList.add("hidden");
  studentControls.classList.add("hidden");

  btnShareScreen.style.display = "none";
  btnShareScreen.disabled = true;

  studentsListContainer.style.display = "none";
  studentCountDisplay.textContent = "0";

  for (const key in teacherPeers) delete teacherPeers[key];
  studentId = null;
  studentName = null;
  roomName = null;
  isTeacher = false;
  isSharing = false;
  studentsList.innerHTML = "";
  notesArea.value = "";

  displayName.style.display = "none";
  displayRoom.style.display = "none";

  studentNameInput.style.display = "block";
  studentNameInput.previousElementSibling.style.display = "block";
  roomInput.style.display = "block";
  roomInput.previousElementSibling.style.display = "block";
}

/* --- Event listeners --- */

btnTeacher.addEventListener("click", () => {
  roomName = roomInput.value.trim();
  const nameVal = studentNameInput.value.trim() || "Teacher";
  if (!roomName) {
    status.textContent = "Please enter a room name.";
    return;
  }
  isTeacher = true;
  connectSignaling(roomName, "teacher", { name: nameVal });
});

btnStudent.addEventListener("click", () => {
  roomName = roomInput.value.trim();
  const nameVal = studentNameInput.value.trim();
  if (!roomName) {
    status.textContent = "Please enter a room name.";
    return;
  }
  if (!nameVal) {
    status.textContent = "Please enter your name.";
    return;
  }
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

/* --- Init --- */

document.addEventListener("DOMContentLoaded", () => {
  status.textContent = "Enter room name and your name, then select role to join.";
  btnShareScreen.style.display = "none";
  teacherControls.classList.add("hidden");
  studentControls.classList.add("hidden");
  studentsListContainer.style.display = "none";
  notesArea.classList.add("hidden");
  editorFrame.classList.remove("hidden");
  displayName.style.display = "none";
  displayRoom.style.display = "none";
});