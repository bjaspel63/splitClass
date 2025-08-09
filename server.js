const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {}; // roomName -> { teacher: ws, students: Map studentId->ws, nextStudentId: number }

wss.on('connection', (ws) => {
  ws.id = null;
  ws.role = null;
  ws.room = null;

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }
    const { type, room, payload, to } = data;

    if (!room) return;

    // Initialize room if not exist
    if (!rooms[room]) {
      rooms[room] = {
        teacher: null,
        students: new Map(),
        nextStudentId: 1,
      };
    }

    const currentRoom = rooms[room];

    switch(type) {
      case 'join':
        if (payload.role === 'teacher') {
          currentRoom.teacher = ws;
          ws.role = 'teacher';
          ws.room = room;
          ws.id = 'teacher';
          // Send back joined + existing student IDs
          ws.send(JSON.stringify({
            type: 'joined',
            role: 'teacher',
            students: Array.from(currentRoom.students.keys())
          }));
        } else if (payload.role === 'student') {
          // Assign unique student ID
          const studentId = `student${currentRoom.nextStudentId++}`;
          ws.role = 'student';
          ws.room = room;
          ws.id = studentId;
          currentRoom.students.set(studentId, ws);

          // Send joined message with ID
          ws.send(JSON.stringify({
            type: 'joined',
            role: 'student',
            id: studentId
          }));

          // Notify teacher about new student
          if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
            currentRoom.teacher.send(JSON.stringify({
              type: 'student-joined',
              id: studentId
            }));
          }
        }
        break;

      case 'offer':
        if (ws.role === 'teacher' && to && currentRoom.students.has(to)) {
          const studentWs = currentRoom.students.get(to);
          if (studentWs.readyState === WebSocket.OPEN) {
            studentWs.send(JSON.stringify({
              type: 'offer',
              payload,
              from: 'teacher'
            }));
          }
        }
        break;

      case 'answer':
        if (ws.role === 'student' && currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
          currentRoom.teacher.send(JSON.stringify({
            type: 'answer',
            payload,
            from: ws.id
          }));
        }
        break;

      case 'candidate':
        if (ws.role === 'teacher' && to && currentRoom.students.has(to)) {
          const studentWs = currentRoom.students.get(to);
          if (studentWs.readyState === WebSocket.OPEN) {
            studentWs.send(JSON.stringify({
              type: 'candidate',
              payload,
              from: 'teacher'
            }));
          }
        } else if (ws.role === 'student' && currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
          currentRoom.teacher.send(JSON.stringify({
            type: 'candidate',
            payload,
            from: ws.id
          }));
        }
        break;

      case 'leave':
        // Student or teacher leave handling
        if (ws.role === 'student') {
          if (currentRoom.students.has(ws.id)) {
            currentRoom.students.delete(ws.id);
            if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
              currentRoom.teacher.send(JSON.stringify({
                type: 'student-left',
                id: ws.id
              }));
            }
          }
          ws.room = null;
          ws.id = null;
          ws.role = null;
        } else if (ws.role === 'teacher') {
          // Notify all students teacher left
          currentRoom.students.forEach(studentWs => {
            if (studentWs.readyState === WebSocket.OPEN) {
              studentWs.send(JSON.stringify({ type: 'teacher-left' }));
              studentWs.room = null;
              studentWs.id = null;
              studentWs.role = null;
            }
          });
          delete rooms[room];
          ws.room = null;
          ws.id = null;
          ws.role = null;
        }
        break;
    }
  });

  ws.on('close', () => {
    if (!ws.room || !rooms[ws.room]) return;
    const currentRoom = rooms[ws.room];

    if (ws.role === 'teacher') {
      // Notify all students teacher left
      currentRoom.students.forEach(studentWs => {
        if (studentWs.readyState === WebSocket.OPEN) {
          studentWs.send(JSON.stringify({ type: 'teacher-left' }));
          studentWs.room = null;
          studentWs.id = null;
          studentWs.role = null;
        }
      });
      delete rooms[ws.room];
    } else if (ws.role === 'student') {
      if (currentRoom.students.has(ws.id)) {
        currentRoom.students.delete(ws.id);
        if (currentRoom.teacher && currentRoom.teacher.readyState === WebSocket.OPEN) {
          currentRoom.teacher.send(JSON.stringify({
            type: 'student-left',
            id: ws.id
          }));
        }
      }
    }

    ws.room = null;
    ws.id = null;
    ws.role = null;
  });
});

console.log(`Signaling server running on port ${PORT}`);
