
const app = require('./src/app');
const http = require('http');
const prisma = require('./prisma/client');
const { Server } = require('socket.io');
const PORT = process.env.PORT || 3000;
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

async function startServer() {
  try {
    console.log('Attempting to connect to database...');
    await prisma.$connect();
    console.log('Connected to database');

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: (origin, cb) => {
          if (!origin) return cb(null, true);
          if (LOCALHOST_RE.test(origin)) return cb(null, true);
          return cb(new Error('Not allowed by CORS (socket)'));
        },
        methods: ['GET','POST','PUT','PATCH','DELETE'],
        credentials: true
      }
    });

    // ---- routes that need io ----
    const courtRoutes = require('./src/routes/court.routes')(io);
    app.use('/api/courts', courtRoutes);

    // expose io for other modules if needed
    app.set('io', io);

    // ---- socket auth + rooms ----
    const socketAuthMiddleware = require('./src/middleware/socketauth.middleware');
    socketAuthMiddleware(io);

    const setupNotificationScheduler = require('./src/controllers/notiSchedur.controller');
    setupNotificationScheduler(io);

    io.on('connection', (socket) => {
      if (!socket.user) {
        console.log('Unauthenticated socket tried to connect');
        return socket.disconnect(true);
      }
      const { id, role } = socket.user;
      console.log(`Socket connected: User ${id} (${role})`);
      if (role === 'ADMIN') {
        socket.join('admins');
      } else if (role === 'CUSTOMER') {
        socket.join(`user_${id}`);
      }
      socket.on('disconnect', () => {
        console.log(`User ${id} disconnected`);
      });
    });

    // fallbacks
    app.use((req, res) => res.status(404).json({ message: 'Not Found' }));
    app.use((err, req, res, next) => {
      console.error('[AppError]', err.message);
      const code = err.message?.includes('CORS') ? 403 : 500;
      res.status(code).json({ message: err.message || 'Internal Server Error' });
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