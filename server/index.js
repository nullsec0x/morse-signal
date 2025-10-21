const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, '../public')));

const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      messages: [],
      createdAt: Date.now()
    });
  }
  return rooms.get(roomId);
}

setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && Date.now() - room.createdAt > 3600000) {
      rooms.delete(roomId);
    }
  }
}, 60000);

io.on('connection', (socket) => {
  let currentRoom = null;
  let username = null;

  console.log(`New connection: ${socket.id}`);

  socket.on('join-room', (roomId, user) => {
    const room = getRoom(roomId);

    if (room.users.size >= 2) {
      socket.emit('room-full');
      return;
    }

    if (currentRoom) {
      socket.leave(currentRoom);
      const prevRoom = rooms.get(currentRoom);
      if (prevRoom) {
        prevRoom.users.delete(socket.id);
        socket.to(currentRoom).emit('user-left', username);
      }
    }

    currentRoom = roomId;
    username = user || `NODE_${socket.id.substring(0, 4).toUpperCase()}`;

    socket.join(roomId);
    room.users.set(socket.id, { username, joinedAt: Date.now() });

    socket.to(roomId).emit('user-joined', username);

    const usersInRoom = Array.from(room.users.values()).map(u => u.username);
    socket.emit('room-joined', {
      roomId,
      users: usersInRoom,
      messages: room.messages.slice(-50)
    });

    console.log(`User ${username} joined room ${roomId}`);
  });

  socket.on('morse-message', (data) => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const userData = room.users.get(socket.id);
    if (!userData) return;

    console.log(`Message from ${userData.username}: "${data.message}" (Morse: ${data.morse})`);

    const messageData = {
      type: 'message',
      message: data.message,
      morse: data.morse,
      username: userData.username,
      timestamp: data.timestamp || Date.now(),
      id: Date.now() + Math.random()
    };

    room.messages.push(messageData);

    socket.to(currentRoom).emit('morse-message', messageData);

    socket.emit('morse-message-sent', messageData);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} (${username})`);

    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const userData = room.users.get(socket.id);
        room.users.delete(socket.id);

        if (userData) {
          socket.to(currentRoom).emit('user-left', userData.username);
        }

        if (room.users.size === 0) {
          setTimeout(() => {
            if (rooms.get(currentRoom)?.users.size === 0) {
              rooms.delete(currentRoom);
            }
          }, 30000);
        }
      }
    }
  });

  socket.on('request-room-id', () => {
    const roomId = generateRoomId();
    socket.emit('room-id-generated', roomId);
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce((sum, room) => sum + room.users.size, 0)
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Morse Signal server running on http://${HOST}:${PORT}`);
  console.log(`📍 Local access: http://localhost:${PORT}`);
  console.log(`📱 Network access: http://YOUR_IP:${PORT}`);

  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  console.log(`\n🌐 Your network IP addresses:`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   → http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`\n💡 Connect from phone using any of the above IPs!`);
});
