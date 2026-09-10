const express = require('express');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { getFormUsage } = require('../utils/usage');

const router = express.Router();

async function loadFormWithFields(formId) {
  const [[form]] = await pool.query('SELECT * FROM forms WHERE id = ?', [formId]);
  if (!form) return null;
  const [fields] = await pool.query(
    `SELECT f.*, ff.sort_order, d.name as dropdown_name FROM form_fields ff
     JOIN fields f ON f.id = ff.field_id
     LEFT JOIN dropdowns d ON d.id = f.dropdown_id
     WHERE ff.form_id = ?
     ORDER BY ff.sort_order ASC`,
    [formId]
  );
  return { ...form, fields };
}

// GET /api/forms
router.get('/', asyncHandler(async (req, res) => {
  const [forms] = await pool.query('SELECT * FROM forms ORDER BY created_at DESC');
  const full = await Promise.all(forms.map((f) => loadFormWithFields(f.id)));
  res.json(full);
}));

// GET /api/forms/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const form = await loadFormWithFields(Number(req.params.id));
  if (!form) return res.status(404).json({ error: 'Form not found.' });
  res.json(form);
}));

// POST /api/forms  { name, fieldIds: [] }
router.post('/', asyncHandler(async (req, res) => {
  const { name, fieldIds } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Form name is required.' });
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one field for this form.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO forms (name) VALUES (?)', [name.trim()]);
    const formId = result.insertId;
    let order = 0;
    for (const fieldId of fieldIds) {
      await conn.query('INSERT INTO form_fields (form_id, field_id, sort_order) VALUES (?, ?, ?)', [formId, fieldId, order]);
      order += 1;
    }
    await conn.commit();
    const full = await loadFormWithFields(formId);
    res.json(full);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// PUT /api/forms/:id/name  -> rename (cascades automatically since orders/print reference form_id, not name)
router.put('/:id/name', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Form name is required.' });
  await pool.query('UPDATE forms SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
  res.json({ success: true });
}));

// PUT /api/forms/:id/fields  -> replace the full field list + order in one call
// { fieldIds: [] }  (used for add / remove / drag-reorder from the editor)
router.put('/:id/fields', asyncHandler(async (req, res) => {
  const formId = Number(req.params.id);
  const { fieldIds } = req.body;
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return res.status(400).json({ error: 'A form must contain at least one field.' });
  }

  // If any currently-attached field is being removed, block if that field is depended on elsewhere
  // beyond this form (e.g. used in another form is fine; but if this is the ONLY place holding data
  // for existing orders on this form, we warn the caller before this endpoint is hit - the frontend
  // shows the confirmation. Here we just also guard: if orders already exist for this form, removing
  // a field would orphan that column's historical data, so we block removal in that case.)
  const [[{ orderCount }]] = await pool.query('SELECT COUNT(*) as orderCount FROM orders WHERE form_id = ?', [formId]);
  const [currentRows] = await pool.query('SELECT field_id FROM form_fields WHERE form_id = ?', [formId]);
  const currentIds = currentRows.map((r) => r.field_id);
  const removed = currentIds.filter((id) => !fieldIds.includes(id));

  if (orderCount > 0 && removed.length > 0) {
    return res.status(409).json({
      error: 'This form already has orders using it. Fields already in use by saved orders cannot be removed from the form.',
      removedFieldIds: removed,
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM form_fields WHERE form_id = ?', [formId]);
    let order = 0;
    for (const fieldId of fieldIds) {
      await conn.query('INSERT INTO form_fields (form_id, field_id, sort_order) VALUES (?, ?, ?)', [formId, fieldId, order]);
      order += 1;
    }
    await conn.commit();
    const full = await loadFormWithFields(formId);
    res.json(full);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// GET /api/forms/:id/usage
router.get('/:id/usage', asyncHandler(async (req, res) => {
  const usage = await getFormUsage(Number(req.params.id));
  res.json(usage);
}));

// DELETE /api/forms/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const usage = await getFormUsage(id);
  if (usage.isActiveOrderForm || usage.orderCount > 0) {
    return res.status(409).json({
      error: 'This form is currently used by the Orders section and cannot be deleted.',
      usage,
    });
  }
  await pool.query('DELETE FROM forms WHERE id = ?', [id]);
  res.json({ success: true });
}));

module.exports = router;
