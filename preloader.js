/**
 * PRELOADER — shown briefly on every page load across the whole suite
 * Usage: call showPreloader() at the very top of a page's script,
 * then call hidePreloader() once the page has finished its first render.
 */

function injectPreloaderMarkup() {
  if (document.getElementById('zeva-preloader')) return;
  const el = document.createElement('div');
  el.id = 'zeva-preloader';
  el.className = 'zeva-preloader';
  el.innerHTML = `
    <div class="zeva-preloader-inner">
      <img src="assets/logo-primary.png" alt="Zeva CBT" class="zeva-preloader-logo" />
      <div class="zeva-preloader-bar"><div class="zeva-preloader-bar-fill"></div></div>
      <div class="zeva-preloader-caption">Powering Smarter Exams</div>
    </div>
  `;
  document.body.appendChild(el);
}

function showPreloader() {
  injectPreloaderMarkup();
  document.getElementById('zeva-preloader').classList.remove('hide');
}

/** Standard delay before the preloader hides (4s), same on every launch. */
function hidePreloader(minDelayMs = 4000) {
  const el = document.getElementById('zeva-preloader');
  if (!el) return;

  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 500);
  }, minDelayMs);
}

// Auto-inject and show immediately on script load, before DOM is ready
injectPreloaderMarkup();
