require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');

const ImagePath = process.env.SLIPS_DIR || path.resolve(__dirname, 'uploads/slips');
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(express.json());

// Preflight (OPTIONS)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.sendStatus(204);
  }
  next();
});

// CORS
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (LOCALHOST_RE.test(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Static slips
app.use('/slips', express.static(ImagePath));

// ===== Existing routes =====
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/payment', require('./routes/payment.routes'));
const notiRoutes = require('./routes/noti.routes');
app.use('/api/notification', notiRoutes);

// ===== NEW: device token route (FCM) =====
app.use('/api/device-token', require('./routes/deviceToken.routes'));

app.get('/', (_req, res) => res.status(200).send('OK'));

module.exports = app;