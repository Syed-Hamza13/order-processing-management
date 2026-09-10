const express = require('express');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { getDropdownUsage } = require('../utils/usage');
const { getFieldUsage } = require('../utils/usage');

const router = express.Router();

// GET /api/dropdowns  -> list with options
router.get('/', asyncHandler(async (req, res) => {
  const [dropdowns] = await pool.query('SELECT * FROM dropdowns ORDER BY created_at DESC');
  const [options] = await pool.query('SELECT * FROM dropdown_options ORDER BY sort_order ASC, id ASC');
  const byDropdown = {};
  options.forEach((o) => {
    byDropdown[o.dropdown_id] = byDropdown[o.dropdown_id] || [];
    byDropdown[o.dropdown_id].push(o);
  });
  res.json(dropdowns.map((d) => ({ ...d, options: byDropdown[d.id] || [] })));
}));

// POST /api/dropdowns  { name }
router.post('/', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Dropdown name is required.' });
  const [result] = await pool.query('INSERT INTO dropdowns (name) VALUES (?)', [name.trim()]);
  res.json({ id: result.insertId, name: name.trim(), options: [] });
}));

// GET /api/dropdowns/:id/usage -> fields using it, and (transitively) forms using those fields
router.get('/:id/usage', asyncHandler(async (req, res) => {
  const fieldsUsing = await getDropdownUsage(Number(req.params.id));
  const detailed = [];
  for (const f of fieldsUsing) {
    const forms = await getFieldUsage(f.id);
    detailed.push({ field: f, forms });
  }
  res.json({ fields: detailed });
}));

// PUT /api/dropdowns/:id  { name }
router.put('/:id', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Dropdown name is required.' });
  await pool.query('UPDATE dropdowns SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
  res.json({ success: true });
}));

// DELETE /api/dropdowns/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const fieldsUsing = await getDropdownUsage(id);
  if (fieldsUsing.length > 0) {
    return res.status(409).json({
      error: 'This dropdown is still linked to one or more fields and cannot be deleted.',
      usedIn: fieldsUsing,
    });
  }
  await pool.query('DELETE FROM dropdowns WHERE id = ?', [id]);
  res.json({ success: true });
}));

// ---- Options ----

// POST /api/dropdowns/:id/options  { label, value }
router.post('/:id/options', asyncHandler(async (req, res) => {
  const { label, value } = req.body;
  if (!label || !value) return res.status(400).json({ error: 'Both label and value are required.' });
  const [[{ maxOrder }]] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM dropdown_options WHERE dropdown_id = ?',
    [req.params.id]
  );
  const [result] = await pool.query(
    'INSERT INTO dropdown_options (dropdown_id, label, value, sort_order) VALUES (?, ?, ?, ?)',
    [req.params.id, label.trim(), value.trim(), maxOrder + 1]
  );
  res.json({ id: result.insertId, label, value });
}));

// PUT /api/dropdowns/options/:optionId  { label, value }
router.put('/options/:optionId', asyncHandler(async (req, res) => {
  const { label, value } = req.body;
  if (!label || !value) return res.status(400).json({ error: 'Both label and value are required.' });
  await pool.query('UPDATE dropdown_options SET label = ?, value = ? WHERE id = ?', [label.trim(), value.trim(), req.params.optionId]);
  res.json({ success: true });
}));

// DELETE /api/dropdowns/options/:optionId
// (Option-level deletion follows the same "not undoable" warning shown client-side;
//  since options are simple values, removing one just narrows the choice list wherever the dropdown is used.)
router.delete('/options/:optionId', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM dropdown_options WHERE id = ?', [req.params.optionId]);
  res.json({ success: true });
}));

module.exports = router;
