// src/services/firestore.js
// ══════════════════════════════════════════════
//  Capa de acceso a Firebase Firestore
//
//  Colecciones:
//    file_groups  → { id, passwordHash, createdAt }
//    files        → { id, groupId, driveFileId, originalName,
//                     mimeType, size, createdAt, expiresAt }
// ══════════════════════════════════════════════

const admin = require('firebase-admin');

// ── Inicialización (singleton) ─────────────────
let _db = null;

function getDb() {
  if (_db) return _db;

  // Parsear credenciales desde variable de entorno
  let credential;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no está configurado en .env');
  }

  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON válido');
  }

  // Inicializar solo una vez (evitar error "app already exists")
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credential),
    });
  }

  _db = admin.firestore();
  console.log('[Firestore] Conectado al proyecto:', process.env.FIREBASE_PROJECT_ID);
  return _db;
}

// ══════════════════════════════════════════════
//  FILE GROUPS
// ══════════════════════════════════════════════

/**
 * Crear un nuevo grupo (primera vez que se usa una contraseña)
 * @param {string} id           - UUID del grupo
 * @param {string} passwordHash - Hash bcrypt
 * @returns {Promise<void>}
 */
async function createGroup(id, passwordHash) {
  const db = getDb();
  await db.collection('file_groups').doc(id).set({
    id,
    passwordHash,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Buscar todos los grupos que matcheen con la lista de hashes
 * (No es posible filtrar por hash directamente — hay que traer
 *  todos y comparar en runtime con bcrypt. Con tráfico bajo esto OK)
 *
 * Para tráfico alto: agregar un índice sobre un "slug" determinista.
 * @returns {Promise<Array>}
 */
async function getAllGroups() {
  const db      = getDb();
  const snap    = await db.collection('file_groups').get();
  return snap.docs.map(d => d.data());
}

/**
 * Obtener un grupo por ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getGroupById(id) {
  const db  = getDb();
  const doc = await db.collection('file_groups').doc(id).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Eliminar un grupo y todos sus archivos
 * (Firestore no tiene CASCADE — borramos a mano)
 * @param {string} groupId
 */
async function deleteGroup(groupId) {
  const db    = getDb();
  const batch = db.batch();

  // Borrar todos los files del grupo
  const filesSnap = await db
    .collection('files')
    .where('groupId', '==', groupId)
    .get();

  filesSnap.docs.forEach(d => batch.delete(d.ref));

  // Borrar el grupo
  batch.delete(db.collection('file_groups').doc(groupId));

  await batch.commit();
}

// ══════════════════════════════════════════════
//  FILES
// ══════════════════════════════════════════════

/**
 * Guardar metadata de un archivo subido
 * @param {Object} fileData
 */
async function saveFile({
  id, groupId, driveFileId,
  originalName, mimeType, size,
  createdAt, expiresAt,
}) {
  const db = getDb();
  await db.collection('files').doc(id).set({
    id,
    groupId,
    driveFileId,
    originalName,
    mimeType,
    size,
    createdAt:  admin.firestore.Timestamp.fromMillis(createdAt * 1000),
    expiresAt:  admin.firestore.Timestamp.fromMillis(expiresAt * 1000),
  });
}

/**
 * Listar archivos de un grupo (ordenados por fecha de creación)
 * @param {string} groupId
 * @returns {Promise<Array>}
 */
async function getFilesByGroup(groupId) {
  const db   = getDb();
  const snap = await db
    .collection('files')
    .where('groupId', '==', groupId)
    .orderBy('createdAt', 'asc')
    .get();

  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      // Convertir Timestamps a segundos Unix para consistencia
      createdAt: data.createdAt?.seconds ?? 0,
      expiresAt: data.expiresAt?.seconds ?? 0,
    };
  });
}

/**
 * Obtener un archivo por ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getFileById(id) {
  const db  = getDb();
  const doc = await db.collection('files').doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    ...data,
    createdAt: data.createdAt?.seconds ?? 0,
    expiresAt: data.expiresAt?.seconds ?? 0,
  };
}

/**
 * Eliminar un archivo por ID
 * @param {string} id
 */
async function deleteFileById(id) {
  const db = getDb();
  await db.collection('files').doc(id).delete();
}

/**
 * Obtener todos los archivos expirados
 * @returns {Promise<Array>}
 */
async function getExpiredFiles() {
  const db  = getDb();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection('files')
    .where('expiresAt', '<=', now)
    .get();

  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      createdAt: data.createdAt?.seconds ?? 0,
      expiresAt: data.expiresAt?.seconds ?? 0,
    };
  });
}

/**
 * Contar cuántos archivos tiene un grupo (para límite de archivos)
 * @param {string} groupId
 * @returns {Promise<number>}
 */
async function countFilesByGroup(groupId) {
  const db   = getDb();
  const snap = await db
    .collection('files')
    .where('groupId', '==', groupId)
    .count()
    .get();
  return snap.data().count;
}

module.exports = {
  getDb,
  // Groups
  createGroup,
  getAllGroups,
  getGroupById,
  deleteGroup,
  // Files
  saveFile,
  getFilesByGroup,
  getFileById,
  deleteFileById,
  getExpiredFiles,
  countFilesByGroup,
};
