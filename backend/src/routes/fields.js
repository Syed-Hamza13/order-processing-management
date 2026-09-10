const express = require('express');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { getFieldUsage } = require('../utils/usage');

const router = express.Router();

const VALID_TYPES = ['short_text', 'multiline_text', 'number', 'date', 'dropdown', 'toggle'];

function slugify(name) {
  return (
    name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

async function uniqueSlug(base) {
  let slug = base;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [[row]] = await pool.query('SELECT COUNT(*) as c FROM fields WHERE slug = ?', [slug]);
    if (row.c === 0) return slug;
    i += 1;
    slug = `${base}_${i}`;
  }
}

// GET /api/fields
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT f.*, d.name as dropdown_name FROM fields f
     LEFT JOIN dropdowns d ON d.id = f.dropdown_id
     ORDER BY f.created_at DESC`
  );
  res.json(rows);
}));

// POST /api/fields  { name, type, dropdownId? }
router.post('/', asyncHandler(async (req, res) => {
  const { name, type, dropdownId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Field name is required.' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid field type.' });
  if (type === 'dropdown' && !dropdownId) return res.status(400).json({ error: 'Please select a dropdown for this field.' });

  const slug = await uniqueSlug(slugify(name));
  const [result] = await pool.query(
    'INSERT INTO fields (name, slug, type, dropdown_id) VALUES (?, ?, ?, ?)',
    [name.trim(), slug, type, type === 'dropdown' ? dropdownId : null]
  );
  res.json({ id: result.insertId, name: name.trim(), slug, type, dropdown_id: type === 'dropdown' ? dropdownId : null });
}));

// GET /api/fields/:id/usage  -> where this field is used (forms)
router.get('/:id/usage', asyncHandler(async (req, res) => {
  const usage = await getFieldUsage(Number(req.params.id));
  res.json({ forms: usage });
}));

// PUT /api/fields/:id  -> rename only if in use; rename + change type if not in use
router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name, type, dropdownId } = req.body;
  const usage = await getFieldUsage(id);
  const inUse = usage.length > 0;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Field name is required.' });

  if (inUse) {
    // Only the name may change. Type/dropdown are locked once a field is in use.
    await pool.query('UPDATE fields SET name = ? WHERE id = ?', [name.trim(), id]);
    return res.json({ success: true, renamedOnly: true, usedIn: usage });
  }

  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid field type.' });
  if (type === 'dropdown' && !dropdownId) return res.status(400).json({ error: 'Please select a dropdown for this field.' });
  await pool.query('UPDATE fields SET name = ?, type = ?, dropdown_id = ? WHERE id = ?', [
    name.trim(), type, type === 'dropdown' ? dropdownId : null, id,
  ]);
  res.json({ success: true, renamedOnly: false });
}));

// DELETE /api/fields/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const usage = await getFieldUsage(id);
  if (usage.length > 0) {
    return res.status(409).json({
      error: 'This field is still in use and cannot be deleted.',
      usedIn: usage,
    });
  }
  await pool.query('DELETE FROM fields WHERE id = ?', [id]);
  res.json({ success: true });
}));

module.exports = router;
