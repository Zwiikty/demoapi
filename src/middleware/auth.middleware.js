const jwt = require('jsonwebtoken');
const prisma = require('../../prisma/client');

const authenticate = async ( req, res, next ) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.'});
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    } catch ( error ) {
        res.status(400).json({ message: 'Invalid token' });
    }
};

const authorize = (roles) => {
    return (req, res, next) => {
        if (!roles.includes( req.user.role ) ) {
            return res.status(403).json({ message: 'Access forbidden'});
        }
        next();
    };
};

module.exports = {
    authenticate,
    authorize
  };
  