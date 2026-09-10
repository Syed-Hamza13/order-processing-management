const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_HOST || !DB_PORT || !DB_USER || !DB_NAME) {
  throw new Error(
    'Database configuration is incomplete. Please check DB_HOST, DB_PORT, DB_USER and DB_NAME in .env.',
  );
}

/*
 * The database itself must already exist.
 *
 * The application does NOT create databases.
 * The database user only needs permission to use the configured
 * database and create/manage the application's tables.
 */
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  multipleStatements: true,
});

async function initializeDatabase() {
  let connection;

  try {
    console.log(`Connecting to database "${DB_NAME}"...`);

    /*
     * This connection uses DB_NAME directly.
     *
     * If the database does not exist, startup fails.
     * That is intentional.
     *
     * The application must NEVER create the database.
     */
    connection = await pool.getConnection();

    const schemaPath = path.join(
      __dirname,
      '..',
      'sql',
      'schema.sql',
    );

    if (!fs.existsSync(schemaPath)) {
      throw new Error(
        `Schema file not found: ${schemaPath}`,
      );
    }

    const schema = fs.readFileSync(
      schemaPath,
      'utf8',
    );

    console.log(
      'Checking/creating application tables...',
    );

    /*
     * schema.sql contains CREATE TABLE IF NOT EXISTS.
     *
     * Therefore:
     * - Missing tables are created.
     * - Existing tables are preserved.
     * - Existing data is not deleted.
     */
    await connection.query(schema);

    console.log(
      `Database "${DB_NAME}" is ready.`,
    );
  } catch (err) {
    console.error(
      `Database initialization failed for "${DB_NAME}".`,
    );
    console.error(err);

    throw err;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = pool;
module.exports.initializeDatabase = initializeDatabase; 