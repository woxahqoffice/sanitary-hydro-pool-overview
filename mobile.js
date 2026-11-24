/* มือถือ: ตารางเลื่อนซ้ายขวา คำแนะนำเลื่อน ภาพเรนเดอร์แตะดูภาพละเอียด เมนูเลื่อนไปหน้าปัจจุบัน ติดตั้งเป็นแอป */
(function () {
  'use strict';

  // ---------- โหมดแสงสว่าง / มืด (จำค่าไว้ในเครื่องผู้ดู) ----------
  var KEY = 'w2b-theme';
  function getT() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function applyT(t) {
    var r = document.documentElement;
    if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    var dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (m) m.setAttribute('content', dark ? '#161413' : '#ffffff');
    document.querySelectorAll('[data-tbtn]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tbtn === t ? 'true' : 'false'); });
  }
  function setT(t) { try { localStorage.setItem(KEY, t); } catch (e) {} applyT(t); }
  applyT(getT());
  var SVG = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    auto: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    drop: '<path d="M12 2.7c3.6 4.2 6 7.5 6 10.8a6 6 0 0 1-12 0c0-3.3 2.4-6.6 6-10.8z"/>',
    wave: '<path d="M2 7c2 0 2-1.5 4-1.5S8 7 10 7s2-1.5 4-1.5S16 7 18 7s2-1.5 4-1.5"/><path d="M2 12c2 0 2-1.5 4-1.5S8 12 10 12s2-1.5 4-1.5S16 12 18 12s2-1.5 4-1.5"/><path d="M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5S16 17 18 17s2-1.5 4-1.5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + SVG[n] + '</svg>'; }
  function themeSwitch(cls) {
    return '<div class="tsw ' + (cls || '') + '" role="group" aria-label="โหมดแสง">' +
      [['light', 'sun', 'สว่าง'], ['dark', 'moon', 'มืด'], ['auto', 'auto', 'ตามเครื่อง']].map(function (o) {
        return '<button type="button" data-tbtn="' + o[0] + '" title="' + o[2] + '">' + ic(o[1]) + '<span>' + o[2] + '</span></button>';
      }).join('') + '</div>';
  }
  function shell() {
    var nav = document.querySelector('.snav .in');
    if (nav && !nav.querySelector('.tsw')) nav.insertAdjacentHTML('beforeend', themeSwitch('top'));
    if (document.querySelector('.bnav')) return;
    var here = decodeURIComponent(location.pathname.split('/').pop() || 'index.html') || 'index.html';
    var links = [].slice.call(document.querySelectorAll('.snav .in a.l')).map(function (a) { return [a.getAttribute('href'), a.textContent.trim()]; });
    var fav = [['index.html', 'home', 'หน้าแรก'], ['water.html', 'drop', 'น้ำประปา'], ['ระบบน้ำสระวารีบำบัด_ภาพด้านข้าง.html', 'wave', 'สระ'], ['sim.html', 'box', 'จำลอง 3D']];
    var b = document.createElement('nav'); b.className = 'bnav'; b.setAttribute('aria-label', 'เมนูหลักบนมือถือ');
    b.innerHTML = fav.map(function (f) { return '<a href="' + f[0] + '"' + (here === f[0] ? ' class="on" aria-current="page"' : '') + '>' + ic(f[1]) + '<span>' + f[2] + '</span></a>'; }).join('') +
      '<button type="button" data-open-sheet>' + ic('menu') + '<span>เมนู</span></button>';
    document.body.appendChild(b);
    var sh = document.createElement('div'); sh.className = 'bsheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'เมนูทั้งหมด');
    sh.innerHTML = '<div class="pan"><h3>ทุกหน้าในเว็บไซต์</h3><div class="g">' + links.map(function (l) { return '<a href="' + l[0] + '"' + (here === l[0] ? ' class="on"' : '') + '>' + l[1] + '</a>'; }).join('') +
      '</div><h3 style="margin-top:16px">โหมดแสง</h3>' + themeSwitch('sheet') + '</div>';
    document.body.appendChild(sh);
    b.querySelector('[data-open-sheet]').onclick = function () { sh.dataset.open = '1'; };
    sh.addEventListener('click', function (e) { if (e.target === sh) sh.dataset.open = '0'; });
    document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-tbtn]'); if (t) setT(t.dataset.tbtn); });
    applyT(getT());
  }
  function hint(el, txt) {
    if (el.previousElementSibling && el.previousElementSibling.classList.contains('mhint')) return;
    var h = document.createElement('div'); h.className = 'mhint'; h.textContent = txt; el.parentNode.insertBefore(h, el);
  }
  function run() {
    shell();
    document.querySelectorAll('table').forEach(function (t) {
      var p = t.parentElement;
      if (!(p.classList.contains('tw') || p.classList.contains('mtw') || getComputedStyle(p).overflowX === 'auto')) {
        var w = document.createElement('div'); w.className = 'mtw'; p.insertBefore(w, t); w.appendChild(t); p = w;
      }
    });
    var small = window.matchMedia('(max-width:760px)').matches;
    if (small) {
      document.querySelectorAll('.mtw,.tw,.diagram').forEach(function (el) {
        if (el.scrollWidth > el.clientWidth + 8) hint(el, el.classList.contains('diagram') ? 'เลื่อนภาพซ้ายขวาเพื่อดูทั้งระบบ' : 'เลื่อนตารางซ้ายขวาเพื่อดูทุกคอลัมน์');
      });
    }
    document.querySelectorAll('figure.render img, figure img[src^="render_"]').forEach(function (img) {
      var src = img.getAttribute('src'); if (!/^render_\w+\.jpg$/.test(src) || img.dataset.hd) return;
      img.dataset.hd = '1'; var hd = src.replace('.jpg', '_hd.jpg');
      var a = document.createElement('a'); a.href = hd; a.target = '_blank'; a.rel = 'noopener'; img.parentNode.insertBefore(a, img); a.appendChild(img);
      var l = document.createElement('a'); l.href = hd; l.target = '_blank'; l.rel = 'noopener'; l.className = 'hdlink'; l.textContent = 'แตะเพื่อเปิดภาพละเอียด ซูมดูป้ายได้';
      a.parentNode.insertBefore(l, a.nextSibling);
    });
    var on = document.querySelector('.snav .l.on'), bar = document.querySelector('.snav .in');
    if (on && bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, on.offsetLeft - 70);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
