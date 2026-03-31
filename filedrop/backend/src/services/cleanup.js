// src/services/cleanup.js
// ══════════════════════════════════════════════
//  Cron de limpieza automática
//  Cada hora: busca archivos expirados en Firestore,
//  los borra de Google Drive y de Firestore.
//  Si un grupo queda sin archivos, también se elimina.
// ══════════════════════════════════════════════

const cron = require('node-cron');
const { getExpiredFiles, deleteFileById, getFilesByGroup, deleteGroup } = require('./firestore');
const { deleteFile: deleteDriveFile } = require('./drive');

async function runCleanup() {
  const ts = new Date().toISOString();
  console.log(`[Cleanup] ${ts} — Iniciando ciclo de limpieza...`);

  let deleted = 0;
  let errors  = 0;
  const orphanGroups = new Set(); // Grupos que podrían quedar vacíos

  // 1. Obtener archivos expirados desde Firestore
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

  // 2. Eliminar cada archivo
  for (const file of expired) {
    try {
      // Borrar de Google Drive
      await deleteDriveFile(file.driveFileId);
    } catch (driveErr) {
      const isNotFound = driveErr.code === 404 ||
        driveErr.errors?.[0]?.reason === 'notFound';

      if (!isNotFound) {
        console.error(`  ✗ Drive error (${file.id}): ${driveErr.message}`);
        errors++;
        continue; // No borrar de Firestore si Drive falló inesperadamente
      }
      // Si no existe en Drive, continuar y borrar de Firestore igual
      console.warn(`  ⚠ Ya no existe en Drive: ${file.id}`);
    }

    try {
      // Borrar de Firestore
      await deleteFileById(file.id);
      orphanGroups.add(file.groupId);
      console.log(`  ✓ Eliminado: ${file.originalName} (${file.id})`);
      deleted++;
    } catch (fsErr) {
      console.error(`  ✗ Firestore error (${file.id}): ${fsErr.message}`);
      errors++;
    }
  }

  // 3. Limpiar grupos que quedaron sin archivos
  for (const groupId of orphanGroups) {
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
  // Ejecutar al arrancar (para procesar lo que quedó pendiente)
  runCleanup().catch(console.error);

  // Luego cada hora en punto: "0 * * * *"
  // Para probar más rápido: "*/5 * * * *" (cada 5 min)
  cron.schedule('0 * * * *', () => {
    runCleanup().catch(console.error);
  });

  console.log('[Cleanup] Cron registrado — se ejecuta cada hora.');
}

module.exports = { startCleanupCron, runCleanup };
