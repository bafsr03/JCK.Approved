/* ================================================================
   JCK APPROVED — Animation Engine
   Custom cursor · loader · scroll progress · scroll-title ·
   reveals · magnetic · split-text · mini-canvas sway
================================================================ */
(function () {
  'use strict';

  var hasReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(pointer: coarse)').matches;

  /* ── Helpers ───────────────────────────────────────────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function qs(s)  { return document.querySelector(s); }
  function qsa(s) { return document.querySelectorAll(s); }

  /* ── 1. CUSTOM CURSOR ──────────────────────────────────────── */
  if (!isTouch && !hasReducedMotion) {
    var dot  = document.createElement('div');
    var ring = document.createElement('div');
    dot.id   = 'jck-cursor-dot';
    ring.id  = 'jck-cursor-ring';
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = 0, my = 0, rx = 0, ry = 0;

    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
    document.addEventListener('mouseleave', function () { ring.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', function () { ring.classList.remove('is-hidden'); });

    (function animateCursor() {
      requestAnimationFrame(animateCursor);
      rx = lerp(rx, mx, .14);
      ry = lerp(ry, my, .14);
      dot.style.left  = mx + 'px';
      dot.style.top   = my + 'px';
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';
    })();

    document.addEventListener('mouseover', function (e) {
      var el = e.target;
      if (el.closest('a, button, [role="button"], .jck-btn, .jck-magnetic, label, select')) {
        ring.classList.add('is-link');
      }
      if (el.closest('input, textarea')) ring.classList.add('is-hidden');
    });
    document.addEventListener('mouseout', function (e) {
      var el = e.target;
      if (el.closest('a, button, [role="button"], .jck-btn, .jck-magnetic, label, select')) {
        ring.classList.remove('is-link');
      }
      if (el.closest('input, textarea')) ring.classList.remove('is-hidden');
    });
  }

  /* ── 2. PAGE LOADER ────────────────────────────────────────── */
  var loader = qs('#jck-loader');
  if (loader) {
    /* Pick a logo variant. Bias toward the horseshoe mark (more distinctive).
       Use sessionStorage so the variant is stable within a session, but
       rotates on a fresh visit. */
    var stack = qs('#jck-loader-stack');
    if (stack) {
      var variant = sessionStorage.getItem('jck-logo-variant');
      if (!variant) {
        variant = Math.random() < 0.65 ? 'mark' : 'title';
        sessionStorage.setItem('jck-logo-variant', variant);
      }
      stack.classList.add(variant === 'title' ? 'is-title' : 'is-mark');
    }

    var alreadyLoaded = sessionStorage.getItem('jck-visited');
    if (alreadyLoaded) {
      loader.remove();
    } else {
      sessionStorage.setItem('jck-visited', '1');
      var dismissDelay = hasReducedMotion ? 0 : 1400;
      setTimeout(function () {
        loader.classList.add('out');
        setTimeout(function () { loader.remove(); }, 1050);
      }, dismissDelay);
    }
  }

  /* ── 3. SCROLL PROGRESS BAR + SCROLL-REVEAL NAVBAR TITLE ───── */
  var progressBar = qs('#jck-progress');
  var navTitle    = qs('#jck-nav-title');

  // On non-index pages, show nav title immediately (no hero to hide it behind).
  var isIndex = document.body && document.querySelector('main[data-template="index"]');
  if (navTitle && !isIndex) {
    navTitle.classList.add('is-visible');
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    requestAnimationFrame(function () {
      var scrolled  = window.scrollY;
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      if (progressBar) {
        var p = maxScroll > 0 ? scrolled / maxScroll : 0;
        progressBar.style.transform = 'scaleX(' + p + ')';
      }

      // On index, reveal nav title after scrolling ~ half a viewport (past hero).
      if (navTitle && isIndex) {
        var threshold = window.innerHeight * 0.55;
        if (scrolled > threshold) navTitle.classList.add('is-visible');
        else                       navTitle.classList.remove('is-visible');
      }

      ticking = false;
    });
    ticking = true;
  }, { passive: true });

  /* ── 4. SCROLL REVEALS ─────────────────────────────────────── */
  if (!hasReducedMotion && 'IntersectionObserver' in window) {
    var revealOpts = { threshold: 0.1, rootMargin: '0px 0px -48px 0px' };
    var revealObs  = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('on');
          revealObs.unobserve(entry.target);
        }
      });
    }, revealOpts);

    qsa('.jck-reveal, .jck-reveal-x, .jck-reveal-scale, .jck-clip').forEach(function (el) {
      revealObs.observe(el);
    });
  } else {
    qsa('.jck-reveal, .jck-reveal-x, .jck-reveal-scale, .jck-clip').forEach(function (el) {
      el.classList.add('on');
    });
  }

  /* ── 5. SPLIT TEXT WORD REVEAL ─────────────────────────────── */
  function initSplitText(selector) {
    qsa(selector).forEach(function (el) {
      if (el.dataset.splitDone) return;
      el.dataset.splitDone = '1';

      var tmp = document.createElement('div');
      tmp.innerHTML = el.innerHTML;

      function wrapTextNode(node) {
        if (node.nodeType === 3) {
          var text = node.textContent;
          var words = text.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          words.forEach(function (part) {
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
            } else if (part.length > 0) {
              var wrap = document.createElement('span');
              wrap.className = 'jck-word-wrap';
              var inner = document.createElement('span');
              inner.className = 'jck-word';
              inner.textContent = part;
              wrap.appendChild(inner);
              frag.appendChild(wrap);
            }
          });
          node.parentNode.replaceChild(frag, node);
        } else if (node.nodeType === 1 && node.childNodes) {
          Array.from(node.childNodes).forEach(wrapTextNode);
        }
      }
      Array.from(tmp.childNodes).forEach(wrapTextNode);
      el.innerHTML = '';
      el.appendChild(tmp);

      var words = el.querySelectorAll('.jck-word');
      words.forEach(function (w, i) { w.style.setProperty('--wi', i); });

      if (!hasReducedMotion && 'IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.querySelectorAll('.jck-word').forEach(function (w) {
                w.classList.add('on');
              });
              obs.unobserve(e.target);
            }
          });
        }, { threshold: 0.2 });
        obs.observe(el);
      } else {
        words.forEach(function (w) { w.classList.add('on'); });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initSplitText('.jck-split'); });
  } else {
    initSplitText('.jck-split');
  }

  /* ── 6. MAGNETIC BUTTONS ───────────────────────────────────── */
  if (!isTouch && !hasReducedMotion) {
    function bindMagnetics() {
      qsa('.jck-magnetic').forEach(function (el) {
        if (el.dataset.magBound) return;
        el.dataset.magBound = '1';

        el.addEventListener('mousemove', function (e) {
          var r  = el.getBoundingClientRect();
          var cx = r.left + r.width  / 2;
          var cy = r.top  + r.height / 2;
          var dx = (e.clientX - cx) * .25;
          var dy = (e.clientY - cy) * .25;
          el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
        el.addEventListener('mouseleave', function () {
          el.style.transform = '';
        });
      });
    }
    bindMagnetics();
    var mutObs = new MutationObserver(bindMagnetics);
    mutObs.observe(document.body, { childList: true, subtree: true });
  }

  /* ── 7. PARALLAX ON SCROLL ─────────────────────────────────── */
  if (!isTouch && !hasReducedMotion) {
    qsa('[data-parallax]').forEach(function (el) {
      var speed = parseFloat(el.dataset.parallax) || .25;
      window.addEventListener('scroll', function () {
        var rect = el.getBoundingClientRect();
        var cy   = window.innerHeight / 2;
        var dy   = (cy - (rect.top + rect.height / 2)) * speed;
        el.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });
    });
  }

  /* ── 8. HORIZONTAL DRAG-SCROLL ─────────────────────────────── */
  qsa('.jck-hscroll').forEach(function (track) {
    var isDown = false, startX, scrollLeft;
    track.addEventListener('mousedown', function (e) {
      isDown = true;
      startX = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
      track.style.cursor = 'grabbing';
    });
    track.addEventListener('mouseleave', function () { isDown = false; track.style.cursor = ''; });
    track.addEventListener('mouseup',    function () { isDown = false; track.style.cursor = ''; });
    track.addEventListener('mousemove',  function (e) {
      if (!isDown) return;
      e.preventDefault();
      var x = e.pageX - track.offsetLeft;
      var walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeft - walk;
    });
  });

  /* ── 9. NUMBER COUNTER ────────────────────────────────────── */
  function animateCounter(el) {
    var target = parseInt(el.dataset.count, 10);
    if (isNaN(target)) return;
    var duration = 1800;
    var start    = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(ease * target).toString().padStart(2, '0');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if (!hasReducedMotion && 'IntersectionObserver' in window) {
    var cntObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          animateCounter(e.target);
          cntObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    qsa('[data-count]').forEach(function (el) { cntObs.observe(el); });
  }

  /* ── 10. MINI CANVAS — sway characters (reused on pages) ──── */
  function initMiniCanvas(host) {
    if (host.dataset.miniInit) return;
    host.dataset.miniInit = '1';

    var src = host.dataset.img;
    if (!src) return;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    host.appendChild(canvas);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function sizeIt() {
      var w = host.clientWidth;
      var h = host.clientHeight;
      canvas.width  = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeIt();
    window.addEventListener('resize', sizeIt, { passive: true });

    var img = new Image();
    var loaded = false;
    img.crossOrigin = 'anonymous';
    img.onload = function () { loaded = true; };
    img.src = src;

    function frame(ts) {
      requestAnimationFrame(frame);
      if (!loaded) return;
      var W = host.clientWidth;
      var H = host.clientHeight;
      ctx.clearRect(0, 0, W, H);

      var scale = W / img.naturalWidth;
      var drawH = Math.ceil(img.naturalHeight * scale);
      var drawY0 = H - drawH;
      var loopT = (ts / 4200) * Math.PI * 2;
      var maxShift = W * 0.05;
      var charTop = drawY0 + drawH * 0.55;
      var charH   = drawH * 0.45;

      var yStart = Math.max(0, drawY0);
      for (var y = yStart; y < H; y++) {
        var srcY = Math.floor((y - drawY0) / scale);
        if (srcY < 0 || srcY >= img.naturalHeight) continue;
        var dx = 0;
        if (y >= charTop && charH > 0) {
          var p = Math.min((y - charTop) / charH, 1);
          var phase = (1 - p) * Math.PI * 0.8;
          var wave = Math.sin(loopT - phase);
          var amp = Math.pow(1 - p, 1.05);
          dx = wave * maxShift * amp;
        }
        ctx.drawImage(img, 0, srcY, img.naturalWidth, 1, dx, y, W, 1);
      }
    }
    requestAnimationFrame(frame);
  }

  function initAllMini() {
    qsa('.jck-mini-canvas').forEach(initMiniCanvas);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllMini);
  } else {
    initAllMini();
  }
  // Re-init on dynamic insertion
  var miniObs = new MutationObserver(initAllMini);
  miniObs.observe(document.body, { childList: true, subtree: true });

})();
