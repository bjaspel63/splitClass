const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {}; // roomName -> { teacher: ws, students: [] }

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }
    const { type, room, payload } = data;

    if (!room) return;

    // Initialize room if not exist
    if (!rooms[room]) rooms[room] = { teacher: null, students: [] };

    switch(type) {
      case 'join':
        if (payload.role === 'teacher') {
          rooms[room].teacher = ws;
          ws.role = 'teacher';
          ws.room = room;
          ws.send(JSON.stringify({ type: 'joined', role: 'teacher' }));
        } else {
          rooms[room].students.push(ws);
          ws.role = 'student';
          ws.room = room;
          ws.send(JSON.stringify({ type: 'joined', role: 'student' }));
          if (rooms[room].teacher && rooms[room].teacher.readyState === WebSocket.OPEN) {
            rooms[room].teacher.send(JSON.stringify({ type: 'new-student' }));
          }
        }
        break;

      case 'offer':
        if (ws.role === 'teacher') {
          // send offer to all students
          rooms[room].students.forEach(student => {
            if (student.readyState === WebSocket.OPEN) {
              student.send(JSON.stringify({ type: 'offer', payload }));
            }
          });
        }
        break;

      case 'answer':
        if (ws.role === 'student' && rooms[room].teacher && rooms[room].teacher.readyState === WebSocket.OPEN) {
          rooms[room].teacher.send(JSON.stringify({ type: 'answer', payload, from: ws }));
        }
        break;

      case 'candidate':
        if (ws.role === 'teacher') {
          // candidate from teacher to students (broadcast)
          rooms[room].students.forEach(student => {
            if (student.readyState === WebSocket.OPEN) {
              student.send(JSON.stringify({ type: 'candidate', payload }));
            }
          });
        } else if (ws.role === 'student' && rooms[room].teacher && rooms[room].teacher.readyState === WebSocket.OPEN) {
          // candidate from student to teacher
          rooms[room].teacher.send(JSON.stringify({ type: 'candidate', payload, from: ws }));
        }
        break;
    }
  });

  ws.on('close', () => {
    if (!ws.room || !rooms[ws.room]) return;
    if (ws.role === 'teacher') {
      // Notify all students teacher left
      rooms[ws.room].students.forEach(student => {
        if (student.readyState === WebSocket.OPEN) {
          student.send(JSON.stringify({ type: 'teacher-left' }));
        }
      });
      delete rooms[ws.room];
    } else if (ws.role === 'student') {
      rooms[ws.room].students = rooms[ws.room].students.filter(s => s !== ws);
    }
  });
});

console.log(`Signaling server running on port ${PORT}`);
