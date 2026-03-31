// src/routes/upload.js
// ══════════════════════════════════════════════
//  POST /api/upload
//
//  Body (multipart/form-data):
//    files[]    → 1-10 archivos
//    password   → contraseña del grupo
//
//  Lógica:
//    - Si la contraseña ya tiene grupo → agregar archivos
//    - Si es nueva → crear grupo nuevo
//    - Subir cada archivo a Google Drive
//    - Guardar metadata en Firestore
// ══════════════════════════════════════════════

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const uploadMiddleware = require('../middleware/upload');
const { uploadFile }   = require('../services/drive');
const {
  getAllGroups,
  createGroup,
  saveFile,
  countFilesByGroup,
} = require('../services/firestore');

const router = express.Router();

const EXPIRY_HOURS    = parseInt(process.env.FILE_EXPIRY_HOURS)     || 24;
const MAX_PER_GROUP   = parseInt(process.env.MAX_FILES_PER_GROUP)   || 20;
const BCRYPT_ROUNDS   = 10;

router.post('/', uploadMiddleware.array('files', 10), async (req, res) => {
  try {
    // ── Validar que llegaron archivos ──────────
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    // ── Validar contraseña ─────────────────────
    const { password } = req.body;
    if (!password || password.trim().length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'La contraseña es demasiado larga.' });
    }

    const pwd = password.trim();

    // ── Buscar grupo existente ─────────────────
    // Traemos todos los grupos y comparamos con bcrypt
    // (tráfico bajo → aceptable; para escala mayor usar hash determinista)
    let group    = null;
    let isNewGroup = false;
    const allGroups = await getAllGroups();

    for (const g of allGroups) {
      const match = await bcrypt.compare(pwd, g.passwordHash);
      if (match) { group = g; break; }
    }

    // ── Crear grupo si no existe ───────────────
    if (!group) {
      const groupId      = uuidv4();
      const passwordHash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
      await createGroup(groupId, passwordHash);
      group      = { id: groupId, passwordHash };
      isNewGroup = true;
      console.log(`[Upload] Nuevo grupo creado: ${groupId}`);
    } else {
      console.log(`[Upload] Grupo existente: ${group.id}`);
    }

    // ── Verificar límite de archivos del grupo ─
    const currentCount = await countFilesByGroup(group.id);
    const available    = MAX_PER_GROUP - currentCount;

    if (available <= 0) {
      return res.status(400).json({
        error: `Este grupo ya alcanzó el límite de ${MAX_PER_GROUP} archivos.`,
      });
    }

    // Recortar si van a pasarse del límite
    const filesToProcess = req.files.slice(0, available);
    const skipped        = req.files.length - filesToProcess.length;

    // ── Subir archivos ─────────────────────────
    const now     = Math.floor(Date.now() / 1000);
    const expires = now + EXPIRY_HOURS * 3600;
    const results = [];
    const failed  = [];

    for (const file of filesToProcess) {
      const fileId        = uuidv4();
      const driveFilename = `${fileId}_${file.originalname}`;

      try {
        // 1. Subir a Drive
        const driveFileId = await uploadFile({
          buffer:   file.buffer,
          filename: driveFilename,
          mimetype: file.mimetype || 'application/octet-stream',
        });

        // 2. Guardar en Firestore
        await saveFile({
          id:           fileId,
          groupId:      group.id,
          driveFileId,
          originalName: file.originalname,
          mimeType:     file.mimetype || 'application/octet-stream',
          size:         file.size,
          createdAt:    now,
          expiresAt:    expires,
        });

        results.push({
          id:           fileId,
          originalName: file.originalname,
          size:         file.size,
          mimeType:     file.mimetype,
          expiresAt:    new Date(expires * 1000).toISOString(),
        });

        console.log(`[Upload] ✓ ${file.originalname} → DriveID: ${driveFileId}`);
      } catch (err) {
        console.error(`[Upload] ✗ Error con ${file.originalname}: ${err.message}`);
        failed.push(file.originalname);
      }
    }

    if (results.length === 0) {
      return res.status(500).json({ error: 'No se pudo subir ningún archivo. Intentá de nuevo.' });
    }

    // ── Respuesta ──────────────────────────────
    return res.status(201).json({
      success:    true,
      groupId:    group.id,
      isNewGroup,
      uploaded:   results,
      failed:     failed.length > 0 ? failed : undefined,
      skipped:    skipped > 0 ? skipped : undefined,
      expiresAt:  new Date(expires * 1000).toISOString(),
      message:    `${results.length} archivo(s) subido(s) correctamente. Expiran en ${EXPIRY_HOURS}h.`,
    });

  } catch (err) {
    console.error('[Upload] Error inesperado:', err.message);

    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(parseInt(process.env.MAX_FILE_SIZE) / 1024 / 1024);
      return res.status(413).json({ error: `Un archivo supera el límite de ${mb} MB.` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Máximo 10 archivos por request.' });
    }

    return res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

module.exports = router;
