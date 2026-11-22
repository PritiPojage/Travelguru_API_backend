import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- REGISTER ----------
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate input
    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      //console.log('Password validation failed:');  
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 2. Hash the password (never store plain text)
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insert. The role is hard-coded to 'user'; we ignore any role sent by the client.
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, name, email, role`,
      [name.trim(), cleanEmail, passwordHash]
    );

    res.status(201).json({
      message: 'Registration successful',
      user: result.rows[0]
    });
  } catch (err) {
    // 23505 = unique violation in PostgreSQL (email already exists)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered.' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- LOGIN ----------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    //console.log(user)
    //console.log( password);
    // Same message for "no such user" and "wrong password" so attackers can't tell which emails exist
    const passwordOk = user && (await bcrypt.compare(password, user.password_hash));
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Create the JWT. The payload carries id and role; never put the password in it.
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;