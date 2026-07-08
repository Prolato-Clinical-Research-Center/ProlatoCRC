const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('kv_store table ready');
}
ensureTable().catch(err => {
  console.error('Failed to initialize database. Check DATABASE_URL.', err);
});

// Simple key-value API. Mirrors the shape of Claude's artifact window.storage
// API (get/set by key) so the frontend logic barely had to change.
app.get('/api/kv/:key', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [req.params.key]);
    res.json({ value: rows.length ? rows[0].value : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/kv/:key', async (req, res) => {
  try {
    const { value } = req.body;
    if (typeof value !== 'string') {
      return res.status(400).json({ error: 'value must be a string (JSON.stringify it client-side)' });
    }
    await pool.query(
      `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, value]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Prolato Outreach Pipeline server running on port ${PORT}`));
