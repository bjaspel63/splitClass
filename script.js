const signalingUrl = "wss://splitclass-production.up.railway.app"; 

const video = document.getElementById("video");
const roomInput = document.getElementById("roomInput");
const btnTeacher = document.getElementById("btnTeacher");
const btnStudent = document.getElementById("btnStudent");
const btnShareScreen = document.getElementById("btnShareScreen");
const status = document.getElementById("status");
const setupSection = document.getElementById("setup");
const mainSection = document.getElementById("main");
const teacherDisconnected = document.getElementById("teacherDisconnected");

let ws;
let pc;
let roomName;
let isTeacher = false;
let screenStream = null;
let isSharing = false;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Send JSON message via WebSocket
function sendSignal(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// Connect signaling server & handle messages
function connectSignaling(room, role) {
  ws = new WebSocket(signalingUrl);

  ws.onopen = () => {
    sendSignal({ type: "join", room, payload: { role } });
    status.textContent = "Connected to signaling server.";
  };

  ws.onmessage = async (msg) => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch (e) {
      return;
    }

    if (data.type === "joined") {
      status.textContent = `Joined room as ${data.role}.`;
      if (role === "teacher") {
        btnShareScreen.disabled = false;
      }
    } else if (data.type === "new-student" && role === "teacher") {
      await createOfferToStudents();
    } else if (data.type === "offer" && role === "student") {
      await handleOffer(data.payload);
    } else if (data.type === "answer" && role === "teacher") {
      await handleAnswer(data.payload);
    } else if (data.type === "candidate") {
      if (pc) {
        try {
          await pc.addIceCandidate(data.payload);
        } catch (e) {
          console.warn("Failed to add ICE candidate", e);
        }
      }
    } else if (data.type === "teacher-left") {
      teacherDisconnected.classList.remove("hidden");
      teacherDisconnected.classList.add("visible");
      btnShareScreen.disabled = true;
    }
  };

  ws.onclose = () => {
    status.textContent = "Disconnected from signaling server.";
    teacherDisconnected.classList.add("hidden");
    teacherDisconnected.classList.remove("visible");
    btnShareScreen.disabled = true;
  };

  ws.onerror = () => {
    status.textContent = "Signaling server error.";
  };
}

// Teacher: create offer and send to all students
async function createOfferToStudents() {
  if (!pc) return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal({ type: "offer", room: roomName, payload: offer });
}

// Student: receive offer, set remote desc, create answer
async function handleOffer(offer) {
  pc = new RTCPeerConnection(rtcConfig);

  pc.ontrack = (event) => {
    teacherDisconnected.classList.add("hidden");
    teacherDisconnected.classList.remove("visible");
    setupSection.classList.add("hidden");
    mainSection.classList.remove("hidden");
    video.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ type: "candidate", room: roomName, payload: event.candidate });
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal({ type: "answer", room: roomName, payload: answer });
}

// Teacher: receive answer from student and set remote desc
async function handleAnswer(answer) {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function startSharing() {
  // Close old connection and stop old stream if exist
  if (pc) {
    pc.close();
    pc = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

    setupSection.classList.add("hidden");
    mainSection.classList.remove("hidden");
    teacherDisconnected.classList.add("hidden");
    teacherDisconnected.classList.remove("visible");

    video.srcObject = screenStream;

    pc = new RTCPeerConnection(rtcConfig);
    screenStream.getTracks().forEach((track) => pc.addTrack(track, screenStream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "candidate", room: roomName, payload: event.candidate });
      }
    };

    btnShareScreen.textContent = "Stop Sharing";
    isSharing = true;

    document.getElementById("leftPane").classList.add("fullscreen");

    screenStream.getVideoTracks()[0].addEventListener("ended", () => {
      stopSharing();
    });

    await createOfferToStudents();
  } catch (err) {
    alert("Screen share permission denied or error: " + err.message);
    status.textContent = "Screen share permission denied.";
  }
}

function stopSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  const leftPane = document.getElementById("leftPane");
  leftPane.classList.remove("fullscreen");

  video.srcObject = null;

  if (pc) {
    pc.close();
    pc = null;
  }

  btnShareScreen.textContent = "Share Screen";
  isSharing = false;
}

// Update UI buttons visibility based on role
function updateUIForRole() {
  if (isTeacher) {
    btnStudent.style.display = "none";
    btnTeacher.style.display = "inline-block";
    btnShareScreen.style.display = "inline-block";
    btnShareScreen.disabled = false;
  } else {
    btnStudent.style.display = "inline-block";
    btnTeacher.style.display = "none";
    btnShareScreen.style.display = "none";
  }
}

btnTeacher.onclick = () => {
  const val = roomInput.value.trim();
  if (!val) {
    alert("Please enter a room name.");
    return;
  }
  roomName = val;
  isTeacher = true;
  updateUIForRole();
  connectSignaling(roomName, "teacher");
};

btnStudent.onclick = () => {
  const val = roomInput.value.trim();
  if (!val) {
    alert("Please enter a room name.");
    return;
  }
  roomName = val;
  isTeacher = false;
  updateUIForRole();
  connectSignaling(roomName, "student");
};

btnShareScreen.onclick = () => {
  if (!isSharing) {
    startSharing();
  } else {
    stopSharing();
  }
};
