const authService = require('../services/auth.service');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const prisma = require('../../prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

exports.register = async ( req, res ) => {
    try {
        const { firstName, lastName, email, phone, password } = req.body;
        const user = await authService.register( firstName, lastName, email, phone, password );
        res.status(201).json({ message: 'Register successful', user });
    } catch ( error ) {
        res.status(400).json({ message: error.message });
    }
};

exports.login = async ( req, res) => {
    try {
        const { email, password } = req.body;
        //console.log('Login attempt:', email);
        const data = await authService.login( email, password );
        //console.log('Login success:', data);
        res.status(200).json({ message: 'Login successful', token: data.token });
    } catch ( error ) {
        res.status(400).json({ message: error.message });
    }
};

exports.logout = async (req, res) => {
    try {
        res.status(200).json({ message: 'Logout successful'});
    } catch (error) {
        res.status(500).json({ message: 'Logout failed', error: error.message });
    }
}

exports.adminRoute = [
    authenticate,
    authorize([ 'ADMIN' ]),
    ( req, res ) => {
        res.status(200).json({ message: 'Welcome Admin', user: req.user });
    }
];

exports.customerRoute = [
    authenticate,
    authorize([ 'ADMIN', 'CUSTOMER' ]),
    ( req, res ) => {
        res.status(200).json({ message: 'Welcome Customer', user: req.user });
    }
];

exports.forgetPassword = async (req, res) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return res.status(400).json({ message: 'User not found' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 1000 * 60 * 15);
    await prisma.user.update({
        where: { email },
        data: {
            resetToken: token,
            resetTokenExp: exp,
        }
    });
    console.log('Reset password token:',token);
    res.json({ message: 'Token to reset :',token});
};

exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    const user = await prisma.user.findFirst({
        where: {
            resetToken: token,
            resetTokenExp: { gte: new Date() }
        }
    });
    if (!user) {
        return res.status(400).json({ message: 'Invalid or expired token'});
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashed,
            resetToken: null,
            resetTokenExp: null
        }
    });
    res.json({ message: 'Password has been reset successfully' });
};