const express = require('express');
const app = require('./src/app');
const http = require('http');
const prisma = require('./prisma/client');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('Attempting to connect to database...');
    await prisma.$connect();
    console.log('Connected to database');
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || origin.startsWith('http://localhost:')) {
            return callback(null, true);
          }
          callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }
    });
    const courtRoutes = require('./src/routes/court.routes')(io);
    app.use('/api/courts', courtRoutes);
    app.set('io', io);

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

startServer();

