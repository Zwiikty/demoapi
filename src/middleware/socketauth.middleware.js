const jwt = require('jsonwebtoken');
const prisma = require('../../prisma/client');


const socketAuthMiddleware = (io) => {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Access denied. No token provided.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

      if (!user) {
        return next(new Error('Invalid token or user not found'));
      }

      socket.user = {
        id: user.id,
        role: user.role,
      };
      next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });
};

module.exports = socketAuthMiddleware;
