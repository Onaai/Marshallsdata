// src/services/drive.js
// ══════════════════════════════════════════════
//  Integración con Google Drive API v3
//  Service Account — archivos privados en carpeta compartida
// ══════════════════════════════════════════════

const { google }  = require('googleapis');
const { Readable } = require('stream');

// ── Auth (singleton) ───────────────────────────
let _auth = null;

function getAuth() {
  if (_auth) return _auth;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no está configurado');

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido');
  }

  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return _auth;
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// ── Subir archivo ─────────────────────────────
/**
 * @param {Object} opts
 * @param {Buffer} opts.buffer      - Contenido del archivo
 * @param {string} opts.filename    - Nombre con que se guarda en Drive
 * @param {string} opts.mimetype    - MIME type
 * @returns {Promise<string>}       - fileId en Google Drive
 */
async function uploadFile({ buffer, filename, mimetype }) {
  const drive    = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID no está configurado');

  // Buffer → Readable stream
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name:    filename,
      parents: [folderId],
    },
    media: {
      mimeType: mimetype || 'application/octet-stream',
      body:     stream,
    },
    fields: 'id',
  });

  return res.data.id;
}

// ── Descargar archivo (stream) ────────────────
/**
 * @param {string} driveFileId
 * @returns {Promise<ReadableStream>}
 */
async function downloadFile(driveFileId) {
  const drive = getDriveClient();

  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return res.data;
}

// ── Eliminar archivo ──────────────────────────
/**
 * @param {string} driveFileId
 */
async function deleteFile(driveFileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId: driveFileId });
}

module.exports = { uploadFile, downloadFile, deleteFile };
