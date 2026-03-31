// src/index.js
// ══════════════════════════════════════════════
//  FileDrop — Servidor principal
//  Express + CORS + Rate Limiting + Routes + Cron
// ══════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const uploadRouter = require('./routes/upload');
const filesRouter  = require('./routes/files');
const { startCleanupCron } = require('./services/cleanup');

const app  = express();
const PORT = process.env.PORT || 3001;
app.set('trust proxy', 1);
// ── CORS ───────────────────────────────────────
app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
}));

// ── Body parsers ───────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rate Limiting ──────────────────────────────
// General: 30 req / 15 min por IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 30,
  message:  { error: 'Demasiadas solicitudes. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// Upload: más estricto — 15 uploads / hora por IP
app.use('/api/upload', rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 15,
  message:  { error: 'Límite de uploads alcanzado. Esperá 1 hora.' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Rutas ──────────────────────────────────────
app.use('/api/upload', uploadRouter);
app.use('/api/files',  filesRouter);

// ── Health check ───────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts:     new Date().toISOString(),
    env:    process.env.NODE_ENV || 'development',
  });
});

app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});

// ── 404 ────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// ── Error global ───────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error global]', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ── Iniciar ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  FileDrop Backend v2.0                   ║
║  Puerto : ${PORT}                            ║
║  CORS   : ${(process.env.FRONTEND_URL || 'localhost').padEnd(28)}║
╚══════════════════════════════════════════╝`);

  // Iniciar cron de limpieza (también corre al arrancar)
  startCleanupCron();
});

module.exports = app;
