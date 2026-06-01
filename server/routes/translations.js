const express = require('express');
const router = express.Router();
const { pool } = require('../database');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── PUBLIC: Get translations for a language ───
router.get('/website/translations/:lang', asyncHandler(async (req, res) => {
  const lang = req.params.lang || 'en';
  const [rows] = await pool.query(
    'SELECT namespace, `key_name`, `value` FROM sarga_translations WHERE lang = ?',
    [lang]
  );
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.namespace]) grouped[r.namespace] = {};
    grouped[r.namespace][r.key_name] = r.value;
  }
  res.json({ translations: grouped, lang });
}));

// ─── ADMIN: Get all translations ───
router.get('/translations', asyncHandler(async (req, res) => {
  const { lang, namespace } = req.query;
  let where = '1=1';
  const params = [];
  if (lang) { where += ' AND lang = ?'; params.push(lang); }
  if (namespace) { where += ' AND namespace = ?'; params.push(namespace); }
  const [rows] = await pool.query(`SELECT * FROM sarga_translations WHERE ${where} ORDER BY lang, namespace, key_name`, params);
  res.json({ translations: rows });
}));

// ─── ADMIN: Upsert a translation ───
router.post('/translations', asyncHandler(async (req, res) => {
  const { lang, namespace, key_name, value } = req.body;
  if (!lang || !key_name) return res.status(400).json({ error: 'lang and key_name required' });
  await pool.query(
    'INSERT INTO sarga_translations (lang, namespace, key_name, value) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = ?',
    [lang, namespace || 'common', key_name, value || '', value || '']
  );
  res.json({ message: 'Translation saved' });
}));

// ─── ADMIN: Bulk upsert translations ───
router.post('/translations/bulk', asyncHandler(async (req, res) => {
  const { translations } = req.body;
  if (!translations || !Array.isArray(translations)) return res.status(400).json({ error: 'translations array required' });
  let count = 0;
  for (const t of translations) {
    if (t.lang && t.key_name) {
      await pool.query(
        'INSERT INTO sarga_translations (lang, namespace, key_name, value) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [t.lang, t.namespace || 'common', t.key_name, t.value || '', t.value || '']
      );
      count++;
    }
  }
  res.json({ message: `${count} translations saved` });
}));

// ─── ADMIN: Delete translation ───
router.delete('/translations/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM sarga_translations WHERE id = ?', [req.params.id]);
  res.json({ message: 'Translation deleted' });
}));

module.exports = router;
