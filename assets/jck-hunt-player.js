/* ================================================================
   JCK APPROVED — Hunt Frame Sequence Player
   Click-to-play once · cursor/touch eye tracking · preload
================================================================ */
(function () {
  'use strict';

  var TOTAL     = 121;
  var FPS       = 24;
  var INTERVAL  = 1000 / FPS;
  var EAGER     = 30;

  /* Eye positions as % of frame (1248×704) — calibrated from path analysis of frame 1
     Left pupil cluster:  x≈565, y≈160  →  45.3%, 22.7%
     Right pupil cluster: x≈710, y≈160  →  56.9%, 22.7% */
  var EYES = [
    { cx: 45.3, cy: 23.5 },
    { cx: 57.0, cy: 23.0 }
  ];
  var IRIS_COLOR  = '#E4C94E';   /* golden yellow matching the SVG iris */
  var IRIS_R_PCT  = 4.5;         /* iris radius as % of container width */
  var PUPIL_R_PCT = 1.9;         /* pupil radius as % of container width */
  var LERP_T      = 0.08;

  function padded(n) { return ('00000' + n).slice(-5); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function buildUrls(base) {
    var arr = [];
    for (var i = 1; i <= TOTAL; i++) {
      arr.push(base.replace('frame_00001', 'frame_' + padded(i)));
    }
    return arr;
  }

  function initPlayer(container) {
    var img  = container.querySelector('.jck-hunt-player__frame');
    var hint = container.querySelector('.jck-hunt-player__hint');
    var base = container.dataset.frame1;
    if (!img || !base) return;

    var urls    = buildUrls(base);
    var cache   = new Array(TOTAL + 1);
    var current = 1;
    var playing = false;
    var rafId   = null;
    var lastTs  = 0;

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
      current = Math.max(1, Math.min(TOTAL, n));
      img.src = urls[current - 1];
    }

    /* ── Eye overlay ─────────────────────────────────────────── */
    var eyeEls  = [];    /* [{iris, pupil}] */
    var eyeData = EYES.map(function () {
      return { tx: 0, ty: 0, cx: 0, cy: 0 };
    });
    var mx = -9999, my = -9999;
    var eyeRaf = null;

    function buildEyeOverlay() {
      EYES.forEach(function (e) {
        var iris = document.createElement('div');
        iris.style.cssText =
          'position:absolute;border-radius:50%;pointer-events:none;' +
          'overflow:hidden;background:' + IRIS_COLOR + ';' +
          'left:' + e.cx + '%;top:' + e.cy + '%;' +
          'transform:translate(-50%,-50%);z-index:5;' +
          'transition:opacity .3s ease;';

        var pupil = document.createElement('div');
        pupil.style.cssText =
          'position:absolute;border-radius:50%;background:#060606;' +
          'top:50%;left:50%;';

        iris.appendChild(pupil);
        container.appendChild(iris);
        eyeEls.push({ iris: iris, pupil: pupil });
      });
      sizeEyes();
    }

    function sizeEyes() {
      var w = container.offsetWidth;
      var irisR  = w * IRIS_R_PCT  / 100;
      var pupilR = w * PUPIL_R_PCT / 100;
      eyeEls.forEach(function (el) {
        el.iris.style.width  = (irisR  * 2) + 'px';
        el.iris.style.height = (irisR  * 2) + 'px';
        el.pupil.style.width  = (pupilR * 2) + 'px';
        el.pupil.style.height = (pupilR * 2) + 'px';
        el.pupil.style.marginTop  = '-' + pupilR + 'px';
        el.pupil.style.marginLeft = '-' + pupilR + 'px';
      });
    }

    function updateEyeTargets() {
      var rect = container.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      var irisR    = w * IRIS_R_PCT / 100;
      var maxTravel = irisR * 0.48;

      EYES.forEach(function (e, i) {
        var eyeX = rect.left + w * e.cx / 100;
        var eyeY = rect.top  + h * e.cy / 100;
        var dx   = mx - eyeX;
        var dy   = my - eyeY;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var amt  = Math.min(maxTravel, dist * (maxTravel / 80));
        eyeData[i].tx = (dx / dist) * amt;
        eyeData[i].ty = (dy / dist) * amt;
      });
    }

    function eyeLoop() {
      eyeRaf = requestAnimationFrame(eyeLoop);
      EYES.forEach(function (_, i) {
        eyeData[i].cx = lerp(eyeData[i].cx, eyeData[i].tx, LERP_T);
        eyeData[i].cy = lerp(eyeData[i].cy, eyeData[i].ty, LERP_T);
        if (eyeEls[i]) {
          eyeEls[i].pupil.style.transform =
            'translate(' + eyeData[i].cx.toFixed(2) + 'px,' +
                           eyeData[i].cy.toFixed(2) + 'px)';
        }
      });
    }

    function showEyes() {
      eyeEls.forEach(function (el) { el.iris.style.opacity = '1'; });
      if (!eyeRaf) eyeLoop();
    }

    function hideEyes() {
      eyeEls.forEach(function (el) { el.iris.style.opacity = '0'; });
      if (eyeRaf) { cancelAnimationFrame(eyeRaf); eyeRaf = null; }
      /* reset pupils to center */
      EYES.forEach(function (_, i) {
        eyeData[i].tx = eyeData[i].ty = 0;
      });
    }

    /* ── Playback: play once, then reset ─────────────────────── */
    function tick(ts) {
      if (!playing) return;
      rafId = requestAnimationFrame(tick);
      if (ts - lastTs < INTERVAL) return;
      lastTs = ts;

      if (current >= TOTAL) {
        /* end of sequence */
        playing = false;
        cancelAnimationFrame(rafId);
        rafId = null;
        showFrame(1);
        showEyes();
        if (hint) {
          hint.textContent = 'click to play';
          hint.style.opacity = '1';
        }
        return;
      }
      showFrame(current + 1);
    }

    function play() {
      if (playing) return;
      hideEyes();
      if (hint) hint.style.opacity = '0';
      playing = true;
      lastTs  = performance.now();
      rafId   = requestAnimationFrame(tick);
    }

    /* ── Events ──────────────────────────────────────────────── */
    container.addEventListener('click', function () {
      if (!playing) play();
    });

    /* Mouse cursor tracking */
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX;
      my = e.clientY;
      if (!playing) updateEyeTargets();
    });

    document.addEventListener('mouseleave', function () {
      EYES.forEach(function (_, i) {
        eyeData[i].tx = eyeData[i].ty = 0;
      });
    });

    /* Touch — move eyes toward touch point while idle */
    container.addEventListener('touchstart', function (e) {
      if (playing) return;
      mx = e.touches[0].clientX;
      my = e.touches[0].clientY;
      updateEyeTargets();
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
      if (playing) return;
      mx = e.touches[0].clientX;
      my = e.touches[0].clientY;
      updateEyeTargets();
    }, { passive: true });

    container.addEventListener('touchend', function () {
      /* on touch end, reset if idle */
      if (!playing) {
        EYES.forEach(function (_, i) {
          eyeData[i].tx = eyeData[i].ty = 0;
        });
      }
    });

    window.addEventListener('resize', sizeEyes);

    /* ── Init ────────────────────────────────────────────────── */
    showFrame(1);
    buildEyeOverlay();
    showEyes();
    preload(1, EAGER);
    setTimeout(function () { preload(EAGER + 1, TOTAL); }, 800);
  }

  function init() {
    document.querySelectorAll('.jck-hunt-player').forEach(initPlayer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
