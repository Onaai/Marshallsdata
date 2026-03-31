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

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no está configurado en .env');

  let credential;
  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON válido');
  }

  // ── Extraer project_id del propio JSON ────────
  // No se necesita FIREBASE_PROJECT_ID como variable separada
  const projectId = credential.project_id;
  if (!projectId) throw new Error('El JSON del Service Account no contiene project_id');

  // Inicializar solo una vez (evitar error "app already exists")
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credential),
      projectId,
    });
  }

  _db = admin.firestore();
  console.log('[Firestore] Conectado al proyecto:', projectId);
  return _db;
}

// ── Helper: validar que un ID sea string no vacío ──
function assertId(id, label = 'id') {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error(`[Firestore] ${label} inválido: "${id}"`);
  }
}

// ══════════════════════════════════════════════
//  FILE GROUPS
// ══════════════════════════════════════════════

async function createGroup(id, passwordHash) {
  assertId(id, 'groupId');
  const db = getDb();
  await db.collection('file_groups').doc(id).set({
    id,
    passwordHash,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getAllGroups() {
  const db   = getDb();
  const snap = await db.collection('file_groups').get();
  // Filtrar documentos corruptos (sin id válido)
  return snap.docs
    .map(d => d.data())
    .filter(g => g && g.id && typeof g.id === 'string');
}

async function getGroupById(id) {
  assertId(id, 'groupId');
  const db  = getDb();
  const doc = await db.collection('file_groups').doc(id).get();
  return doc.exists ? doc.data() : null;
}

async function deleteGroup(groupId) {
  assertId(groupId, 'groupId');
  const db    = getDb();
  const batch = db.batch();

  const filesSnap = await db
    .collection('files')
    .where('groupId', '==', groupId)
    .get();

  filesSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.collection('file_groups').doc(groupId));
  await batch.commit();
}

// ══════════════════════════════════════════════
//  FILES
// ══════════════════════════════════════════════

async function saveFile({
  id, groupId, driveFileId,
  originalName, mimeType, size,
  createdAt, expiresAt,
}) {
  assertId(id, 'fileId');
  assertId(groupId, 'groupId');
  assertId(driveFileId, 'driveFileId');

  const db = getDb();
  await db.collection('files').doc(id).set({
    id,
    groupId,
    driveFileId,
    originalName,
    mimeType,
    size,
    createdAt: admin.firestore.Timestamp.fromMillis(createdAt * 1000),
    expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt * 1000),
  });
}

async function getFilesByGroup(groupId) {
  assertId(groupId, 'groupId');
  const db   = getDb();
  const snap = await db
    .collection('files')
    .where('groupId', '==', groupId)
    .orderBy('createdAt', 'asc')
    .get();

  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        ...data,
        createdAt: data.createdAt?.seconds ?? 0,
        expiresAt: data.expiresAt?.seconds ?? 0,
      };
    })
    .filter(f => f.id && typeof f.id === 'string'); // descartar corruptos
}

async function getFileById(id) {
  assertId(id, 'fileId');
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

async function deleteFileById(id) {
  assertId(id, 'fileId');
  const db = getDb();
  await db.collection('files').doc(id).delete();
}

async function getExpiredFiles() {
  const db  = getDb();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection('files')
    .where('expiresAt', '<=', now)
    .get();

  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        ...data,
        createdAt: data.createdAt?.seconds ?? 0,
        expiresAt: data.expiresAt?.seconds ?? 0,
      };
    })
    .filter(f => {
      // ── Descartar documentos corruptos (sin id o driveFileId válido) ──
      if (!f.id || typeof f.id !== 'string') {
        console.warn('[Firestore] Documento expirado sin id válido, ignorando:', f);
        return false;
      }
      if (!f.driveFileId || typeof f.driveFileId !== 'string') {
        console.warn('[Firestore] Archivo sin driveFileId válido, ignorando:', f.id);
        return false;
      }
      return true;
    });
}

async function countFilesByGroup(groupId) {
  assertId(groupId, 'groupId');
  const db   = getDb();
  const snap = await db
    .collection('files')
    .where('groupId', '==', groupId)
    .count()
    .get();
  return snap.data().count;
}

// ── Limpiar documentos corruptos (sin ID válido) ──
// Útil para correr una vez si hay basura en Firestore
async function cleanCorruptedDocs() {
  const db = getDb();
  let cleaned = 0;

  const filesSnap = await db.collection('files').get();
  const batch = db.batch();

  for (const doc of filesSnap.docs) {
    const data = doc.data();
    if (!data.id || !data.driveFileId || !data.groupId) {
      console.log('[Firestore] Eliminando doc corrupto:', doc.id, data);
      batch.delete(doc.ref);
      cleaned++;
    }
  }

  if (cleaned > 0) await batch.commit();
  console.log(`[Firestore] Limpieza de corruptos: ${cleaned} doc(s) eliminados`);
  return cleaned;
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
  // Utilidades
  cleanCorruptedDocs,
};
