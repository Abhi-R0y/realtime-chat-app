const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active users and chat history
const activeUsers = new Map();
const chatHistory = [];
const MAX_HISTORY = 50;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('join', (userData) => {
    const user = {
      id: socket.id,
      username: userData.username || `User${Date.now()}`,
      joinedAt: new Date().toISOString()
    };
    
    activeUsers.set(socket.id, user);
    
    // Send welcome message to user
    socket.emit('welcome', {
      message: 'Welcome to the chat!',
      user: user,
      chatHistory: chatHistory.slice(-20) // Send last 20 messages
    });
    
    // Broadcast user joined to others
    socket.broadcast.emit('userJoined', {
      user: user,
      message: `${user.username} joined the chat`
    });
    
    // Send updated user list to all clients
    io.emit('userList', Array.from(activeUsers.values()));
    
    console.log(`${user.username} joined the chat`);
  });

  // Handle new messages
  socket.on('message', (messageData) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now(),
      text: messageData.text,
      user: user,
      timestamp: new Date().toISOString(),
      type: 'message'
    };

    // Add to chat history
    chatHistory.push(message);
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory.shift();
    }

    // Broadcast message to all clients
    io.emit('message', message);
    
    console.log(`${user.username}: ${message.text}`);
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    
    socket.broadcast.emit('userTyping', {
      user: user,
      isTyping: data.isTyping
    });
  });

  // Handle private messages
  socket.on('privateMessage', (data) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) return;

    const message = {
      id: Date.now(),
      text: data.text,
      sender: sender,
      recipient: data.recipient,
      timestamp: new Date().toISOString(),
      type: 'private'
    };

    // Send to recipient
    const recipientSocket = Array.from(activeUsers.entries())
      .find(([id, user]) => user.username === data.recipient);
    
    if (recipientSocket) {
      io.to(recipientSocket[0]).emit('privateMessage', message);
      socket.emit('privateMessage', message); // Send back to sender
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      activeUsers.delete(socket.id);
      
      // Broadcast user left
      socket.broadcast.emit('userLeft', {
        user: user,
        message: `${user.username} left the chat`
      });
      
      // Send updated user list
      io.emit('userList', Array.from(activeUsers.values()));
      
      console.log(`${user.username} disconnected`);
    }
  });
});

// API Routes
app.get('/api/stats', (req, res) => {
  res.json({
    activeUsers: activeUsers.size,
    totalMessages: chatHistory.length,
    uptime: process.uptime()
  });
});

app.get('/api/history', (req, res) => {
  res.json(chatHistory.slice(-20));
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to access the chat`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});