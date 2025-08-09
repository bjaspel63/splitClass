const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // use UUIDs for student IDs

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {}; 
// rooms = {
//   roomName: {
//     teacher: ws,
//     students: { studentId: ws, ... }
//   }
// }

wss.on('connection', (ws) => {
  ws.id = uuidv4(); // unique id for every connection

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }
    const { type, room, payload, to } = data;
    if (!room) return;

    if (!rooms[room]) rooms[room] = { teacher: null, students: {} };

    switch(type) {
      case 'join':
        if (payload.role === 'teacher') {
          rooms[room].teacher = ws;
          ws.role = 'teacher';
          ws.room = room;
          ws.id = 'teacher'; // fixed id for teacher
          // send joined info with current students
          ws.send(JSON.stringify({ 
            type: 'joined', 
            role: 'teacher', 
            students: Object.keys(rooms[room].students) 
          }));
          console.log(`Teacher joined room ${room}`);
        } else {
          // Student join: assign id and store
          ws.role = 'student';
          ws.room = room;
          const studentId = ws.id; 
          rooms[room].students[studentId] = ws;

          // Inform student of their id
          ws.send(JSON.stringify({ type: 'joined', role: 'student', id: studentId }));

          // Notify teacher a new student joined
          const teacher = rooms[room].teacher;
          if (teacher && teacher.readyState === WebSocket.OPEN) {
            teacher.send(JSON.stringify({ type: 'student-joined', id: studentId }));
          }
          console.log(`Student ${studentId} joined room ${room}`);
        }
        break;

      case 'offer':
        if (ws.role === 'teacher' && to) {
          // Send offer from teacher to specific student
          const studentWs = rooms[room].students[to];
          if (studentWs && studentWs.readyState === WebSocket.OPEN) {
            studentWs.send(JSON.stringify({ type: 'offer', payload }));
            console.log(`Offer sent from teacher to student ${to} in room ${room}`);
          }
        }
        break;

      case 'answer':
        if (ws.role === 'student') {
          const teacher = rooms[room].teacher;
          if (teacher && teacher.readyState === WebSocket.OPEN) {
            teacher.send(JSON.stringify({ type: 'answer', payload, from: ws.id }));
            console.log(`Answer sent from student ${ws.id} to teacher in room ${room}`);
          }
        }
        break;

      case 'candidate':
        if (ws.role === 'teacher' && to) {
          // Candidate from teacher to specific student
          const studentWs = rooms[room].students[to];
          if (studentWs && studentWs.readyState === WebSocket.OPEN) {
            studentWs.send(JSON.stringify({ type: 'candidate', payload }));
            console.log(`Candidate sent from teacher to student ${to} in room ${room}`);
          }
        } else if (ws.role === 'student') {
          // Candidate from student to teacher
          const teacher = rooms[room].teacher;
          if (teacher && teacher.readyState === WebSocket.OPEN) {
            teacher.send(JSON.stringify({ type: 'candidate', payload, from: ws.id }));
            console.log(`Candidate sent from student ${ws.id} to teacher in room ${room}`);
          }
        }
        break;

      case 'leave':
        // client leaving voluntarily
        if (ws.role === 'student') {
          delete rooms[room].students[ws.id];
          // Notify teacher
          const teacher = rooms[room].teacher;
          if (teacher && teacher.readyState === WebSocket.OPEN) {
            teacher.send(JSON.stringify({ type: 'student-left', id: ws.id }));
          }
          console.log(`Student ${ws.id} left room ${room}`);
        } else if (ws.role === 'teacher') {
          // Teacher leaves, notify all students
          const students = rooms[room].students;
          Object.values(students).forEach(s => {
            if (s.readyState === WebSocket.OPEN) {
              s.send(JSON.stringify({ type: 'teacher-left' }));
            }
          });
          delete rooms[room];
          console.log(`Teacher left and room ${room} closed`);
        }
        break;
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room || !rooms[room]) return;

    if (ws.role === 'teacher') {
      // Teacher disconnected, notify all students and remove room
      const students = rooms[room].students;
      Object.values(students).forEach(s => {
        if (s.readyState === WebSocket.OPEN) {
          s.send(JSON.stringify({ type: 'teacher-left' }));
        }
      });
      delete rooms[room];
      console.log(`Teacher disconnected and room ${room} closed`);
    } else if (ws.role === 'student') {
      // Remove student and notify teacher
      delete rooms[room].students[ws.id];
      const teacher = rooms[room].teacher;
      if (teacher && teacher.readyState === WebSocket.OPEN) {
        teacher.send(JSON.stringify({ type: 'student-left', id: ws.id }));
      }
      console.log(`Student ${ws.id} disconnected from room ${room}`);
    }
  });
});

console.log(`Signaling server running on port ${PORT}`);
