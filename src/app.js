require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const ImagePath = path.resolve(__dirname, 'uploads/slips');
//console.log('Static files served from:', ImagePath);

app.use(express.json());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin.startsWith('http://localhost:')) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use('/slips', express.static(ImagePath));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
//app.use('/api/courts', require('./routes/court.routes'));
app.use('/api/payment', require('./routes/payment.routes'));
const notiRoutes = require('./routes/noti.routes');
app.use('/api/notification', notiRoutes);


module.exports = app;

