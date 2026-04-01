// app.js — Marshall's Information
// ══════════════════════════════════════════════

// ── Config ─────────────────────────────────────
const API_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001/api';
  return 'https://marshallsdata.onrender.com/api';
})();

// ── Estado ─────────────────────────────────────
let selectedFiles   = [];
let currentGroupId  = null;
let currentPassword = null;

// ── DOM ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropzone         = $('dropzone');
const fileInput        = $('file-input');
const fileListWrap     = $('file-list-wrap');
const fileList         = $('file-list');
const upPassword       = $('up-password');
const progressWrap     = $('progress-wrap');
const progressFill     = $('progress-fill');
const progressPct      = $('progress-pct');
const progressBlocks   = $('progress-blocks');
const progressStatus   = $('progress-status');
const btnUpload        = $('btn-upload');
const uploadResult     = $('upload-result');
const acPassword       = $('ac-password');
const btnAccess        = $('btn-access');
const accessResult     = $('access-result');
const groupFilesWrap   = $('group-files-wrap');
const groupFilesLabel  = $('group-files-label');
const groupExpiryBadge = $('group-expiry-badge');
const dlFileList       = $('dl-file-list');
const shareModal       = $('share-modal');
const shareLinkText    = $('share-link-text');
const btnCopyLink      = $('btn-copy-link');
const modalClose       = $('modal-close');

// ══════════════════════════════════════════════
//  GNX EASTER EGG
//  Escribí "gnx" en cualquier parte de la página
// ══════════════════════════════════════════════

const GNX_SEQUENCE = 'gnx';
let gnxBuffer = '';
let gnxRunning = false;

document.addEventListener('keydown', e => {
  // No activar si el usuario está escribiendo en un input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  gnxBuffer += e.key.toLowerCase();
  if (gnxBuffer.length > GNX_SEQUENCE.length) {
    gnxBuffer = gnxBuffer.slice(-GNX_SEQUENCE.length);
  }

  if (gnxBuffer === GNX_SEQUENCE && !gnxRunning) {
    gnxBuffer = '';
    fireGNX();
  }
});

function fireGNX() {
  gnxRunning = true;
  const stage = $('gnx-stage');
  const car   = $('gnx-car');
  const trail = $('gnx-trail');

  stage.style.display = 'block';

  // Reset
  car.style.transition   = 'none';
  trail.style.transition = 'none';
  car.style.transform    = 'translateX(0)';
  trail.style.width      = '0px';
  trail.style.left       = '0px';

  const vw = window.innerWidth;
  const carW = 380;

  // Pequeño delay para que el reset se aplique
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const duration = 2200; // ms

      // Animar auto
      car.style.transition  = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      car.style.transform   = `translateX(${vw + carW + 80}px)`;

      // Trail: crece mientras el auto avanza, luego se desvanece
      trail.style.transition = `width ${duration * 0.7}ms ease-out, opacity ${duration * 0.4}ms ease-in ${duration * 0.6}ms`;
      trail.style.width      = `${vw * 0.7}px`;
      trail.style.opacity    = '1';

      // Limpiar al terminar
      setTimeout(() => {
        trail.style.opacity = '0';
        setTimeout(() => {
          stage.style.display = 'none';
          car.style.transition = 'none';
          car.style.transform  = 'translateX(0)';
          trail.style.transition = 'none';
          trail.style.width      = '0';
          trail.style.opacity    = '1';
          gnxRunning = false;
        }, 600);
      }, duration);
    });
  });
}

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
    btn.querySelector('.icon-eye-on').style.display  = show ? ''     : 'none';
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

dropzone.addEventListener('drop',  e => addFiles(Array.from(e.dataTransfer.files)));
dropzone.addEventListener('click', e => { if (e.target !== fileInput) fileInput.click(); });
dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

function addFiles(incoming) {
  const MAX = 10 * 1024 * 1024;
  const oversized = [];

  for (const f of incoming) {
    if (f.size > MAX) { oversized.push(f.name); continue; }
    if (!selectedFiles.find(sf => sf.name === f.name && sf.size === f.size)) {
      selectedFiles.push(f);
    }
  }

  if (oversized.length) {
    showResult(uploadResult, 'error',
      `REJECTED: ${oversized.length} file(s) exceed 10 MB limit.<br><small style="opacity:.6">${oversized.join(' · ')}</small>`
    );
  }

  renderFileList();
  updateUploadButton();
}

function renderFileList() {
  if (selectedFiles.length === 0) { fileListWrap.style.display = 'none'; return; }
  fileListWrap.style.display = '';
  fileList.innerHTML = selectedFiles.map((f, i) => `
    <li class="file-list-item">
      <span class="file-name" title="${f.name}">${f.name}</span>
      <span class="file-size">${formatBytes(f.size)}</span>
      <button class="file-remove" data-idx="${i}" title="Remove">×</button>
    </li>
  `).join('');

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
//  PROGRESS — DIESEL BLOCKS ANIMATION
// ══════════════════════════════════════════════

const BLOCKS_TOTAL = 22;
const BLOCK_FILLED = '▪';
const BLOCK_EMPTY  = '□';

function updateProgressUI(pct) {
  // Porcentaje con ceros a la izquierda
  progressPct.textContent = String(pct).padStart(3, '0') + '%';

  // Barra de relleno
  progressFill.style.width = `${pct}%`;

  // Bloques tipo cargo
  const filled = Math.round((pct / 100) * BLOCKS_TOTAL);
  progressBlocks.textContent =
    BLOCK_FILLED.repeat(filled) + BLOCK_EMPTY.repeat(BLOCKS_TOTAL - filled);

  // Status text cycling
  const statuses = ['TRANSMITTING', 'ENCODING', 'ROUTING', 'UPLOADING', 'SECURING'];
  progressStatus.textContent = statuses[Math.floor(Date.now() / 600) % statuses.length];
}

// ══════════════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════════════

btnUpload.addEventListener('click', doUpload);
upPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doUpload(); });

async function doUpload() {
  if (selectedFiles.length === 0) return;
  const pwd = upPassword.value.trim();
  if (pwd.length < 4) {
    showResult(uploadResult, 'error', 'ACCESS KEY must be at least 4 characters.');
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));
  formData.append('password', pwd);

  setLoading(btnUpload, 'btn-upload-label', true, 'TRANSMITTING...');
  progressWrap.style.display = 'flex';
  updateProgressUI(0);
  hideResult(uploadResult);

  // Cycler para el status text mientras sube
  const statusCycler = setInterval(() => {
    if (progressStatus) {
      const statuses = ['TRANSMITTING', 'ENCODING', 'ROUTING', 'UPLOADING', 'SECURING'];
      progressStatus.textContent = statuses[Math.floor(Date.now() / 500) % statuses.length];
    }
  }, 500);

  try {
    const data = await xhrUpload(`${API_URL}/upload`, formData);
    currentGroupId  = data.groupId;
    currentPassword = pwd;

    const fileItems = data.uploaded
      .map(f => `<li>${f.originalName} <span style="opacity:.5;font-size:10px">${formatBytes(f.size)}</span></li>`)
      .join('');

    const warnFailed  = data.failed?.length
      ? `<p style="margin-top:8px;color:#c96060;font-size:11px">FAILED: ${data.failed.join(' · ')}</p>` : '';
    const warnSkipped = data.skipped
      ? `<p style="font-size:11px;opacity:.6">+ ${data.skipped} file(s) skipped (group limit reached)</p>` : '';

    showResult(uploadResult, 'success', `
      <div style="font-size:10px;letter-spacing:.15em;opacity:.6;margin-bottom:8px">TRANSMISSION COMPLETE</div>
      <strong style="font-family:'Barlow Condensed',sans-serif;font-size:18px;letter-spacing:.05em">
        ${data.uploaded.length} FILE${data.uploaded.length !== 1 ? 'S' : ''} UPLOADED
      </strong>
      <ul class="uploaded-list">${fileItems}</ul>
      ${warnFailed}${warnSkipped}
      <p style="margin-top:10px;font-size:10px;opacity:.5;letter-spacing:.08em">
        EXPIRES: ${formatExpiry(data.expiresAt)}
      </p>
      <div class="result-btn-row">
        <button class="result-btn" id="btn-view-my-files">VIEW FILES</button>
        <button class="result-btn primary" id="btn-share-group">SHARE LINK</button>
      </div>
    `);

    $('btn-view-my-files')?.addEventListener('click', () => {
      document.querySelector('[data-tab="access"]').click();
      acPassword.value = pwd;
      btnAccess.click();
    });

    $('btn-share-group')?.addEventListener('click', () => openShareModal(data.groupId));

    selectedFiles = [];
    renderFileList();
    upPassword.value = '';
    updateUploadButton();

    // Completar la barra al 100%
    updateProgressUI(100);

  } catch (err) {
    showResult(uploadResult, 'error', `TRANSMISSION FAILED: ${err.message}`);
  } finally {
    clearInterval(statusCycler);
    setLoading(btnUpload, 'btn-upload-label', false, 'TRANSMIT');
    setTimeout(() => { progressWrap.style.display = 'none'; }, 1200);
  }
}

// XHR con progreso real
function xhrUpload(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        updateProgressUI(pct);
      }
    });

    xhr.addEventListener('load', () => {
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Server error (${xhr.status})`));
    });

    xhr.addEventListener('error',   () => reject(new Error('Network error. Check connection.')));
    xhr.addEventListener('timeout', () => reject(new Error('Timeout. File may be too large.')));

    xhr.timeout = 90_000;
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

// ══════════════════════════════════════════════
//  ACCESS FILES
// ══════════════════════════════════════════════

btnAccess.addEventListener('click', doAccess);
acPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doAccess(); });

async function doAccess() {
  const pwd = acPassword.value.trim();
  if (!pwd) { showResult(accessResult, 'error', 'ACCESS KEY required.'); return; }

  setLoading(btnAccess, 'btn-access-label', true, 'AUTHENTICATING...');
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
      const msg = res.status === 401 ? 'ACCESS DENIED — invalid key.'
                : res.status === 404 ? 'NO FILES FOUND for this key.'
                : `ERROR: ${data.error}`;
      showResult(accessResult, res.status === 401 ? 'error' : 'info', msg);
      return;
    }

    currentGroupId  = data.groupId;
    currentPassword = pwd;
    renderDlFileList(data.files);

  } catch (err) {
    showResult(accessResult, 'error', `CONNECTION ERROR: ${err.message}`);
  } finally {
    setLoading(btnAccess, 'btn-access-label', false, 'AUTHENTICATE');
  }
}

function renderDlFileList(files) {
  if (!files || files.length === 0) {
    showResult(accessResult, 'info', 'NO ACTIVE FILES.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const minLeft = files.reduce((min, f) => {
    const secs = (f.timeRemaining.hours * 3600) + (f.timeRemaining.minutes * 60);
    return secs < min ? secs : min;
  }, Infinity);

  const hLeft = Math.floor(minLeft / 3600);
  const mLeft = Math.floor((minLeft % 3600) / 60);
  groupExpiryBadge.textContent = `EXPIRES IN ${hLeft}H ${mLeft}M`;
  groupFilesLabel.textContent  = `// ${files.length} file${files.length !== 1 ? 's' : ''}`;
  groupFilesWrap.style.display = '';

  dlFileList.innerHTML = files.map(f => `
    <li class="dl-file-item">
      <div class="dl-file-icon">${fileIcon(f.mimeType)}</div>
      <div class="dl-file-info">
        <div class="dl-file-name" title="${f.originalName}">${f.originalName}</div>
        <div class="dl-file-meta">${formatBytes(f.size)} · ${f.mimeType.split('/')[1] || f.mimeType}</div>
      </div>
      <div class="dl-file-time">${f.timeRemaining.hours}H ${f.timeRemaining.minutes}M</div>
      <button class="dl-btn" data-file-id="${f.id}" data-file-name="${f.originalName}">
        ↓ GET
      </button>
    </li>
  `).join('');

  dlFileList.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', () => downloadFile(btn.dataset.fileId, btn.dataset.fileName, btn));
  });
}

async function downloadFile(fileId, fileName, btn) {
  if (!currentPassword) { alert('Session expired. Re-enter your key.'); return; }

  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;

  try {
    const res = await fetch(`${API_URL}/files/download/${fileId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: currentPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = res.status === 401 ? 'DENIED'
                : res.status === 410 ? 'EXPIRED'
                : res.status === 404 ? 'NOT FOUND'
                : data.error || 'ERROR';
      alert(msg);
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.innerHTML = '✓';
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2500);
  } catch (err) {
    alert(`ERROR: ${err.message}`);
    btn.innerHTML = orig;
    btn.disabled  = false;
  }
}

// ══════════════════════════════════════════════
//  SHARE MODAL
// ══════════════════════════════════════════════

function openShareModal(groupId) {
  const url = `${window.location.origin}${window.location.pathname}?group=${groupId}`;
  shareLinkText.textContent = url;
  shareModal.style.display  = 'flex';
}

modalClose.addEventListener('click', () => { shareModal.style.display = 'none'; });
shareModal.addEventListener('click', e => { if (e.target === shareModal) shareModal.style.display = 'none'; });

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(shareLinkText.textContent).then(() => {
    btnCopyLink.textContent = 'COPIED';
    setTimeout(() => { btnCopyLink.textContent = 'COPY LINK'; }, 2000);
  });
});

// ── URL group param ────────────────────────────
(function checkUrlGroup() {
  const params  = new URLSearchParams(window.location.search);
  const groupId = params.get('group');
  if (!groupId) return;

  document.querySelector('[data-tab="access"]').click();

  fetch(`${API_URL}/files/${groupId}`)
    .then(r => r.json())
    .then(data => {
      if (data.fileCount) {
        showResult(accessResult, 'info',
          `SHARED GROUP — ${data.fileCount} FILE${data.fileCount !== 1 ? 'S' : ''} ` +
          `· EXPIRES IN ${data.timeRemaining.hours}H ${data.timeRemaining.minutes}M<br>` +
          `<span style="font-size:10px;opacity:.5">Enter access key to retrieve.</span>`
        );
      }
    })
    .catch(() => {});
})();

// ══════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════

function formatBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1048576)     return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function formatExpiry(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(mime) {
  if (!mime) return '▪';
  if (mime.startsWith('image/'))  return '▪';
  if (mime.startsWith('video/'))  return '▪';
  if (mime.startsWith('audio/'))  return '▪';
  if (mime.includes('pdf'))       return '▪';
  if (mime.includes('zip') || mime.includes('rar')) return '▪';
  if (mime.includes('word') || mime.includes('document')) return '▪';
  if (mime.includes('sheet') || mime.includes('excel'))   return '▪';
  return '▪';
}

function showResult(el, type, html) {
  el.className     = `result-area ${type}`;
  el.innerHTML     = html;
  el.style.display = '';
}

function hideResult(el) { el.style.display = 'none'; }

function setLoading(btn, labelId, loading, label) {
  btn.disabled           = loading;
  $(labelId).textContent = label;
}
