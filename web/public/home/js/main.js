(function () {
  "use strict";

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = motionQuery.matches;
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function () {
      reduceMotion = motionQuery.matches;
    });
  }

  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setMenu = function (open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-open", open);
      var label = toggle.querySelector(".sr-only");
      if (label) {
        label.textContent = open ? "Close menu" : "Open menu";
      }
    };

    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setMenu(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setMenu(false);
      }
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      var id = link.getAttribute("href");
      if (!id || id === "#") {
        event.preventDefault();
        return;
      }
      var target = document.querySelector(id);
      if (!target) {
        return;
      }
      event.preventDefault();
      var top = target.getBoundingClientRect().top + window.scrollY;
      var offset = header ? header.offsetHeight + 8 : 0;
      window.scrollTo({
        top: Math.max(0, top - offset),
        behavior: reduceMotion ? "auto" : "smooth"
      });
      if (target.hasAttribute("tabindex") === false) {
        target.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    });
  });

  var revealItems = document.querySelectorAll(".reveal");
  if (reduceMotion) {
    revealItems.forEach(function (el) {
      el.classList.add("is-in");
    });
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealItems.forEach(function (el) {
      var parent = el.parentElement;
      var siblings = parent ? parent.querySelectorAll(":scope > .reveal") : [];
      var order = Array.prototype.indexOf.call(siblings, el);
      if (order > 0) {
        el.style.setProperty("--reveal-delay", order * 80 + "ms");
      }
      io.observe(el);
    });
  } else {
    revealItems.forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  var hero = document.querySelector("[data-hero]");
  if (hero) {
    var slides = Array.prototype.slice.call(hero.querySelectorAll(".hero-slides img"));
    var index = 0;
    var timer = null;
    var pointerOnControls = false;
    var focusOnControls = false;
    var intervalMs = 5000;

    var track = hero.querySelector(".hero-slides");

    var paint = function (next, reverse) {
      if (!slides.length) {
        return;
      }
      var target = (next + slides.length) % slides.length;
      if (target === index) {
        return;
      }
      var leaving = slides[index];
      slides.forEach(function (img) {
        img.classList.remove("is-leaving");
      });
      leaving.classList.remove("is-active");
      index = target;
      if (!reduceMotion && track) {
        track.classList.toggle("is-reverse", !!reverse);
        track.classList.add("is-sliding");
        leaving.classList.add("is-leaving");
      }
      slides[index].classList.add("is-active");
    };

    slides.forEach(function (img) {
      img.addEventListener("animationend", function (event) {
        if (event.target === img && img.classList.contains("is-leaving")) {
          img.classList.remove("is-leaving");
        }
      });
    });

    var canAutoplay = function () {
      return !document.hidden && !pointerOnControls && !focusOnControls;
    };

    var stopTimer = function () {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    var startTimer = function () {
      stopTimer();
      if (slides.length < 2) {
        return;
      }
      timer = window.setInterval(function () {
        if (canAutoplay()) {
          paint(index + 1);
        }
      }, intervalMs);
    };

    var show = function (next, reverse) {
      paint(next, reverse);
      if (canAutoplay()) {
        startTimer();
      } else {
        stopTimer();
      }
    };

    var prevBtn = hero.querySelector("[data-hero-prev]");
    var nextBtn = hero.querySelector("[data-hero-next]");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        show(index - 1, true);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        show(index + 1);
      });
    }

    var controls = hero.querySelector(".hero-controls");
    if (controls) {
      controls.addEventListener("pointerenter", function () {
        pointerOnControls = true;
        stopTimer();
      });
      controls.addEventListener("pointerleave", function () {
        pointerOnControls = false;
        if (canAutoplay()) {
          startTimer();
        }
      });
      controls.addEventListener("focusin", function () {
        focusOnControls = true;
        stopTimer();
      });
      controls.addEventListener("focusout", function (event) {
        var next = event.relatedTarget;
        if (next && controls.contains(next)) {
          return;
        }
        focusOnControls = false;
        if (canAutoplay()) {
          startTimer();
        }
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopTimer();
      } else if (canAutoplay()) {
        startTimer();
      }
    });

    if (canAutoplay()) {
      startTimer();
    }
  }

  function setupCarousel(root) {
    var track = root.querySelector("[data-track]");
    var viewport = root.querySelector(".carousel-viewport");
    var prev = root.querySelector("[data-prev]");
    var next = root.querySelector("[data-next]");
    if (!track || !viewport) {
      return;
    }
    var position = 0;

    var cards = function () {
      return Array.prototype.slice.call(track.children);
    };

    var step = function () {
      var first = cards()[0];
      if (!first) {
        return 0;
      }
      var style = window.getComputedStyle(track);
      var gap = parseFloat(style.columnGap || style.gap) || 0;
      var fs = window.getComputedStyle(first);
      var margins = (parseFloat(fs.marginLeft) || 0) + (parseFloat(fs.marginRight) || 0);
      return first.getBoundingClientRect().width + margins + gap;
    };

    var maxPos = function () {
      var extra = track.scrollWidth - viewport.clientWidth;
      if (extra <= 0) {
        return 0;
      }
      return Math.ceil(extra / step());
    };

    var paint = function () {
      var max = maxPos();
      if (position > max) {
        position = max;
      }
      if (position < 0) {
        position = 0;
      }
      var distance = position * step();
      if (distance > track.scrollWidth - viewport.clientWidth) {
        distance = Math.max(0, track.scrollWidth - viewport.clientWidth);
      }
      track.style.transform = "translateX(" + -distance + "px)";
      if (prev) {
        prev.setAttribute("aria-disabled", position <= 0 ? "true" : "false");
      }
      if (next) {
        next.setAttribute("aria-disabled", position >= max ? "true" : "false");
      }
    };

    if (prev) {
      prev.addEventListener("click", function () {
        if (prev.getAttribute("aria-disabled") === "true") {
          return;
        }
        position -= 1;
        paint();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        if (next.getAttribute("aria-disabled") === "true") {
          return;
        }
        position += 1;
        paint();
      });
    }

    window.addEventListener("resize", paint);
    paint();
  }

  document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
})();
