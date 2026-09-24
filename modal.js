/**
 * BRANDED MODAL — replaces window.confirm()/alert() everywhere in the suite.
 * Usage:
 *   zevaModal.confirm({ title, message, confirmText, cancelText }) -> Promise<boolean>
 *   zevaModal.alert({ title, message, okText }) -> Promise<void>
 */

function ensureModalRoot() {
  if (document.getElementById('zeva-modal-root')) return;
  const root = document.createElement('div');
  root.id = 'zeva-modal-root';
  document.body.appendChild(root);
}

const zevaModal = {
  confirm({ title = 'Please confirm', message = '', confirmText = 'Confirm', cancelText = 'Cancel', tone = 'default' } = {}) {
    ensureModalRoot();
    return new Promise((resolve) => {
      const root = document.getElementById('zeva-modal-root');
      root.innerHTML = `
        <div class="zeva-modal-overlay">
          <div class="zeva-modal-card">
            <img src="assets/logo-icon.png" alt="" class="zeva-modal-icon" />
            <h3 class="zeva-modal-title">${title}</h3>
            <p class="zeva-modal-message">${message}</p>
            <div class="zeva-modal-actions">
              <button class="btn-secondary zeva-modal-cancel">${cancelText}</button>
              <button class="${tone === 'danger' ? 'btn-submit-exam' : 'btn-primary'} zeva-modal-confirm" style="width:auto; padding:12px 22px;">${confirmText}</button>
            </div>
          </div>
        </div>
      `;
      const overlay = root.querySelector('.zeva-modal-overlay');
      requestAnimationFrame(() => overlay.classList.add('show'));

      function close(result) {
        overlay.classList.remove('show');
        setTimeout(() => { root.innerHTML = ''; }, 250);
        resolve(result);
      }
      root.querySelector('.zeva-modal-confirm').addEventListener('click', () => close(true));
      root.querySelector('.zeva-modal-cancel').addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
  },

  alert({ title = 'Notice', message = '', okText = 'OK', tone = 'default' } = {}) {
    ensureModalRoot();
    return new Promise((resolve) => {
      const root = document.getElementById('zeva-modal-root');
      root.innerHTML = `
        <div class="zeva-modal-overlay">
          <div class="zeva-modal-card">
            <img src="assets/logo-icon.png" alt="" class="zeva-modal-icon" />
            <h3 class="zeva-modal-title">${title}</h3>
            <p class="zeva-modal-message">${message}</p>
            <div class="zeva-modal-actions" style="justify-content:center;">
              <button class="btn-primary zeva-modal-ok" style="width:auto; padding:12px 28px;">${okText}</button>
            </div>
          </div>
        </div>
      `;
      const overlay = root.querySelector('.zeva-modal-overlay');
      requestAnimationFrame(() => overlay.classList.add('show'));

      function close() {
        overlay.classList.remove('show');
        setTimeout(() => { root.innerHTML = ''; }, 250);
        resolve();
      }
      root.querySelector('.zeva-modal-ok').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    });
  },
};

window.zevaModal = zevaModal;
