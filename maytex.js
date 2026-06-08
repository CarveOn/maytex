/* ============================================================
   MAYTEX — scroll + motion
   GSAP + ScrollTrigger + Lenis. Signature scrub hero.
   ============================================================ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Scrub everywhere except reduced-motion and iOS (where frame seeking is unreliable
  // -> graceful muted autoplay loop). Desktop Safari scrubs the mp4 fine.
  const SCRUB_OK = !REDUCED && !isIOS;

  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis smooth scroll ---------- */
  let lenis = null;
  if (!REDUCED && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.05, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  function scrollToEl(target) {
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.1 });
    else document.querySelector(target)?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }

  /* ---------- HERO ---------- */
  const hero = document.querySelector('.hero');
  const video = document.querySelector('.hero__media video');
  const content = document.querySelector('.hero__content');
  const cue = document.querySelector('.hero__cue');

  function setupFallbackVideo() {
    if (!video) return;
    video.muted = true; video.loop = true; video.setAttribute('playsinline', '');
    video.autoplay = true;
    const p = video.play();
    if (p && p.catch) p.catch(() => {/* will play on first interaction */});
  }

  function setupHero() {
    if (!video || !hero) return;
    video.muted = true; video.setAttribute('playsinline', '');

    // Entrance for headline lines (runs regardless of scrub mode)
    const heroLines = hero.querySelector('.lines');
    if (!REDUCED && heroLines) {
      requestAnimationFrame(() => setTimeout(() => heroLines.classList.add('is-in'), 120));
    } else if (heroLines) {
      heroLines.classList.add('is-in');
    }

    if (!SCRUB_OK || !hasGSAP) {
      // Fallback: autoplay loop, static text in normal 100vh hero.
      setupFallbackVideo();
      return;
    }

    // Scrub mode: pause + drive currentTime via scroll.
    video.pause();
    video.preload = 'auto';

    const build = () => {
      const dur = video.duration && isFinite(video.duration) ? video.duration : 6;
      const endTime = Math.max(0, dur - 0.05);
      const SCRUB_PORTION = 0.92; // footage advances across first 92% of the pin

      // --- idle-seek controller: only issue the next seek once the prior one lands.
      // GSAP writing currentTime every frame piles up seeks faster than the decoder
      // can satisfy (sparse keyframes) -> stick-then-jump. This paces seeks to the
      // decoder so the scrub tracks smoothly.
      let targetTime = 0, seeking = false, seekStart = 0;
      const onSeeked = () => { seeking = false; };
      video.addEventListener('seeked', onSeeked);
      const SEEK_EPS = 0.034; // ~1 frame
      function pump() {
        if (!seeking) {
          if (Math.abs(targetTime - video.currentTime) > SEEK_EPS) {
            seeking = true; seekStart = performance.now();
            try { video.currentTime = targetTime; } catch (e) { seeking = false; }
          }
        } else if (performance.now() - seekStart > 320) {
          seeking = false; // watchdog: a seeked event was missed
        }
        requestAnimationFrame(pump);
      }
      requestAnimationFrame(pump);

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=340%',
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            targetTime = Math.min(self.progress / SCRUB_PORTION, 1) * endTime;
          }
        }
      });
      // text rides up over the footage, holds, then releases
      tl.to(content, { yPercent: -42, ease: 'none', duration: 1 }, 0);
      tl.to(content, { autoAlpha: 0, ease: 'power1.in', duration: 0.28 }, 0.72);
      tl.to('.hero__scrim', { opacity: 1, ease: 'none', duration: 1 }, 0);
      if (cue) tl.to(cue, { autoAlpha: 0, duration: 0.1 }, 0.04);

      ScrollTrigger.refresh();
    };

    if (video.readyState >= 1 && video.duration) build();
    else {
      video.addEventListener('loadedmetadata', build, { once: true });
      // safety: if metadata never arrives, fall back so hero is never dead
      setTimeout(() => { if (!video.duration) setupFallbackVideo(); }, 4000);
    }

    // If the video errors, never leave hero blank.
    video.addEventListener('error', setupFallbackVideo, { once: true });
  }

  /* ---------- NAV ---------- */
  const nav = document.querySelector('.nav');
  function onScrollNav(y) {
    if (!nav) return;
    nav.classList.toggle('is-solid', y > 60);
  }
  if (lenis) lenis.on('scroll', ({ scroll }) => onScrollNav(scroll));
  else window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });
  onScrollNav(window.scrollY);

  // mobile menu
  const toggle = document.querySelector('.nav__toggle');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  // anchor links (nav + indicator + mobile)
  document.querySelectorAll('[data-scroll]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        if (nav) { nav.classList.remove('menu-open'); document.body.style.overflow = ''; toggle?.setAttribute('aria-expanded', 'false'); }
        scrollToEl(href);
      }
    });
  });

  /* ---------- REVEALS ---------- */
  function reveal() {
    const items = document.querySelectorAll('[data-rise],[data-fade],[data-mask],.lines:not(.hero .lines)');
    if (REDUCED || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-in'));
      return;
    }
    // grouped stagger via data-stagger parent
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const grp = el.closest('[data-stagger]');
        if (grp && !grp.dataset.done) {
          grp.dataset.done = '1';
          const kids = grp.querySelectorAll('[data-rise],[data-fade],[data-mask],.lines');
          kids.forEach((k, i) => setTimeout(() => k.classList.add('is-in'), i * 90));
          io.unobserve(el);
        } else {
          el.classList.add('is-in');
          io.unobserve(el);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    items.forEach(el => io.observe(el));
  }

  /* ---------- COUNTERS ---------- */
  function counters() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      if (REDUCED || !('IntersectionObserver' in window)) { el.textContent = target + suffix; return; }
      let done = false;
      const io = new IntersectionObserver(es => {
        es.forEach(e => {
          if (e.isIntersecting && !done) {
            done = true;
            const dur = 1500, t0 = performance.now();
            const tick = now => {
              const p = Math.min(1, (now - t0) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              el.textContent = Math.round(target * eased) + suffix;
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.disconnect();
          }
        });
      }, { threshold: 0.5 });
      io.observe(el);
    });
  }

  /* ---------- PARALLAX (light) ---------- */
  function parallax() {
    if (REDUCED || !hasGSAP) return;
    gsap.utils.toArray('[data-parallax]').forEach(el => {
      const amt = parseFloat(el.dataset.parallax) || 12;
      gsap.to(el, {
        yPercent: -amt, ease: 'none',
        scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
  }

  /* ---------- SECTION INDICATOR ---------- */
  function indicator() {
    const btns = Array.from(document.querySelectorAll('.indicator button'));
    if (!btns.length || !hasGSAP) return;
    btns.forEach(btn => {
      const id = btn.dataset.target;
      const sec = document.querySelector(id);
      if (!sec) return;
      btn.addEventListener('click', () => scrollToEl(id));
      ScrollTrigger.create({
        trigger: sec, start: 'top 55%', end: 'bottom 55%',
        onToggle: self => { if (self.isActive) { btns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); } }
      });
    });
  }

  /* ---------- TAGLINE MARQUEE ---------- */
  function marquee() {
    const track = document.querySelector('.tagstrip__track');
    if (!track) return;
    track.innerHTML += track.innerHTML; // duplicate for seamless loop
    if (REDUCED || !hasGSAP) return;
    const half = track.scrollWidth / 2;
    gsap.to(track, { x: -half, duration: 22, ease: 'none', repeat: -1 });
  }

  /* ---------- INIT ---------- */
  function init() {
    setupHero();
    reveal();
    counters();
    parallax();
    indicator();
    marquee();
    if (hasGSAP) ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.addEventListener('load', () => { if (hasGSAP) ScrollTrigger.refresh(); });
})();
