const express = require('express');
const app = require('./src/app');
const http = require('http');
const prisma = require('./prisma/client');
const { Server } = require('socket.io');
const socketAuthMiddleware = require('./src/middleware/socketauth.middleware');
const { disconnect } = require('process');
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('Attempting to connect to database...');
    await prisma.$connect();
    console.log('Connected to database');
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        credentials: true
      }
    });

    const courtRoutes = require('./src/routes/court.routes')(io);
    app.use('/api/courts', courtRoutes);
    
    app.set('io', io);
    socketAuthMiddleware(io);
    io.on('connection', (socket) => {
      if (!socket.user) {
        console.log('Unauthenticated socket tried to connect');
        return socket.disconnect(true);
      }
      const { id, role } = socket.user;
      console.log(`Socket connected: User ${id} (${role})` );
      if (role === 'ADMIN') {
        socket.join('admins');
      }  else if (role === 'CUSTOMER') {
        socket.join(`user_${id}`);
      }
      socket.on('disconnect', () => {
        console.log(`User ${id} disconnected`);
      });
    });
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

startServer();

