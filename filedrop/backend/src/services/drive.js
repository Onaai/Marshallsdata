// src/services/drive.js
// ══════════════════════════════════════════════
//  Google Drive API v3 — OAuth2 con cuenta personal
//
//  Por qué OAuth2 y no Service Account:
//  Los Service Accounts no tienen cuota de Drive propia.
//  Con OAuth2 los archivos se suben a tu Drive personal
//  y cuentan contra tus 15 GB gratuitos de Google.
//
//  Variables de entorno requeridas:
//    GOOGLE_CLIENT_ID
//    GOOGLE_CLIENT_SECRET
//    GOOGLE_REFRESH_TOKEN
//    GOOGLE_DRIVE_FOLDER_ID
// ══════════════════════════════════════════════

const { google }   = require('googleapis');
const { Readable } = require('stream');

// ── Auth OAuth2 (singleton) ────────────────────
let _oauth2Client = null;

function getOAuth2Client() {
  if (_oauth2Client) return _oauth2Client;

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Faltan variables de entorno de Google OAuth2: ' +
      'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN'
    );
  }

  _oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  _oauth2Client.setCredentials({ refresh_token: refreshToken });

  return _oauth2Client;
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

// ── Subir archivo ──────────────────────────────
async function uploadFile({ buffer, filename, mimetype }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID no está configurado');

  const drive  = getDriveClient();
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

// ── Descargar archivo (stream) ─────────────────
async function downloadFile(driveFileId) {
  const drive = getDriveClient();
  const res   = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data;
}

// ── Eliminar archivo ───────────────────────────
async function deleteFile(driveFileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId: driveFileId });
}

module.exports = { uploadFile, downloadFile, deleteFile };