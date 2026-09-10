require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const fieldsRoutes = require('./routes/fields');
const dropdownsRoutes = require('./routes/dropdowns');
const formsRoutes = require('./routes/forms');
const ordersRoutes = require('./routes/orders');
const templatesRoutes = require('./routes/templates');
const assetsRoutes = require('./routes/assets');
const settingsRoutes = require('./routes/settings');
const pincodeRoutes = require('./routes/pincode');

const app = express();

// ---- Core security middleware ----
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images/uploads to be used by the frontend dev server
}));

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Basic rate limiting, tighter on the login endpoint to slow down brute force
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use(generalLimiter);
app.use('/api/auth/login', loginLimiter);

// Static file serving for uploaded assets/branding images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// This is a pure API server (the frontend serves its own favicon), so just answer
// quietly instead of logging a 404 every time a browser auto-requests /favicon.ico.
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ---- CSRF protection (cookie-based double-submit) ----
// The setup/login endpoints happen before a session exists, so they are exempt from CSRF
// (they are still protected by rate limiting above). Every other mutating request requires
// a valid CSRF token obtained from GET /api/csrf-token.
const csrfProtection = csurf({ cookie: { httpOnly: true, sameSite: 'lax' } });

app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use('/api/auth', authRoutes);

// Everything below requires both a valid login session AND a valid CSRF token on mutations
app.use('/api/fields', csrfProtection, requireAuth, fieldsRoutes);
app.use('/api/dropdowns', csrfProtection, requireAuth, dropdownsRoutes);
app.use('/api/forms', csrfProtection, requireAuth, formsRoutes);
app.use('/api/orders', csrfProtection, requireAuth, ordersRoutes);
app.use('/api/templates', csrfProtection, requireAuth, templatesRoutes);
app.use('/api/assets', csrfProtection, requireAuth, assetsRoutes);
app.use('/api/settings', csrfProtection, requireAuth, settingsRoutes);
app.use('/api/pincode', csrfProtection, requireAuth, pincodeRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

const PORT = process.env.PORT;

async function startServer() {
  try {
    const { initializeDatabase } = require('./db');
 
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `Eklavya Pitara backend running on http://0.0.0.0:${PORT}`,
      );
    });
  } catch (err) {
    console.error(
      'Server startup aborted because database initialization failed.',
    );
 
    process.exit(1);
  }
}

startServer();