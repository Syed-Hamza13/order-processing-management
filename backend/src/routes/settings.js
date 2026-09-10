const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const brandingDir = path.join(__dirname, '..', '..', 'uploads', 'branding');
fs.mkdirSync(brandingDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, brandingDir),
  filename: (req, file, cb) => {
    const kind = req.params.kind; // 'logo' or 'favicon'
    const ext = path.extname(file.originalname);
    cb(null, `${kind}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/settings
router.get('/', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM app_settings WHERE id = 1');
  res.json(row);
}));

// POST /api/settings/upload/:kind   (kind = logo | favicon)
router.post('/upload/:kind', upload.single('file'), asyncHandler(async (req, res) => {
  const { kind } = req.params;
  if (!['logo', 'favicon'].includes(kind)) return res.status(400).json({ error: 'Invalid upload kind.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const url = `/uploads/branding/${req.file.filename}`;
  const column = kind === 'logo' ? 'logo_path' : 'favicon_path';
  await pool.query(`UPDATE app_settings SET ${column} = ? WHERE id = 1`, [url]);
  res.json({ success: true, url });
}));

module.exports = router;
