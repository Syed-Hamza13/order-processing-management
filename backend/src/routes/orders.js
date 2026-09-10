const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

async function loadFormFields(formId) {
  const [fields] = await pool.query(
    `SELECT f.*, d.name as dropdown_name FROM form_fields ff
     JOIN fields f ON f.id = ff.field_id
     LEFT JOIN dropdowns d ON d.id = f.dropdown_id
     WHERE ff.form_id = ? ORDER BY ff.sort_order ASC`,
    [formId]
  );
  return fields;
}

function formatDateDDMMYYYY(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ---------- Config: which form currently drives the Orders table ----------

// GET /api/orders/config
router.get('/config', asyncHandler(async (req, res) => {
  const [[config]] = await pool.query('SELECT form_id FROM order_config WHERE id = 1');
  if (!config || !config.form_id) return res.json({ formId: null, form: null, fields: [] });
  const [[form]] = await pool.query('SELECT * FROM forms WHERE id = ?', [config.form_id]);
  const fields = await loadFormFields(config.form_id);
  res.json({ formId: config.form_id, form, fields });
}));

// PUT /api/orders/config  { formId }
router.put('/config', asyncHandler(async (req, res) => {
  const { formId } = req.body;
  const [[form]] = await pool.query('SELECT * FROM forms WHERE id = ?', [formId]);
  if (!form) return res.status(404).json({ error: 'Form not found.' });
  await pool.query('UPDATE order_config SET form_id = ? WHERE id = 1', [formId]);
  res.json({ success: true });
}));

// ---------- Listing: search + per-column filter + sort + pagination (app-level, see README) ----------

// GET /api/orders?formId=&page=&pageSize=&search=&sort=&dir=&filters=<json>
router.get('/', asyncHandler(async (req, res) => {
  const formId = Number(req.query.formId);
  if (!formId) return res.status(400).json({ error: 'formId is required.' });
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Number(req.query.pageSize) || 30);
  const search = (req.query.search || '').toLowerCase().trim();
  const sort = req.query.sort || null;
  const dir = (req.query.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  let filters = {};
  if (req.query.filters) {
    try { filters = JSON.parse(req.query.filters); } catch (e) { filters = {}; }
  }

  const [rows] = await pool.query('SELECT * FROM orders WHERE form_id = ? ORDER BY created_at DESC', [formId]);
  let parsed = rows.map((r) => ({ id: r.id, formId: r.form_id, data: r.data, createdAt: r.created_at, updatedAt: r.updated_at }));

  // Search across all field values
  if (search) {
    parsed = parsed.filter((o) => Object.values(o.data || {}).some((v) => String(v ?? '').toLowerCase().includes(search)));
  }

  // Per-column filters: { slug: [allowedValue1, allowedValue2, ...] }
  Object.entries(filters).forEach(([slug, allowed]) => {
    if (Array.isArray(allowed) && allowed.length > 0) {
      parsed = parsed.filter((o) => allowed.includes(String(o.data?.[slug] ?? '')));
    }
  });

  // Sort
  if (sort) {
    parsed.sort((a, b) => {
      const av = String(a.data?.[sort] ?? '');
      const bv = String(b.data?.[sort] ?? '');
      return dir === 'asc' ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
    });
  }

  const total = parsed.length;
  const start = (page - 1) * pageSize;
  const pageRows = parsed.slice(start, start + pageSize);

  res.json({ total, page, pageSize, rows: pageRows });
}));

// GET /api/orders/filter-values?formId=&slug=  -> distinct values for a column's filter dropdown
router.get('/filter-values', asyncHandler(async (req, res) => {
  const formId = Number(req.query.formId);
  const slug = req.query.slug;
  const [rows] = await pool.query('SELECT data FROM orders WHERE form_id = ?', [formId]);
  const set = new Set();
  rows.forEach((r) => {
    const v = r.data?.[slug];
    if (v !== undefined && v !== null && v !== '') set.add(String(v));
  });
  res.json([...set].sort());
}));

// POST /api/orders  { formId, data }
router.post('/', asyncHandler(async (req, res) => {
  const { formId, data } = req.body;
  if (!formId || !data) return res.status(400).json({ error: 'formId and data are required.' });
  const [result] = await pool.query('INSERT INTO orders (form_id, data) VALUES (?, ?)', [formId, JSON.stringify(data)]);
  res.json({ success: true, id: result.insertId });
}));

// PUT /api/orders/:id  { data }
router.put('/:id', asyncHandler(async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required.' });
  await pool.query('UPDATE orders SET data = ? WHERE id = ?', [JSON.stringify(data), req.params.id]);
  res.json({ success: true });
}));

// DELETE /api/orders/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

// POST /api/orders/bulk-delete  { ids: [] }
router.post('/bulk-delete', asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No orders selected.' });
  await pool.query(`DELETE FROM orders WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  res.json({ success: true, count: ids.length });
}));

// POST /api/orders/bulk-update  { ids: [], updates: { slug: value, ... } }
router.post('/bulk-update', asyncHandler(async (req, res) => {
  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No orders selected.' });
  if (!updates || Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });
  const [rows] = await pool.query(`SELECT id, data FROM orders WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const merged = { ...row.data, ...updates };
      await conn.query('UPDATE orders SET data = ? WHERE id = ?', [JSON.stringify(merged), row.id]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ success: true, count: rows.length });
}));

// ---------- Export ----------

// Reserved column used to match an Excel row back to a specific order on import.
// It is NOT one of your Fields — it's a system column that both export files include.
const ORDER_ID_COLUMN = 'Order ID (system — do not edit)';

// GET /api/orders/export/run?formId=&ids=1,2,3   (omit ids to export ALL orders for the form)
router.get('/export/run', asyncHandler(async (req, res) => {
  const formId = Number(req.query.formId);
  const fields = await loadFormFields(formId);
  let rows;
  if (req.query.ids) {
    const ids = req.query.ids.split(',').map(Number).filter(Boolean);
    [rows] = await pool.query(`SELECT * FROM orders WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  } else {
    [rows] = await pool.query('SELECT * FROM orders WHERE form_id = ?', [formId]);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');
  sheet.columns = [
    { header: ORDER_ID_COLUMN, key: '__order_id', width: 26 },
    ...fields.map((f) => ({ header: f.name, key: f.slug, width: 22 })),
  ];
  rows.forEach((r) => {
    const rowData = { __order_id: r.id };
    fields.forEach((f) => {
      let v = r.data?.[f.slug] ?? '';
      if (f.type === 'date' && v) v = formatDateDDMMYYYY(v);
      rowData[f.slug] = v;
    });
    sheet.addRow(rowData);
  });
  sheet.getRow(1).font = { bold: true };
  sheet.getCell(1, 1).note = 'Do not edit or delete this column. It is what lets a re-imported row update the correct existing order instead of being treated as a new one.';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="orders-export.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}));

// GET /api/orders/import-template?formId=
router.get('/import-template', asyncHandler(async (req, res) => {
  const formId = Number(req.query.formId);
  const fields = await loadFormFields(formId);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import Template');
  sheet.columns = [
    { header: ORDER_ID_COLUMN, key: '__order_id', width: 26 },
    ...fields.map((f) => ({ header: f.name, key: f.slug, width: 22 })),
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getCell(1, 1).note = 'Leave this column BLANK for every row here — this template is for adding new orders. '
    + 'If instead you are re-uploading a file you got from "Export All"/"Export Selected" to edit existing orders in bulk, '
    + 'keep this column exactly as it was exported so those rows update the correct orders instead of creating duplicates.';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="order-import-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}));

// GET /api/orders/:id
// NOTE: this single-segment dynamic route must stay defined AFTER every other single-segment
// GET route on this router (e.g. /import-template) — otherwise Express matches those literal
// paths as if ":id" were "import-template" and this handler wrongly answers "Order not found."
router.get('/:id', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Order not found.' });
  res.json({ id: row.id, formId: row.form_id, data: row.data, createdAt: row.created_at });
}));

// POST /api/orders/import  (multipart: file, formId)
//
// Matching rule (this is the important part — see chat/README for why):
// A row is matched to an EXISTING order only via the reserved "Order ID" column, never by
// guessing from field values like name/phone. Two orders can legitimately share the same name,
// address, or any other field — that does not make them duplicates of each other.
//   - Order ID column blank/missing on a row  -> ALWAYS inserted as a brand new order.
//   - Order ID column has a value that matches a real existing order (in this same form)
//     -> that specific order is updated with the row's values.
//   - Order ID column has a value that does NOT match any existing order (e.g. stale/edited
//     by mistake) -> inserted as a new order, and reported separately so you can double-check it.
router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  const formId = Number(req.body.formId);
  if (!formId) return res.status(400).json({ error: 'formId is required.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const fields = await loadFormFields(formId);
  if (fields.length === 0) return res.status(400).json({ error: 'This form has no fields configured.' });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];

  const headerRow = sheet.getRow(1).values; // 1-indexed, index 0 empty
  const orderIdColIdx = headerRow.findIndex((h) => (h || '').toString().trim() === ORDER_ID_COLUMN);
  const colIndexBySlug = {};
  fields.forEach((f) => {
    const idx = headerRow.findIndex((h) => (h || '').toString().trim() === f.name);
    if (idx > -1) colIndexBySlug[f.slug] = idx;
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let staleIdInserted = 0; // rows whose Order ID didn't match anything, inserted as new instead

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      if (!row || row.values.length === 0) { skipped += 1; continue; }

      const data = {};
      let hasAnyValue = false;
      fields.forEach((f) => {
        const idx = colIndexBySlug[f.slug];
        let val = idx ? row.values[idx] : '';
        if (val && typeof val === 'object' && val.text) val = val.text; // hyperlink/rich text cells
        val = val !== undefined && val !== null ? String(val).trim() : '';
        if (val) hasAnyValue = true;
        data[f.slug] = val;
      });

      const rawOrderId = orderIdColIdx > -1 ? row.values[orderIdColIdx] : null;
      const orderId = rawOrderId ? Number(String(rawOrderId).trim()) : null;

      if (!hasAnyValue && !orderId) { skipped += 1; continue; } // fully blank row

      if (orderId) {
        // eslint-disable-next-line no-await-in-loop
        const [[existing]] = await conn.query('SELECT id FROM orders WHERE id = ? AND form_id = ?', [orderId, formId]);
        if (existing) {
          // eslint-disable-next-line no-await-in-loop
          await conn.query('UPDATE orders SET data = ? WHERE id = ?', [JSON.stringify(data), existing.id]);
          updated += 1;
          continue;
        }
        // Order ID present but not found — insert as new rather than silently dropping the row.
        // eslint-disable-next-line no-await-in-loop
        await conn.query('INSERT INTO orders (form_id, data) VALUES (?, ?)', [formId, JSON.stringify(data)]);
        staleIdInserted += 1;
        inserted += 1;
        continue;
      }

      // No Order ID on this row at all -> always a new order, regardless of whether its
      // field values (e.g. name) happen to match some existing order.
      // eslint-disable-next-line no-await-in-loop
      await conn.query('INSERT INTO orders (form_id, data) VALUES (?, ?)', [formId, JSON.stringify(data)]);
      inserted += 1;
    }
    await conn.commit();
  } catch (err) { 
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  res.json({ success: true, inserted, updated, skipped, staleIdInserted });
}));

module.exports = router;