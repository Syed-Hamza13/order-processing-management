const express = require('express');
const https = require('https');
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/pincode/config
router.get('/config', asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM pincode_settings WHERE id = 1');
  res.json(row || {});
}));

// PUT /api/pincode/config

router.put('/config', asyncHandler(async (req, res) => {
  const {
    order_pincode_field_slug, order_address_field_slug,
    print_pincode_field_slug, print_address_field_slug,
  } = req.body;
  await pool.query(
    `UPDATE pincode_settings SET
      order_pincode_field_slug = ?, order_address_field_slug = ?,
      print_pincode_field_slug = ?, print_address_field_slug = ?
     WHERE id = 1`,
    [
      order_pincode_field_slug || null, order_address_field_slug || null,
      print_pincode_field_slug || null, print_address_field_slug || null,
    ]
  );
  res.json({ success: true });
}));

// GET /api/pincode/lookup/:pincode  — proxies India Post's free public PIN code API
// (done server-side to avoid CORS issues and keep the API endpoint out of frontend code).
router.get('/lookup/:pincode', asyncHandler(async (req, res) => {
  const pincode = String(req.params.pincode || '').trim();
  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ error: 'Enter a valid 6-digit PIN code.' });
  }
  const data = await fetchPincodeData(pincode);
  if (!data) return res.status(404).json({ error: 'No district/state found for this PIN code.' });
  res.json(data);
}));

function fetchPincodeData(pincode) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.postalpincode.in/pincode/${pincode}`, (apiRes) => {
      let body = '';
      apiRes.on('data', (chunk) => { body += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const result = parsed?.[0];
          if (result?.Status !== 'Success' || !result.PostOffice?.length) return resolve(null);
          const po = result.PostOffice[0];
          resolve({ district: po.District, state: po.State });
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

module.exports = router;