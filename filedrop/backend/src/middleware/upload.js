// src/middleware/upload.js
// ══════════════════════════════════════════════
//  Multer — recibe archivos en memoria (buffer)
//  antes de subirlos a Google Drive
// ══════════════════════════════════════════════

const multer = require('multer');

const MAX_SIZE       = parseInt(process.env.MAX_FILE_SIZE)    || 10 * 1024 * 1024; // 10 MB
const MAX_PER_REQUEST = 10; // Máx archivos por request

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:  MAX_SIZE,
    files:     MAX_PER_REQUEST,
  },
  fileFilter: (_req, file, cb) => {
    // Sanitizar nombre: reemplazar caracteres peligrosos
    file.originalname = file.originalname
      .replace(/[^\w.\-\s]/g, '_')
      .trim()
      .substring(0, 200); // Límite de largo
    cb(null, true);
  },
});

module.exports = upload;
