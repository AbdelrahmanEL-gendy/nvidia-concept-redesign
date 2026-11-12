import { createScene } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');               // ?demo  -> hands-free auto-scroll for screen recording
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (params.get('cursor') === '0') document.documentElement.classList.add('no-cursor');

/* ---------- text splitting ---------- */
$$('[data-split]').forEach((el) => {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w, i) => `<span class="w"><span class="wi" style="--i:${i}">${w}</span></span>`).join(' ');
});
$$('[data-chars]').forEach((el) => {
  el.innerHTML = [...el.textContent].map((ch) => `<span class="c"><span class="ci">${ch === ' ' ? '&nbsp;' : ch}</span></span>`).join('');
});

/* ---------- smooth scroll ---------- */
const lenis = new Lenis({ lerp: DEMO ? 0.12 : 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
lenis.stop();

/* ---------- WebGL ---------- */
const scene = createScene($('#gl'), { reduced });

/* ---------- clock ---------- */
const clockEl = $('[data-clock]');
const tick = () => {
  clockEl.textContent = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' }).format(new Date());
};
tick(); setInterval(tick, 15000);

/* ---------- loader -> intro ---------- */
const heroChars = $$('.hero .ci');
const heroFade = $$('.hero__fade, .hero__meta');
gsap.set(heroChars, { yPercent: 115 });
gsap.set(heroFade, { opacity: 0, y: 20 });

function runLoader() {
  const count = $('[data-count]'), bar = $('.loader__bar i'), label = $('[data-loader-label]');
  const labels = ['Allocating VRAM', 'Compiling kernels', 'Warming tensor cores', 'Ready'];
  const o = { v: 0 };
  gsap.to(o, {
    v: 100, duration: reduced ? 0.4 : 2.4, ease: 'power2.inOut',
    onUpdate() {
      count.textContent = String(Math.round(o.v)).padStart(3, '0');
      bar.style.transform = `scaleX(${o.v / 100})`;
      label.textContent = labels[Math.min(3, Math.floor(o.v / 34))];
    },
    onComplete: reveal,
  });
}

function reveal() {
  const tl = gsap.timeline();
  tl.to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' })
    .to({ v: 0 }, { v: 1, duration: reduced ? 0.01 : 3.0, ease: 'none', onUpdate() { scene.setIntro(this.targets()[0].v); } }, 0.25)
    .to(heroChars, { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.035 }, 0.55)
    .to(heroFade, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }, 1.1)
    .add(() => {
      $('.loader').style.display = 'none';
      document.body.classList.remove('is-loading');
      lenis.start();
      if (DEMO) setTimeout(runDemo, 1200);
    }, 1.2);
}

if (document.visibilityState === 'visible') runLoader();
else document.addEventListener('visibilitychange', function once() {
  if (document.visibilityState !== 'visible') return;
  document.removeEventListener('visibilitychange', once);
  runLoader();
});

/* ---------- demo auto-scroll (for the reel) ---------- */
function runDemo() {
  const stops = [
    ['#stage', 0.13, 3.2], ['#stage', 0.27, 3.6], ['#stage', 0.47, 4.2], ['#stage', 0.71, 4.2],
    ['#stage', 0.93, 4.2], ['#industries', 0, 3.0], ['#latest', 0.5, 5], ['#latest', 1, 4],
    ['#gtc', 0.9, 4.5], ['end', 0, 3],
  ];
  let i = 0;
  const next = () => {
    if (i >= stops.length) return;
    const [sel, frac, dur] = stops[i++];
    let y;
    if (sel === 'end') y = document.documentElement.scrollHeight - innerHeight;
    else {
      const el = $(sel), top = el.offsetTop;
      y = top + frac * Math.max(0, el.offsetHeight - innerHeight);
      if (sel === '#industries') y = top - innerHeight * 0.05 + 40;
    }
    lenis.scrollTo(y, { duration: dur, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), onComplete: () => setTimeout(next, 900) });
  };
  next();
}

/* ---------- pointer, cursor, magnetic ---------- */
const cursor = $('.cursor'), cursorLabel = $('.cursor__label');
const mouse = { x: innerWidth / 2, y: innerHeight / 2 }, cpos = { x: mouse.x, y: mouse.y };
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  scene.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
document.addEventListener('pointerover', (e) => {
  const lab = e.target.closest('[data-cursor]');
  const hov = e.target.closest('a, button');
  cursor.classList.toggle('is-label', !!lab);
  cursor.classList.toggle('is-hover', !lab && !!hov);
  if (lab) cursorLabel.textContent = lab.dataset.cursor;
});
$$('[data-magnetic]').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.6, ease: 'power3.out' });
  });
  el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }));
});

/* ---------- nav hide on scroll down ---------- */
const nav = $('.nav');
let lastY = 0;
lenis.on('scroll', ({ scroll }) => {
  nav.classList.toggle('is-hidden', scroll > lastY && scroll > 200 && !DEMO);
  lastY = scroll;
});

/* ---------- industries hover preview ---------- */
const preview = $('.preview'), arts = $$('.preview__art'), ptag = $('.preview__tag');
const pv = { x: 0, y: 0, s: 0.6, on: false };
$$('.ind').forEach((row, i) => {
  row.addEventListener('pointerenter', () => {
    pv.on = true; preview.classList.add('is-on');
    arts.forEach((a, j) => a.classList.toggle('is-on', j === i));
    ptag.textContent = row.querySelector('.ind__name').textContent;
  });
  row.addEventListener('pointerleave', () => { pv.on = false; preview.classList.remove('is-on'); });
});

/* ---------- cached elements for the frame loop ---------- */
const stage = $('#stage'), hero = $('.hero'), stories = $$('.story');
const readout = $('.readout'), gpus = $('[data-gpus]'), rail = $('.rail'), railItems = $$('.rail li');
const progressBar = $('.progress i');
const reveals = $$('[data-reveal]');
const latest = $('#latest'), track = $('.latest__track'), latestBar = $('.latest__bar i'), latestIdx = $('[data-latest-idx]');
const marqRows = $$('.marquee__inner').map((el) => ({ el, dir: +el.parentElement.dataset.dir, x: 0 }));
const cta = $('#gtc'), ctaGreen = $('.cta__layer--green'), ctaSlash = $('.cta__slash');
const cards = $$('.card');
const scrim = $('.scrim');
const lightSecs = $$('.light, .latest, .marquee, #gtc');
let ctaGreenOver = false;

function sizeLatest() {
  const extra = track.scrollWidth - (innerWidth - 0);
  latest.style.height = `${innerHeight + Math.max(0, extra + innerWidth * 0.08)}px`;
}
sizeLatest();
addEventListener('resize', sizeLatest);
document.fonts && document.fonts.ready.then(sizeLatest);

let lastGpu = -1;
function frame(time) {
  lenis.raf(time);
  const vh = innerHeight;

  // cursor
  cpos.x = lerp(cpos.x, mouse.x, 0.2); cpos.y = lerp(cpos.y, mouse.y, 0.2);
  cursor.style.transform = `translate(${cpos.x}px, ${cpos.y}px)`;

  // stage
  const sr = stage.getBoundingClientRect();
  const p = clamp(-sr.top / (sr.height - vh));
  scene.setProgress(p);
  scene.setActive(sr.bottom > -50);
  const hp = clamp(p / 0.07);
  hero.style.opacity = String(1 - hp);
  hero.style.transform = `translateY(${-hp * 120}px)`;
  hero.style.visibility = hp >= 1 ? 'hidden' : 'visible';
  for (const s of stories) {
    const a = +s.dataset.a, b = +s.dataset.b;
    const st = p < a ? 'before' : p > b ? 'after' : 'in';
    if (s.dataset.state !== st) s.dataset.state = st;
  }
  readout.classList.toggle('is-on', p > 0.1 && p < 0.995);
  scrim.classList.toggle('is-on', p > 0.1 && p < 0.995);
  // nav colour: dark text over light sections
  let onLight = false;
  for (const s of lightSecs) { const r = s.getBoundingClientRect(); if (r.top <= 40 && r.bottom >= 40) { onLight = s.id === 'gtc' ? ctaGreenOver : true; break; } }
  nav.classList.toggle('on-light', onLight);
  rail.classList.toggle('is-on', p > 0.1 && p < 0.995);
  railItems.forEach((li, i) => {
    const a = +li.dataset.rail, b = railItems[i + 1] ? +railItems[i + 1].dataset.rail : 2;
    li.classList.toggle('is-active', p >= a && p < b);
  });
  progressBar.style.transform = `scaleX(${p})`;
  if (scene.count !== lastGpu) { lastGpu = scene.count; gpus.textContent = scene.count.toLocaleString('en-US').padStart(4, '0'); }

  // reveals
  for (const el of reveals) if (!el.classList.contains('is-in') && el.getBoundingClientRect().top < vh * 0.9) el.classList.add('is-in');

  // preview follows pointer
  pv.x = lerp(pv.x, mouse.x, 0.14); pv.y = lerp(pv.y, mouse.y, 0.14);
  pv.s = lerp(pv.s, pv.on ? 1 : 0.6, 0.12);
  preview.style.transform = `translate(${pv.x}px, ${pv.y}px) translate(-50%, -50%) scale(${pv.s}) rotate(${(mouse.x - pv.x) * 0.03}deg)`;

  // latest horizontal
  const lr = latest.getBoundingClientRect();
  const lp = clamp(-lr.top / (lr.height - vh));
  const maxX = Math.max(0, track.scrollWidth - (innerWidth - parseFloat(getComputedStyle(latest.firstElementChild).paddingLeft) * 2));
  track.style.transform = `translateX(${-lp * maxX}px)`;
  latestBar.style.transform = `scaleX(${lp})`;
  latestIdx.textContent = String(Math.min(6, 1 + Math.floor(lp * 5.99))).padStart(2, '0');
  if (lr.top < vh && lr.bottom > 0) {
    const vel = lenis.velocity || 0;
    cards.forEach((c) => { c.style.transform = `skewX(${clamp(-vel * 0.15, -6, 6)}deg)`; });
  }

  // marquee: time + scroll velocity
  const v = lenis.velocity || 0;
  for (const m of marqRows) {
    const w = m.el.scrollWidth / 2;
    m.x -= (0.6 + Math.abs(v) * 0.25) * m.dir;
    if (w > 0) { if (m.x <= -w) m.x += w; if (m.x > 0) m.x -= w; }
    m.el.style.transform = `translateX(${m.x}px)`;
  }

  // CTA slash reveal
  const cr = cta.getBoundingClientRect();
  const cp = clamp(-cr.top / (cr.height - vh));
  const e = cp < 0.5 ? 4 * cp * cp * cp : 1 - Math.pow(-2 * cp + 2, 3) / 2;
  const half = e * 85, k = 14;
  ctaGreenOver = e > 0.82;
  ctaGreen.style.clipPath = `polygon(${50 - half + k}% 0, ${50 + half + k}% 0, ${50 + half - k}% 100%, ${50 - half - k}% 100%)`;
  ctaSlash.style.opacity = String(1 - clamp(e * 1.6));
  ctaSlash.style.transform = `rotate(${Math.atan2((2 * k / 100) * innerWidth, vh) * 57.2958}deg)`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// duplicate marquee content for a seamless loop
$$('.marquee__inner').forEach((el) => { el.innerHTML += el.innerHTML; });
