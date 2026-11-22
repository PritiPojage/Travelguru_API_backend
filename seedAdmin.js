import 'dotenv/config';
import bcrypt from 'bcrypt';
import pool from './db.js';

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name,
                   password_hash = EXCLUDED.password_hash,
                   role = 'admin'
     RETURNING id, name, email, role`,
    [ADMIN_NAME, ADMIN_EMAIL.toLowerCase(), hash]
  );

  console.log('Admin ready:', result.rows[0]);
} catch (err) {
  console.error('Seeding failed:', err.message);
} finally {
  await pool.end();
}