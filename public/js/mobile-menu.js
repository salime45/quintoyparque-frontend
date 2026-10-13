/* El menú funciona aunque los servicios externos del mapa no estén disponibles. */
(() => {
  const mobile = matchMedia('(max-width: 760px)');
  const panel = document.getElementById('exploreMenu');
  const toggle = document.getElementById('menuToggle');
  const close = document.getElementById('menuClose');
  const backdrop = document.getElementById('menuBackdrop');
  const brand = document.querySelector('header .brand');
  const toolbar = document.querySelector('header .toolbar');
  const map = document.getElementById('map');
  let opened = false;

  function setOpen(value) {
    const hadFocus = panel.contains(document.activeElement);
    opened = mobile.matches && value;
    panel.classList.toggle('is-open', opened);
    panel.inert = mobile.matches && !opened;
    toggle.setAttribute('aria-expanded', String(opened));
    toggle.setAttribute('aria-label', opened ? 'Cerrar menú' : 'Abrir menú');
    backdrop.hidden = !opened;
    brand.inert = opened;
    toolbar.inert = opened;
    map.inert = opened;
    if (opened) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      close.focus();
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      if (mobile.matches && hadFocus) toggle.focus();
      else if (!mobile.matches && document.activeElement === close) {
        document.getElementById('reload').focus();
      }
    }
  }

  toggle.addEventListener('click', () => setOpen(!opened));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('qyp:close-menu', () => setOpen(false));
  if (mobile.addEventListener) mobile.addEventListener('change', () => setOpen(false));
  else mobile.addListener(() => setOpen(false));
  document.addEventListener('keydown', event => {
    if (!opened || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
        .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
      focusable.push(toggle);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  setOpen(false);
})();
