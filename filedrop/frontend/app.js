// app.js — FileDrop v2
// ══════════════════════════════════════════════
//  Lógica completa del frontend:
//    - Tabs
//    - Drag & drop + selección múltiple
//    - Upload con barra de progreso (XHR)
//    - Listado de archivos del grupo
//    - Descarga con contraseña
//    - Link compartible
// ══════════════════════════════════════════════

// ── Config ─────────────────────────────────────
const API_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  // En producción ajustar a tu URL de Render:
  // return 'https://filedrop-api.onrender.com/api';
  return 'https://marshallsdata.onrender.com';
})();

// ── Estado ─────────────────────────────────────
let selectedFiles = [];
let currentGroupId = null;
let currentPassword = null; // guardada en memoria para re-descargar sin re-autenticar

// ── DOM ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropzone       = $('dropzone');
const fileInput      = $('file-input');
const fileListWrap   = $('file-list-wrap');
const fileList       = $('file-list');
const upPassword     = $('up-password');
const progressRow    = $('progress-row');
const progressFill   = $('progress-fill');
const progressPct    = $('progress-pct');
const btnUpload      = $('btn-upload');
const uploadResult   = $('upload-result');
const acPassword     = $('ac-password');
const btnAccess      = $('btn-access');
const accessResult   = $('access-result');
const groupFilesWrap = $('group-files-wrap');
const groupFilesLabel= $('group-files-label');
const groupExpiryBadge = $('group-expiry-badge');
const dlFileList     = $('dl-file-list');
const shareModal     = $('share-modal');
const shareLinkText  = $('share-link-text');
const btnCopyLink    = $('btn-copy-link');
const modalClose     = $('modal-close');

// ══════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════

document.querySelectorAll('.nav-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const tab = pill.dataset.tab;

    document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    $('tab-upload').style.display = tab === 'upload' ? '' : 'none';
    $('tab-access').style.display = tab === 'access' ? '' : 'none';
  });
});

// ══════════════════════════════════════════════
//  PASSWORD TOGGLE
// ══════════════════════════════════════════════

document.querySelectorAll('[data-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.toggle);
    const show  = input.type === 'password';
    input.type  = show ? 'text' : 'password';
    btn.querySelector('.icon-eye-off').style.display = show ? 'none' : '';
    btn.querySelector('.icon-eye-on').style.display  = show ? '' : 'none';
  });
});

// ══════════════════════════════════════════════
//  DRAG & DROP + FILE SELECTION
// ══════════════════════════════════════════════

['dragenter', 'dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('over'); })
);

['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('over'); })
);

dropzone.addEventListener('drop', e => {
  const files = Array.from(e.dataTransfer.files);
  addFiles(files);
});

dropzone.addEventListener('click', e => {
  if (e.target !== fileInput) fileInput.click();
});

dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = ''; // Permite volver a seleccionar los mismos archivos
});

// ── Agregar archivos a la lista ────────────────
function addFiles(incoming) {
  const MAX      = 10 * 1024 * 1024;
  const oversized = [];

  for (const f of incoming) {
    if (f.size > MAX) {
      oversized.push(f.name);
      continue;
    }
    // Evitar duplicados
    if (!selectedFiles.find(sf => sf.name === f.name && sf.size === f.size)) {
      selectedFiles.push(f);
    }
  }

  if (oversized.length) {
    showResult(uploadResult, 'error',
      `⚠ ${oversized.length} archivo(s) descartado(s) por superar 10 MB:<br>
       <small>${oversized.join(', ')}</small>`
    );
  }

  renderFileList();
  updateUploadButton();
}

function renderFileList() {
  if (selectedFiles.length === 0) {
    fileListWrap.style.display = 'none';
    return;
  }

  fileListWrap.style.display = '';
  fileList.innerHTML = selectedFiles.map((f, i) => `
    <li class="file-list-item">
      <span class="file-name" title="${f.name}">${f.name}</span>
      <span class="file-size">${formatBytes(f.size)}</span>
      <button class="file-remove" data-idx="${i}" title="Quitar">×</button>
    </li>
  `).join('');

  // Botones de quitar
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderFileList();
      updateUploadButton();
    });
  });
}

function updateUploadButton() {
  btnUpload.disabled = selectedFiles.length === 0 || upPassword.value.trim().length < 4;
}

upPassword.addEventListener('input', updateUploadButton);

// ══════════════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════════════

btnUpload.addEventListener('click', doUpload);
upPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doUpload(); });

async function doUpload() {
  if (selectedFiles.length === 0) return;
  const pwd = upPassword.value.trim();
  if (pwd.length < 4) {
    showResult(uploadResult, 'error', '❌ La contraseña debe tener al menos 4 caracteres.');
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));
  formData.append('password', pwd);

  setLoading(btnUpload, 'btn-upload-label', true, 'Subiendo…');
  progressRow.style.display = 'flex';
  progressFill.style.width  = '0%';
  progressPct.textContent   = '0%';
  hideResult(uploadResult);

  try {
    const data = await xhrUpload(`${API_URL}/upload`, formData);

    currentGroupId  = data.groupId;
    currentPassword = pwd;

    // Mostrar resultado
    const fileItems = data.uploaded
      .map(f => `<li>${f.originalName} <span style="color:var(--ink-faint);font-size:12px">(${formatBytes(f.size)})</span></li>`)
      .join('');

    const warningFailed = data.failed?.length
      ? `<p style="margin-top:8px;color:#92400e">⚠ No se pudieron subir: ${data.failed.join(', ')}</p>`
      : '';

    const warningSkipped = data.skipped
      ? `<p style="margin-top:4px;color:#92400e">⚠ Se omitieron ${data.skipped} archivos (límite del grupo alcanzado)</p>`
      : '';

    showResult(uploadResult, 'success', `
      <strong>✅ ${data.uploaded.length} archivo(s) subido(s)</strong>
      <ul class="uploaded-list">${fileItems}</ul>
      ${warningFailed}${warningSkipped}
      <p style="margin-top:10px;font-size:13px">
        Expiran: <strong>${formatExpiry(data.expiresAt)}</strong>
      </p>
      <div class="result-btn-row">
        <button class="result-btn" id="btn-view-my-files">Ver mis archivos</button>
        <button class="result-btn primary" id="btn-share-group">🔗 Compartir link</button>
      </div>
    `);

    $('btn-view-my-files')?.addEventListener('click', () => {
      document.querySelector('[data-tab="access"]').click();
      acPassword.value = pwd;
      btnAccess.click();
    });

    $('btn-share-group')?.addEventListener('click', () => openShareModal(data.groupId));

    // Reset form
    selectedFiles = [];
    renderFileList();
    upPassword.value = '';
    updateUploadButton();

  } catch (err) {
    showResult(uploadResult, 'error', `❌ ${err.message}`);
  } finally {
    setLoading(btnUpload, 'btn-upload-label', false, 'Subir archivos');
    setTimeout(() => { progressRow.style.display = 'none'; }, 600);
  }
}

// XHR con progreso real
function xhrUpload(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = `${pct}%`;
        progressPct.textContent  = `${pct}%`;
      }
    });

    xhr.addEventListener('load', () => {
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { data = {}; }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || `Error del servidor (${xhr.status}).`));
      }
    });

    xhr.addEventListener('error',   () => reject(new Error('Error de red. Verificá tu conexión.')));
    xhr.addEventListener('timeout', () => reject(new Error('Timeout. El archivo puede ser demasiado grande.')));

    xhr.timeout = 90_000;
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

// ══════════════════════════════════════════════
//  ACCEDER A ARCHIVOS
// ══════════════════════════════════════════════

btnAccess.addEventListener('click', doAccess);
acPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doAccess(); });

async function doAccess() {
  const pwd = acPassword.value.trim();
  if (!pwd) {
    showResult(accessResult, 'error', '❌ Ingresá la contraseña.');
    return;
  }

  setLoading(btnAccess, 'btn-access-label', true, 'Buscando…');
  hideResult(accessResult);
  groupFilesWrap.style.display = 'none';

  try {
    const res  = await fetch(`${API_URL}/files`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pwd }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = res.status === 401
        ? '🔒 Contraseña incorrecta o sin archivos asociados.'
        : res.status === 404
          ? '📭 No hay archivos activos para esta contraseña.'
          : `❌ ${data.error}`;
      showResult(accessResult, res.status === 401 ? 'error' : 'info', msg);
      return;
    }

    currentGroupId  = data.groupId;
    currentPassword = pwd;
    renderDlFileList(data.files);

  } catch (err) {
    showResult(accessResult, 'error', `❌ Error de conexión: ${err.message}`);
  } finally {
    setLoading(btnAccess, 'btn-access-label', false, 'Ver mis archivos');
  }
}

function renderDlFileList(files) {
  if (!files || files.length === 0) {
    showResult(accessResult, 'info', '📭 No hay archivos activos.');
    return;
  }

  // Badge de expiración
  const minExpires = files.reduce((min, f) =>
    f.timeRemaining.hours * 60 + f.timeRemaining.minutes <
    min.hours * 60 + min.minutes ? f.timeRemaining : min,
    files[0].timeRemaining
  );
  groupExpiryBadge.textContent =
    `⏱ ${minExpires.hours}h ${minExpires.minutes}m restantes`;

  groupFilesLabel.textContent = `${files.length} archivo${files.length !== 1 ? 's' : ''}`;
  groupFilesWrap.style.display = '';

  dlFileList.innerHTML = files.map(f => `
    <li class="dl-file-item">
      <div class="dl-file-icon">${fileIcon(f.mimeType)}</div>
      <div class="dl-file-info">
        <div class="dl-file-name" title="${f.originalName}">${f.originalName}</div>
        <div class="dl-file-meta">${formatBytes(f.size)} · ${f.mimeType.split('/')[1] || f.mimeType}</div>
      </div>
      <div class="dl-file-time">⏱ ${f.timeRemaining.hours}h ${f.timeRemaining.minutes}m</div>
      <button class="dl-btn" data-file-id="${f.id}" data-file-name="${f.originalName}">
        ↓ Bajar
      </button>
    </li>
  `).join('');

  // Eventos de descarga
  dlFileList.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', () =>
      downloadFile(btn.dataset.fileId, btn.dataset.fileName, btn)
    );
  });
}

async function downloadFile(fileId, fileName, btn) {
  if (!currentPassword) {
    alert('Sesión expirada. Ingresá la contraseña de nuevo.');
    return;
  }

  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg> Bajando…`;

  try {
    const res = await fetch(`${API_URL}/files/download/${fileId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: currentPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = res.status === 401  ? 'Contraseña incorrecta.'
                : res.status === 410  ? 'Este archivo ya expiró.'
                : res.status === 404  ? 'Archivo no encontrado.'
                : data.error || 'Error al descargar.';
      alert(`❌ ${msg}`);
      return;
    }

    // Trigger descarga
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.innerHTML = '✓ Listo';
    setTimeout(() => { btn.innerHTML = originalLabel; btn.disabled = false; }, 2500);

  } catch (err) {
    alert(`❌ Error: ${err.message}`);
    btn.innerHTML = originalLabel;
    btn.disabled  = false;
  }
}

// ══════════════════════════════════════════════
//  SHARE MODAL
// ══════════════════════════════════════════════

function openShareModal(groupId) {
  const base = window.location.origin + window.location.pathname;
  const url  = `${base}?group=${groupId}`;
  shareLinkText.textContent = url;
  shareModal.style.display  = 'flex';
}

modalClose.addEventListener('click', () => { shareModal.style.display = 'none'; });
shareModal.addEventListener('click', e => {
  if (e.target === shareModal) shareModal.style.display = 'none';
});

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(shareLinkText.textContent).then(() => {
    btnCopyLink.textContent = '✓ Copiado!';
    setTimeout(() => { btnCopyLink.textContent = 'Copiar link'; }, 2000);
  });
});

// ── Leer group de la URL ───────────────────────
// Si viene ?group=XXX, cambiar a la tab de acceso con un mensaje
(function checkUrlGroup() {
  const params  = new URLSearchParams(window.location.search);
  const groupId = params.get('group');
  if (!groupId) return;

  // Cambiar a tab acceso
  document.querySelector('[data-tab="access"]').click();

  // Mostrar info del grupo antes de que ingresen contraseña
  fetch(`${API_URL}/files/${groupId}`)
    .then(r => r.json())
    .then(data => {
      if (data.fileCount) {
        showResult(accessResult, 'info',
          `🔗 Grupo compartido: <strong>${data.fileCount} archivo(s)</strong> · 
           Expiran en ${data.timeRemaining.hours}h ${data.timeRemaining.minutes}m.<br>
           <small>Ingresá la contraseña para descargar.</small>`
        );
      }
    })
    .catch(() => {});
})();

// ══════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════

function formatBytes(bytes) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatExpiry(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/'))       return '🖼️';
  if (mimeType.startsWith('video/'))       return '🎬';
  if (mimeType.startsWith('audio/'))       return '🎵';
  if (mimeType.includes('pdf'))            return '📕';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '🗜️';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel'))   return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.startsWith('text/'))        return '📃';
  return '📄';
}

function showResult(el, type, html) {
  el.className        = `result-area ${type}`;
  el.innerHTML        = html;
  el.style.display    = '';
}

function hideResult(el) {
  el.style.display = 'none';
}

function setLoading(btn, labelId, loading, label) {
  btn.disabled          = loading;
  $(labelId).textContent = label;
}
