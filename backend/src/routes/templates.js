const express = require('express');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/templates
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, page_size, orientation, is_default, created_at, updated_at FROM templates ORDER BY created_at DESC');
  res.json(rows);
}));

// GET /api/templates/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM templates WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Template not found.' });
  res.json(row);
}));

// POST /api/templates  { name, pageSize, orientation, canvasJson }
router.post('/', asyncHandler(async (req, res) => {
  const { name, pageSize, orientation, canvasJson } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required.' });
  const [result] = await pool.query(
    'INSERT INTO templates (name, page_size, orientation, canvas_json) VALUES (?, ?, ?, ?)',
    [name.trim(), pageSize || 'A5', orientation || 'landscape', JSON.stringify(canvasJson || {})]
  );
  res.json({ id: result.insertId, success: true });
}));

// PUT /api/templates/:id  { name, pageSize, orientation, canvasJson }
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, pageSize, orientation, canvasJson } = req.body;
  await pool.query(
    'UPDATE templates SET name = ?, page_size = ?, orientation = ?, canvas_json = ? WHERE id = ?',
    [name, pageSize, orientation, JSON.stringify(canvasJson || {}), req.params.id]
  );
  res.json({ success: true });
}));

// POST /api/templates/:id/duplicate
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM templates WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Template not found.' });
  const [result] = await pool.query(
    'INSERT INTO templates (name, page_size, orientation, canvas_json) VALUES (?, ?, ?, ?)',
    [`${row.name} (Copy)`, row.page_size, row.orientation, JSON.stringify(row.canvas_json)]
  );
  res.json({ id: result.insertId, success: true });
}));

// PUT /api/templates/:id/set-default
router.put('/:id/set-default', asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE templates SET is_default = 0');
    await conn.query('UPDATE templates SET is_default = 1 WHERE id = ?', [req.params.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ success: true });
}));

// DELETE /api/templates/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
