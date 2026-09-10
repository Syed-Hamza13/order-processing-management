const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'assets');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/image\/(png|jpe?g|svg\+xml)/.test(file.mimetype)) return cb(new Error('Only PNG, JPG, or SVG images are allowed.'));
    cb(null, true);
  },
});

// GET /api/assets
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM assets ORDER BY uploaded_at DESC');
  res.json(rows.map((r) => ({ ...r, url: `/uploads/assets/${r.filename}` })));
}));

// POST /api/assets  (multipart: file)
router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const [result] = await pool.query('INSERT INTO assets (filename, path) VALUES (?, ?)', [req.file.filename, `/uploads/assets/${req.file.filename}`]);
  res.json({ id: result.insertId, filename: req.file.filename, url: `/uploads/assets/${req.file.filename}` });
}));

// DELETE /api/assets/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
  if (row) {
    const filePath = path.join(uploadDir, row.filename);
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
  }
  await pool.query('DELETE FROM assets WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
