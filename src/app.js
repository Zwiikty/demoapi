require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const ImagePath = process.env.SLIPS_DIR || path.resolve(__dirname, 'uploads/slips');
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(express.json());
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

app.use('/slips', express.static(ImagePath));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/payment', require('./routes/payment.routes'));
const notiRoutes = require('./routes/noti.routes');
app.use('/api/notification', notiRoutes);

app.get('/', (_req, res) => res.status(200).send('OK'));
app.use((req, res) => res.status(404).json({ message: 'Not Found' }));
app.use((err, req, res, next) => {
  console.error('[AppError]', err.message);
  const code = err.message?.includes('CORS') ? 403 : 500;
  res.status(code).json({ message: err.message || 'Internal Server Error' });
});

module.exports = app;

