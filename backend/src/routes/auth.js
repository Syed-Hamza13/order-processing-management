const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true, 
  sameSite: 'lax',
  // secure: true, // enable once served over HTTPS
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

// GET /api/auth/setup-status  -> tells frontend whether the one-time setup screen should show
router.get('/setup-status', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT COUNT(*) as c FROM users');
  res.json({ needsSetup: row.c === 0 });
}));

// POST /api/auth/setup  -> creates the single admin user (only allowed if none exists yet)
router.post('/setup', asyncHandler(async (req, res) => {
  const { email, password, retypePassword } = req.body;
  const [[row]] = await pool.query('SELECT COUNT(*) as c FROM users');
  if (row.c > 0) {
    return res.status(400).json({ error: 'Setup has already been completed.' });
  }
  if (!email || !password || !retypePassword) {
    return res.status(400).json({ error: 'Email, password and retype password are all required.' });
  }
  if (password !== retypePassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email.trim().toLowerCase(), hash]);
  res.json({ success: true });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [(email || '').trim().toLowerCase()]);
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('session', token, COOKIE_OPTS);
  res.json({ success: true, email: user.email });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, retypePassword } = req.body;
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.userId]);
  const ok = await bcrypt.compare(currentPassword || '', user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (newPassword !== retypePassword) return res.status(400).json({ error: 'New passwords do not match.' });
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  res.json({ success: true });
}));

module.exports = router;
