// src/services/cleanup.js
// ══════════════════════════════════════════════
//  Cron de limpieza automática
//  Al arrancar: limpia docs corruptos de Firestore
//  Cada hora: busca archivos expirados y los borra
//  de Google Drive y de Firestore.
// ══════════════════════════════════════════════

const cron = require('node-cron');
const {
  getExpiredFiles,
  deleteFileById,
  getFilesByGroup,
  deleteGroup,
  cleanCorruptedDocs,
} = require('./firestore');
const { deleteFile: deleteDriveFile } = require('./drive');

async function runCleanup() {
  const ts = new Date().toISOString();
  console.log(`[Cleanup] ${ts} — Iniciando ciclo de limpieza...`);

  let deleted = 0;
  let errors  = 0;
  const orphanGroups = new Set();

  // 1. Obtener archivos expirados (ya filtrados, sin corruptos)
  let expired;
  try {
    expired = await getExpiredFiles();
  } catch (err) {
    console.error('[Cleanup] Error al consultar Firestore:', err.message);
    return;
  }

  if (expired.length === 0) {
    console.log('[Cleanup] Sin archivos expirados.');
    return;
  }

  console.log(`[Cleanup] ${expired.length} archivo(s) expirado(s) encontrados.`);

  for (const file of expired) {
    // Doble check: saltar si el ID no es válido (no debería pasar con el filtro)
    if (!file.id || !file.driveFileId) {
      console.warn('[Cleanup] Saltando archivo con datos inválidos:', file);
      continue;
    }

    try {
      await deleteDriveFile(file.driveFileId);
    } catch (driveErr) {
      const isNotFound = driveErr.code === 404 ||
        driveErr.errors?.[0]?.reason === 'notFound';

      if (!isNotFound) {
        console.error(`  ✗ Drive error (${file.id}): ${driveErr.message}`);
        errors++;
        continue;
      }
      console.warn(`  ⚠ Ya no existe en Drive: ${file.id}`);
    }

    try {
      await deleteFileById(file.id);
      orphanGroups.add(file.groupId);
      console.log(`  ✓ Eliminado: ${file.originalName} (${file.id})`);
      deleted++;
    } catch (fsErr) {
      console.error(`  ✗ Firestore error (${file.id}): ${fsErr.message}`);
      errors++;
    }
  }

  // 2. Limpiar grupos vacíos
  for (const groupId of orphanGroups) {
    if (!groupId) continue;
    try {
      const remaining = await getFilesByGroup(groupId);
      if (remaining.length === 0) {
        await deleteGroup(groupId);
        console.log(`  🗑 Grupo vacío eliminado: ${groupId}`);
      }
    } catch (err) {
      console.error(`  ✗ Error limpiando grupo ${groupId}: ${err.message}`);
    }
  }

  console.log(`[Cleanup] Fin: ${deleted} eliminados, ${errors} errores.`);
}

function startCleanupCron() {
  // Limpiar documentos corruptos que puedan haber quedado de versiones anteriores
  cleanCorruptedDocs().catch(err =>
    console.error('[Cleanup] Error limpiando corruptos:', err.message)
  );

  // Ejecutar limpieza normal al arrancar
  runCleanup().catch(console.error);

  // Luego cada hora en punto
  cron.schedule('0 * * * *', () => {
    runCleanup().catch(console.error);
  });

  console.log('[Cleanup] Cron registrado — se ejecuta cada hora.');
}

module.exports = { startCleanupCron, runCleanup };
