const pool = require('../db');

// Returns a list of forms (id, name) that a given field is attached to.
async function getFieldUsage(fieldId) {
  const [rows] = await pool.query(
    `SELECT f.id, f.name FROM form_fields ff
     JOIN forms f ON f.id = ff.form_id
     WHERE ff.field_id = ?`,
    [fieldId]
  );
  return rows; // [] means field is not used anywhere yet
}

// Returns list of fields (id, name) that use a given dropdown.
async function getDropdownUsage(dropdownId) {
  const [rows] = await pool.query(
    `SELECT id, name FROM fields WHERE dropdown_id = ?`,
    [dropdownId]
  );
  return rows;
}

// Returns where a form is used: as the active Orders config, and/or has existing order rows.
async function getFormUsage(formId) {
  const usage = { isActiveOrderForm: false, orderCount: 0 };
  const [[config]] = await pool.query('SELECT form_id FROM order_config WHERE id = 1');
  if (config && config.form_id === formId) usage.isActiveOrderForm = true;
  const [[countRow]] = await pool.query('SELECT COUNT(*) as c FROM orders WHERE form_id = ?', [formId]);
  usage.orderCount = countRow.c;
  return usage;
}

module.exports = { getFieldUsage, getDropdownUsage, getFormUsage };
