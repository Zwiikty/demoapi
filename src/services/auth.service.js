const prisma = require('../../prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
    
exports.register = async (firstName, lastName, email, phone ,password) => {
    const existingUser = await prisma.user.findUnique({
        where: { email } 
    });
    if (existingUser) {
        throw new Error('Email is already registered');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
        data: { firstName, lastName, email, phone, password: hashedPassword, role: 'CUSTOMER'},
    });
    return {id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role};
};

exports.login = async (email, password) => {
    const user = await prisma.user.findUnique({ 
        where: { email }
    });
    if (!user) {
        throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Invalid email or password');
    }

    const token = jwt.sign({ userId: user.id, email: user.email },
        process.env.JWT_SECRET, {expiresIn: '1h'}
    );
    return {token};
}