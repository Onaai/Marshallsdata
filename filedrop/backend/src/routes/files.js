// src/routes/files.js
// ══════════════════════════════════════════════
//  POST /api/files          → listar archivos (requiere contraseña)
//  GET  /api/files/:groupId → info pública del grupo
//  POST /api/files/download/:fileId → descargar archivo
// ══════════════════════════════════════════════

const express = require('express');
const bcrypt  = require('bcryptjs');

const { downloadFile }  = require('../services/drive');
const {
  getAllGroups,
  getGroupById,
  getFilesByGroup,
  getFileById,
} = require('../services/firestore');

const router = express.Router();

// ── Helper: autenticar contraseña → grupo ──────
async function authenticateGroup(password) {
  if (!password || password.trim().length < 4) return null;

  const allGroups = await getAllGroups();
  for (const g of allGroups) {
    const match = await bcrypt.compare(password.trim(), g.passwordHash);
    if (match) return g;
  }
  return null;
}

// ── Helper: filtrar archivos no expirados ──────
function filterActive(files) {
  const now = Math.floor(Date.now() / 1000);
  return files.filter(f => f.expiresAt > now);
}

// ══════════════════════════════════════════════
//  POST /api/files
//  Listar archivos de un grupo dado la contraseña
// ══════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Se requiere contraseña.' });
    }

    const group = await authenticateGroup(password);

    if (!group) {
      return res.status(401).json({ error: 'Contraseña incorrecta o sin archivos asociados.' });
    }

    const allFiles    = await getFilesByGroup(group.id);
    const activeFiles = filterActive(allFiles);

    if (activeFiles.length === 0) {
      return res.status(404).json({ error: 'No hay archivos activos para esta contraseña.' });
    }

    // Calcular tiempo restante por archivo
    const now = Math.floor(Date.now() / 1000);
    const filesWithMeta = activeFiles.map(f => ({
      id:           f.id,
      originalName: f.originalName,
      size:         f.size,
      mimeType:     f.mimeType,
      expiresAt:    new Date(f.expiresAt * 1000).toISOString(),
      timeRemaining: {
        hours:   Math.floor((f.expiresAt - now) / 3600),
        minutes: Math.floor(((f.expiresAt - now) % 3600) / 60),
      },
    }));

    return res.json({
      groupId: group.id,
      files:   filesWithMeta,
      count:   filesWithMeta.length,
    });

  } catch (err) {
    console.error('[Files/list] Error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// ══════════════════════════════════════════════
//  GET /api/files/:groupId
//  Info pública del grupo (sin contraseña)
//  Solo muestra cantidad de archivos y tiempo de expiración
// ══════════════════════════════════════════════
router.get('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!groupId || groupId.length < 10) {
      return res.status(400).json({ error: 'Group ID inválido.' });
    }

    const group = await getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Grupo no encontrado.' });
    }

    const allFiles    = await getFilesByGroup(groupId);
    const activeFiles = filterActive(allFiles);

    if (activeFiles.length === 0) {
      return res.status(404).json({ error: 'No hay archivos activos en este grupo.' });
    }

    // Tiempo restante hasta la primera expiración
    const now        = Math.floor(Date.now() / 1000);
    const minExpires = Math.min(...activeFiles.map(f => f.expiresAt));
    const secondsLeft = minExpires - now;

    return res.json({
      groupId,
      fileCount:    activeFiles.length,
      expiresAt:    new Date(minExpires * 1000).toISOString(),
      timeRemaining: {
        hours:   Math.floor(secondsLeft / 3600),
        minutes: Math.floor((secondsLeft % 3600) / 60),
      },
      // No exponemos nombres ni IDs de archivos sin contraseña
    });

  } catch (err) {
    console.error('[Files/group] Error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
});

// ══════════════════════════════════════════════
//  POST /api/files/download/:fileId
//  Descargar un archivo (requiere contraseña del grupo)
// ══════════════════════════════════════════════
router.post('/download/:fileId', async (req, res) => {
  try {
    const { fileId }   = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Se requiere contraseña.' });
    }

    // Buscar el archivo
    const file = await getFileById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado o expirado.' });
    }

    // Verificar expiración
    const now = Math.floor(Date.now() / 1000);
    if (file.expiresAt <= now) {
      return res.status(410).json({ error: 'Este archivo ya expiró.' });
    }

    // Verificar que la contraseña corresponde al grupo del archivo
    const group = await getGroupById(file.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Grupo no encontrado.' });
    }

    const match = await bcrypt.compare(password.trim(), group.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    // Descargar desde Google Drive y pipear al cliente
    console.log(`[Download] ${file.originalName} (${fileId})`);
    const stream = await downloadFile(file.driveFileId);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type',   file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.size);

    stream.pipe(res);
    stream.on('error', err => {
      console.error('[Download] Stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Error al descargar.' });
    });

  } catch (err) {
    console.error('[Download] Error:', err.message);
    return res.status(500).json({ error: 'Error interno al descargar.' });
  }
});

module.exports = router;
