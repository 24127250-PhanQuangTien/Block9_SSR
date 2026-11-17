/* Navigation enhancement; data forms and links remain server-rendered. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const navbar = document.querySelector('.navbar');
  const toggle = document.querySelector('.navbar__toggle');
  const menu = document.querySelector('.navbar__menu');
  const backdrop = document.querySelector('.navbar__backdrop');
  let previousOverflow = '';
  const scroll = () => navbar?.classList.toggle('navbar--scrolled', scrollY > 60);
  addEventListener('scroll', scroll, { passive: true });
  scroll();
  function close(restoreFocus = false) {
    if (!menu?.classList.contains('open')) return;
    menu.classList.remove('open');
    toggle.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Mở menu điều hướng');
    backdrop.hidden = true;
    document.body.style.overflow = previousOverflow;
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  toggle?.addEventListener('click', () => {
    if (menu.classList.contains('open')) return close(true);
    previousOverflow = document.body.style.overflow;
    menu.classList.add('open');
    toggle.classList.add('active');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Đóng menu điều hướng');
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    menu.querySelector('a')?.focus({ preventScroll: true });
  });
  backdrop?.addEventListener('click', () => close(true));
  menu?.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      close(true);
      document.querySelectorAll('.account-menu[open]').forEach(item => { item.open = false; item.querySelector('summary').focus(); });
    }
  });
  document.addEventListener('click', event => {
    document.querySelectorAll('.account-menu[open]').forEach(item => { if (!item.contains(event.target)) item.open = false; });
  });
  navbar?.addEventListener('focusout', event => {
    if (event.relatedTarget && !navbar.contains(event.relatedTarget)) close();
  });
  matchMedia('(max-width: 768px)').addEventListener('change', () => close());
  document.querySelectorAll('.auth-form input[type="password"]').forEach(input => {
    const wrapper = document.createElement('div');
    wrapper.className = 'password-field';
    input.before(wrapper);
    wrapper.append(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.textContent = 'Hiện';
    button.setAttribute('aria-label', 'Hiện mật khẩu');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Ẩn' : 'Hiện';
      button.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      button.setAttribute('aria-pressed', String(show));
    });
    wrapper.append(button);
  });
})();
