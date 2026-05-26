/* ================================================================
   JCK APPROVED — Cat Noir Widget
   Scroll-triggered pop-up · cursor-tracking eyes
================================================================ */
(function () {
  'use strict';

  var hasReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(pointer: coarse)').matches;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function initCat() {
    var wrap    = document.querySelector('.jck-cat-wrap');
    var section = document.querySelector('.jck-mani');
    if (!wrap || !section) return;

    var pupilR = document.getElementById('jck-pupil-r');
    var pupilL = document.getElementById('jck-pupil-l');
    var eyeR   = document.getElementById('jck-eye-r-bg');
    var eyeL   = document.getElementById('jck-eye-l-bg');

    /* ── Scroll-triggered pop-in / pop-out ────────────────────── */
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        section.classList.add('cat-is-visible');
        if (!isTouch && pupilR && pupilL && eyeR && eyeL && !rafId) {
          startEyeTracking();
        }
      } else {
        section.classList.remove('cat-is-visible');
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
          /* reset pupils to center */
          rTx = 0; rTy = 0; rCx = 0; rCy = 0;
          lTx = 0; lTy = 0; lCx = 0; lCy = 0;
          if (pupilR) pupilR.style.transform = '';
          if (pupilL) pupilL.style.transform = '';
        }
      }
    }, { threshold: 0.2 });

    io.observe(section);

    /* ── Eye tracking ─────────────────────────────────────────── */
    var rTx = 0, rTy = 0, rCx = 0, rCy = 0;
    var lTx = 0, lTy = 0, lCx = 0, lCy = 0;
    var mx = -9999, my = -9999;
    var rafId = null;

    function updateTargets() {
      if (!eyeR || !eyeL) return;

      var rRect = eyeR.getBoundingClientRect();
      var lRect = eyeL.getBoundingClientRect();

      /*
       * Allow the pupil to travel 50% of iris radius — about 1.75× the
       * physical maximum — so it visibly crosses toward the iris edge.
       * Values computed in live CSS px so any display size works.
       */
      var rMax = rRect.width * 0.5 * 0.50;
      var lMax = lRect.width * 0.5 * 0.50;

      var rcx = rRect.left + rRect.width  * 0.5;
      var rcy = rRect.top  + rRect.height * 0.5;
      var lcx = lRect.left + lRect.width  * 0.5;
      var lcy = lRect.top  + lRect.height * 0.5;

      var rdx = mx - rcx, rdy = my - rcy;
      var rDist = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      /* reach full displacement at ~80 px from eye centre */
      var rAmt = Math.min(rMax, rDist * (rMax / 80));
      rTx = (rdx / rDist) * rAmt;
      rTy = (rdy / rDist) * rAmt;

      var ldx = mx - lcx, ldy = my - lcy;
      var lDist = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
      var lAmt = Math.min(lMax, lDist * (lMax / 80));
      lTx = (ldx / lDist) * lAmt;
      lTy = (ldy / lDist) * lAmt;
    }

    function animateLoop() {
      rafId = requestAnimationFrame(animateLoop);

      rCx = lerp(rCx, rTx, 0.08);
      rCy = lerp(rCy, rTy, 0.08);
      lCx = lerp(lCx, lTx, 0.08);
      lCy = lerp(lCy, lTy, 0.08);

      pupilR.style.transform = 'translate(' + rCx.toFixed(2) + 'px,' + rCy.toFixed(2) + 'px)';
      pupilL.style.transform = 'translate(' + lCx.toFixed(2) + 'px,' + lCy.toFixed(2) + 'px)';
    }

    function startEyeTracking() {
      document.addEventListener('mousemove', function (e) {
        mx = e.clientX;
        my = e.clientY;
        updateTargets();
      });

      document.addEventListener('mouseleave', function () {
        rTx = 0; rTy = 0;
        lTx = 0; lTy = 0;
      });

      animateLoop();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCat);
  } else {
    initCat();
  }
})();
