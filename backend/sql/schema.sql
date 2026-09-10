


-- Single admin user (email = username)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- App-wide settings (logo, favicon) - single row
CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  logo_path VARCHAR(500) NULL,
  favicon_path VARCHAR(500) NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO app_settings (id) VALUES (1);

-- Dropdown lists
CREATE TABLE IF NOT EXISTS dropdowns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dropdown_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dropdown_id INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  value VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (dropdown_id) REFERENCES dropdowns(id) ON DELETE CASCADE
);

-- Reusable fields
CREATE TABLE IF NOT EXISTS fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE, -- stable key used inside order JSON data, never changes
  type ENUM('short_text','multiline_text','number','date','dropdown','toggle') NOT NULL,
  dropdown_id INT NULL, -- used when type = 'dropdown'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (dropdown_id) REFERENCES dropdowns(id) ON DELETE RESTRICT
);

-- Forms
CREATE TABLE IF NOT EXISTS forms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Fields attached to a form, with order
CREATE TABLE IF NOT EXISTS form_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id INT NOT NULL,
  field_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE RESTRICT,
  UNIQUE KEY uniq_form_field (form_id, field_id)
);

-- Which form is currently used to drive the Orders table (single active order-form config)
CREATE TABLE IF NOT EXISTS order_config (
  id INT PRIMARY KEY DEFAULT 1,
  form_id INT NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE SET NULL
);
INSERT IGNORE INTO order_config (id, form_id) VALUES (1, NULL);

-- Orders: data stored as JSON keyed by field slug (flexible schema, matches whichever form is active)
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id INT NOT NULL,
  data JSON NOT NULL,
  import_key VARCHAR(255) NULL, -- used to detect duplicates on re-import (e.g. hash of key fields)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE RESTRICT,
  INDEX idx_import_key (import_key)
);

-- Label templates (Fabric.js canvas design)
CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  page_size ENUM('A3','A4','A5','LETTER','ENVELOPE') NOT NULL DEFAULT 'A5',
  orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'landscape',
  canvas_json JSON NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Uploaded design assets (images for use in template editor)
CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings for which fields in the order form correspond to pincode, district, state (for auto-fill)

CREATE TABLE IF NOT EXISTS pincode_settings (
  id INT PRIMARY KEY DEFAULT 1,
  order_pincode_field_slug VARCHAR(255) NULL,
  order_address_field_slug VARCHAR(255) NULL,
  print_pincode_field_slug VARCHAR(255) NULL,
  print_address_field_slug VARCHAR(255) NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO pincode_settings (id) VALUES (1);