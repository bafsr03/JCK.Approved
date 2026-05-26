/* ================================================================
   JCK APPROVED — Hunt Frame Sequence Player
   Auto-play · drag-to-scrub · touch · progress bar · preload
================================================================ */
(function () {
  'use strict';

  var TOTAL   = 121;
  var FPS     = 24;
  var INTERVAL = 1000 / FPS;
  var PRELOAD_EAGER = 30;

  function padded(n) {
    return ('00000' + n).slice(-5);
  }

  function buildUrls(base) {
    var urls = [];
    for (var i = 1; i <= TOTAL; i++) {
      urls.push(base.replace('frame_00001', 'frame_' + padded(i)));
    }
    return urls;
  }

  function initPlayer(container) {
    var img      = container.querySelector('.jck-hunt-player__frame');
    var bar      = container.querySelector('.jck-hunt-player__bar');
    var hint     = container.querySelector('.jck-hunt-player__hint');
    var base     = container.dataset.frame1;
    if (!img || !base) return;

    var urls    = buildUrls(base);
    var cache   = new Array(TOTAL + 1);   /* 1-indexed */
    var current = 1;
    var playing = false;
    var lastTs  = 0;
    var rafId   = null;
    var dragging = false;

    /* ── Preload ─────────────────────────────────────────────── */
    function preload(from, to) {
      for (var i = from; i <= to; i++) {
        if (cache[i]) continue;
        var el = new Image();
        el.src = urls[i - 1];
        cache[i] = el;
      }
    }

    function showFrame(n) {
      if (n < 1) n = 1;
      if (n > TOTAL) n = TOTAL;
      current = n;
      img.src = urls[n - 1];
      if (bar) bar.style.width = ((n - 1) / (TOTAL - 1) * 100).toFixed(2) + '%';
    }

    /* ── Playback loop ───────────────────────────────────────── */
    function tick(ts) {
      if (!playing) return;
      rafId = requestAnimationFrame(tick);
      if (ts - lastTs < INTERVAL) return;
      lastTs = ts;
      var next = current >= TOTAL ? 1 : current + 1;
      showFrame(next);
    }

    function play() {
      if (playing) return;
      playing = true;
      if (hint) hint.style.opacity = '0';
      rafId = requestAnimationFrame(tick);
    }

    function pause() {
      playing = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    /* ── Click to toggle ─────────────────────────────────────── */
    container.addEventListener('click', function (e) {
      if (dragging) return;
      if (playing) pause(); else play();
    });

    /* ── Drag-to-scrub (mouse) ───────────────────────────────── */
    var scrubStartX = 0;
    var scrubStartFrame = 1;

    container.addEventListener('mousedown', function (e) {
      pause();
      dragging = false;
      scrubStartX = e.clientX;
      scrubStartFrame = current;

      function onMove(ev) {
        var dx = ev.clientX - scrubStartX;
        if (Math.abs(dx) > 3) dragging = true;
        var delta = Math.round(dx / container.offsetWidth * (TOTAL - 1));
        showFrame(scrubStartFrame + delta);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        /* short delay so click handler sees dragging=true then clears it */
        setTimeout(function () { dragging = false; }, 10);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    /* ── Drag-to-scrub (touch) ───────────────────────────────── */
    container.addEventListener('touchstart', function (e) {
      pause();
      dragging = true;
      scrubStartX = e.touches[0].clientX;
      scrubStartFrame = current;
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
      var dx = e.touches[0].clientX - scrubStartX;
      var delta = Math.round(dx / container.offsetWidth * (TOTAL - 1));
      showFrame(scrubStartFrame + delta);
    }, { passive: true });

    container.addEventListener('touchend', function () {
      setTimeout(function () { dragging = false; }, 10);
    });

    /* ── IntersectionObserver auto-play ──────────────────────── */
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        play();
        /* finish preloading remaining frames lazily */
        setTimeout(function () { preload(PRELOAD_EAGER + 1, TOTAL); }, 800);
      } else {
        pause();
      }
    }, { threshold: 0.25 });

    io.observe(container);

    /* ── Eager preload first N frames & set first frame ─────── */
    preload(1, PRELOAD_EAGER);
    img.src = urls[0];
  }

  function init() {
    document.querySelectorAll('.jck-hunt-player').forEach(function (el) {
      initPlayer(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
