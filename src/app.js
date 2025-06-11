require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');

app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
}));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/courts', require('./routes/court.routes'));
app.use('/api/payment', require('./routes/payment.routes'));
app.use('/slips', express.static(path.join(__dirname, 'src/uploads/slips')));


module.exports = app;

