/**
 * Edukasi — app.js
 * Handles: fetching data.json, rendering all data-driven screens
 * (splash, menu, letter/number/fruit quiz games, creative studio),
 * view switching, sound, and service worker registration.
 */

(function () {
  "use strict";

  // ---- Audio helper ----
  var SOUND_FILES = {
    click: "./audio/click.mp3",
    correct: "./audio/correct.mp3",
    wrong: "./audio/wrong.mp3",
    finish: "./audio/finish.mp3",
    bgm: "./audio/bgm.mp3"
  };

  var isMuted = false;
  try {
    isMuted = window.localStorage.getItem("edukasi:muted") === "1";
  } catch (err) {
    isMuted = false;
  }

  // Setup BGM
  var bgmAudio = new Audio(SOUND_FILES.bgm);
  bgmAudio.loop = true;
  bgmAudio.volume = 0.4;

  function playSound(name) {
    if (isMuted) {
      if (name === "bgm") bgmAudio.pause();
      return;
    }
    try {
      if (name === "bgm") {
        bgmAudio.play().catch(function () {});
        return;
      }
      var src = SOUND_FILES[name];
      if (!src) return;
      // A fresh Audio instance per call lets rapid taps overlap cleanly.
      var audio = new Audio(src);
      audio.volume = 0.8;
      audio.play().catch(function () {
        // Autoplay can be blocked until the user interacts once; safe to ignore.
      });
    } catch (err) {
      console.warn("Edukasi: gagal memutar suara", name, err);
    }
  }

  window.EduAudio = { play: playSound, files: SOUND_FILES };

  // ---- View switching ----
  function showView(viewId) {
    var views = document.querySelectorAll(".view");
    views.forEach(function (view) {
      view.classList.toggle("is-active", view.id === viewId);
    });
    views.forEach(function (view) {
      if (view.id === viewId) {
        view.removeAttribute("aria-hidden");
      } else {
        view.setAttribute("aria-hidden", "true");
      }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- App data + state ----
  var DATA = null;
  var game = null; // { kind, config, questions, index, score, total }

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var el = byId(id);
    if (el) el.textContent = text == null ? "" : text;
  }

  // ---- Sound toggle button (uses ui.soundOnLabel / ui.soundOffLabel) ----
  function updateSoundButton() {
    var btn = byId("btn-sound");
    if (!btn) return;
    var onLabel = (DATA && DATA.ui && DATA.ui.soundOnLabel) || "🔊";
    var offLabel = (DATA && DATA.ui && DATA.ui.soundOffLabel) || "🔇";
    btn.textContent = isMuted ? offLabel : onLabel;
    btn.setAttribute("aria-pressed", isMuted ? "true" : "false");
  }

  function toggleSound() {
    isMuted = !isMuted;
    try {
      window.localStorage.setItem("edukasi:muted", isMuted ? "1" : "0");
    } catch (err) {
      /* storage unavailable; ignore, mute state just won't persist */
    }
    updateSoundButton();
    if (!isMuted) {
      playSound("click");
      playSound("bgm");
    } else {
      bgmAudio.pause();
    }
  }

  // ---- Splash (home-view) ----
  function renderSplash(data) {
    document.title = data.appTitle || document.title;

    var headline = document.querySelector("#home-view .headline");
    if (headline && data.splash && data.splash.title) {
      headline.textContent = data.splash.title;
    }
    var subhead = document.querySelector("#home-view .subhead");
    if (subhead && data.splash && data.splash.subtitle) {
      subhead.textContent = data.splash.subtitle;
    }
    var startBtn = byId("btn-start");
    if (startBtn && data.splash && data.splash.buttonText) {
      startBtn.textContent = data.splash.buttonText;
    }
  }

  // ---- Menu view ----
  function renderMenu(data) {
    var menu = data.menu || {};
    setText("menu-greeting", menu.greeting);
    setText("menu-subtitle", menu.subtitle);
    setText("menu-footer", menu.footerNote);
    setText("menu-back-label", (data.ui && data.ui.backLabel) || "Kembali");

    var grid = byId("menu-grid");
    if (!grid) return;
    grid.innerHTML = "";

    (menu.cards || []).forEach(function (card) {
      var cardBtn = document.createElement("button");
      cardBtn.type = "button";
      cardBtn.className = "menu-card";
      cardBtn.setAttribute("data-theme", card.theme || "");

      var icon = document.createElement("span");
      icon.className = "menu-card-icon";
      icon.textContent = card.icon || "✨";

      var title = document.createElement("span");
      title.className = "menu-card-title";
      title.textContent = card.title || "";

      var subtitle = document.createElement("span");
      subtitle.className = "menu-card-subtitle";
      subtitle.textContent = card.subtitle || "";

      var cta = document.createElement("span");
      cta.className = "menu-card-cta";
      cta.textContent = card.cta || "Ayo Main!";

      cardBtn.appendChild(icon);
      cardBtn.appendChild(title);
      cardBtn.appendChild(subtitle);
      cardBtn.appendChild(cta);

      cardBtn.addEventListener("click", function () {
        playSound("click");
        openCard(card.id);
      });

      grid.appendChild(cardBtn);
    });
  }

  function openCard(id) {
    if (id === "huruf") {
      startQuiz("letter", DATA.letterGame);
    } else if (id === "angka") {
      startQuiz("number", DATA.numberGame);
    } else if (id === "buah") {
      startQuiz("fruit", DATA.fruitGame);
    } else if (id === "kreatif") {
      openCreative(DATA.creativeStudio);
    }
  }

  // ---- Quiz engine (shared by letterGame / numberGame / fruitGame) ----
  function startQuiz(kind, config) {
    if (!config || !config.questions || !config.questions.length) {
      console.warn("Edukasi: data game '" + kind + "' kosong atau tidak ditemukan.");
      return;
    }
    game = {
      kind: kind,
      config: config,
      index: 0,
      score: 0,
      total: config.questions.length
    };

    setText("game-title", config.title || "");
    setText("game-back-label", (DATA.ui && DATA.ui.backLabel) || "Kembali");
    byId("game-finish").hidden = true;
    byId("game-question-area").hidden = false;
    byId("game-options").hidden = false;
    var instructionEl = byId("game-instruction");
    if (instructionEl) {
      instructionEl.style.display = config.instruction ? "" : "none";
      instructionEl.textContent = config.instruction || "";
    }

    showView("game-view");
    renderQuestion();
  }

  function updateScoreBadge() {
    var label = (DATA.ui && DATA.ui.scoreLabel) || "Skor";
    setText("game-score", label + ": " + game.score + "/" + game.total);
  }

  function renderQuestion() {
    updateScoreBadge();
    var q = game.config.questions[game.index];
    var area = byId("game-question-area");
    var optionsWrap = byId("game-options");
    area.innerHTML = "";
    optionsWrap.innerHTML = "";

    var options = [];

    if (game.kind === "letter") {
      var letterBadge = document.createElement("div");
      letterBadge.className = "letter-badge";
      letterBadge.textContent = q.letter;
      area.appendChild(letterBadge);
      options = q.options.map(function (opt) {
        return { display: opt.emoji + " " + opt.label, isCorrect: !!opt.correct };
      });
    } else if (game.kind === "fruit") {
      var instr = document.createElement("p");
      instr.className = "question-instruction";
      instr.textContent = q.instruction || "";
      area.appendChild(instr);
      options = q.options.map(function (opt) {
        return { display: opt.emoji + " " + opt.name, isCorrect: !!opt.correct };
      });
    } else if (game.kind === "number") {
      var countRow = document.createElement("div");
      countRow.className = "count-row";
      for (var i = 0; i < q.count; i++) {
        var span = document.createElement("span");
        span.className = "count-emoji";
        span.textContent = q.emoji;
        countRow.appendChild(span);
      }
      area.appendChild(countRow);
      options = q.options.map(function (opt) {
        return { display: String(opt), isCorrect: opt === q.count };
      });
    }

    options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.textContent = opt.display;
      btn.addEventListener("click", function () {
        handleAnswer(btn, opt.isCorrect, optionsWrap);
      });
      optionsWrap.appendChild(btn);
    });
  }

  function handleAnswer(button, isCorrect, optionsWrap) {
    // Lock all options while feedback is shown
    var buttons = optionsWrap.querySelectorAll(".option-btn");
    buttons.forEach(function (b) {
      b.disabled = true;
    });

    if (isCorrect) {
      button.classList.add("is-correct");
      game.score += 1;
      playSound("correct");
    } else {
      button.classList.add("is-wrong");
      playSound("wrong");
    }
    updateScoreBadge();

    window.setTimeout(function () {
      game.index += 1;
      if (game.index >= game.total) {
        finishQuiz();
      } else {
        renderQuestion();
      }
    }, 900);
  }

  function finishQuiz() {
    playSound("finish");
    byId("game-question-area").hidden = true;
    byId("game-options").hidden = true;
    var instructionEl = byId("game-instruction");
    if (instructionEl) instructionEl.style.display = "none";

    setText("game-finish-message", game.config.finishMessage || "");
    var label = (DATA.ui && DATA.ui.scoreLabel) || "Skor";
    setText("game-finish-score", label + ": " + game.score + "/" + game.total);
    setText("game-again-label", (DATA.ui && DATA.ui.playAgainLabel) || "Main Lagi");
    setText("game-finish-back-label", (DATA.ui && DATA.ui.backLabel) || "Kembali");

    byId("game-finish").hidden = false;
  }

  // ---- Creative studio (drawing) ----
  var canvasCtx = null;
  var currentColor = "#4A4A68";
  var currentBrush = 10;
  var isDrawing = false;
  var lastPoint = null;

  function openCreative(config) {
    if (!config) return;
    setText("creative-title", config.title || "");
    setText("creative-instruction", config.instruction || "");
    setText("creative-back-label", (DATA.ui && DATA.ui.backLabel) || "Kembali");
    setText("btn-creative-clear", config.clearLabel || "Hapus");
    setText("btn-creative-save", config.saveLabel || "Simpan");

    var colorsWrap = byId("creative-colors");
    colorsWrap.innerHTML = "";
    (config.colors || []).forEach(function (color, i) {
      var swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.background = color;
      if (i === 0) {
        swatch.classList.add("is-active");
        currentColor = color;
      }
      swatch.addEventListener("click", function () {
        currentColor = color;
        colorsWrap.querySelectorAll(".swatch").forEach(function (s) {
          s.classList.remove("is-active");
        });
        swatch.classList.add("is-active");
        playSound("click");
      });
      colorsWrap.appendChild(swatch);
    });

    var brushWrap = byId("creative-brushes");
    brushWrap.innerHTML = "";
    (config.brushSizes || []).forEach(function (size, i) {
      var brushBtn = document.createElement("button");
      brushBtn.type = "button";
      brushBtn.className = "brush-btn";
      var dot = document.createElement("span");
      dot.style.width = Math.min(size, 24) + "px";
      dot.style.height = Math.min(size, 24) + "px";
      brushBtn.appendChild(dot);
      if (i === 1 || (config.brushSizes.length === 1 && i === 0)) {
        brushBtn.classList.add("is-active");
        currentBrush = size;
      }
      brushBtn.addEventListener("click", function () {
        currentBrush = size;
        brushWrap.querySelectorAll(".brush-btn").forEach(function (b) {
          b.classList.remove("is-active");
        });
        brushBtn.classList.add("is-active");
        playSound("click");
      });
      brushWrap.appendChild(brushBtn);
    });

    showView("creative-view");
    // Canvas must be sized after it becomes visible (offsetWidth is 0 while hidden)
    window.requestAnimationFrame(setupCanvas);
  }

  function setupCanvas() {
    var canvas = byId("creative-canvas");
    if (!canvas) return;
    var ratio = window.devicePixelRatio || 1;
    var displayWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
    var displayHeight = Math.round(displayWidth * 0.75);

    canvas.width = displayWidth * ratio;
    canvas.height = displayHeight * ratio;
    canvas.style.height = displayHeight + "px";

    canvasCtx = canvas.getContext("2d");
    canvasCtx.scale(ratio, ratio);
    canvasCtx.lineCap = "round";
    canvasCtx.lineJoin = "round";
    canvasCtx.fillStyle = "#ffffff";
    canvasCtx.fillRect(0, 0, displayWidth, displayHeight);

    if (canvas.dataset.bound === "1") return;
    canvas.dataset.bound = "1";

    function getPoint(evt) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (evt.clientX || (evt.touches && evt.touches[0].clientX)) - rect.left,
        y: (evt.clientY || (evt.touches && evt.touches[0].clientY)) - rect.top
      };
    }

    function start(evt) {
      isDrawing = true;
      lastPoint = getPoint(evt);
    }

    function move(evt) {
      if (!isDrawing || !canvasCtx) return;
      evt.preventDefault();
      var point = getPoint(evt);
      canvasCtx.strokeStyle = currentColor;
      canvasCtx.lineWidth = currentBrush;
      canvasCtx.beginPath();
      canvasCtx.moveTo(lastPoint.x, lastPoint.y);
      canvasCtx.lineTo(point.x, point.y);
      canvasCtx.stroke();
      lastPoint = point;
    }

    function end() {
      isDrawing = false;
      lastPoint = null;
    }

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    canvas.addEventListener("touchstart", start, { passive: true });
    canvas.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
  }

  function clearCanvas() {
    var canvas = byId("creative-canvas");
    if (!canvas || !canvasCtx) return;
    var ratio = window.devicePixelRatio || 1;
    canvasCtx.fillStyle = "#ffffff";
    canvasCtx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    playSound("click");
  }

  function saveCanvas() {
    var canvas = byId("creative-canvas");
    if (!canvas) return;
    playSound("click");
    try {
      var dataUrl = canvas.toDataURL("image/png");
      var link = document.createElement("a");
      link.href = dataUrl;
      link.download = "gambar-edukasi.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.warn("Edukasi: gagal menyimpan gambar", err);
    }
  }

  // ---- Load data.json and boot the app ----
  function loadData() {
    return fetch("./data/data.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }

  function init() {
    var startBtn = byId("btn-start");
    var devBtn = byId("btn-developer");
    var backBtn = byId("btn-back");
    var menuBackBtn = byId("btn-menu-back");
    var gameBackBtn = byId("btn-game-back");
    var gameAgainBtn = byId("btn-game-again");
    var gameFinishBackBtn = byId("btn-game-finish-back");
    var creativeBackBtn = byId("btn-creative-back");
    var creativeClearBtn = byId("btn-creative-clear");
    var creativeSaveBtn = byId("btn-creative-save");
    var soundBtn = byId("btn-sound");

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        playSound("bgm");
        playSound("click");
        showView("menu-view");
      });
    }

    if (devBtn) {
      devBtn.addEventListener("click", function () {
        playSound("click");
        showView("developer-view");
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        playSound("click");
        showView("home-view");
      });
    }

    if (menuBackBtn) {
      menuBackBtn.addEventListener("click", function () {
        playSound("click");
        showView("home-view");
      });
    }

    if (gameBackBtn) {
      gameBackBtn.addEventListener("click", function () {
        playSound("click");
        showView("menu-view");
      });
    }

    if (gameFinishBackBtn) {
      gameFinishBackBtn.addEventListener("click", function () {
        playSound("click");
        showView("menu-view");
      });
    }

    if (gameAgainBtn) {
      gameAgainBtn.addEventListener("click", function () {
        playSound("click");
        if (game) startQuiz(game.kind, game.config);
      });
    }

    if (creativeBackBtn) {
      creativeBackBtn.addEventListener("click", function () {
        playSound("click");
        showView("menu-view");
      });
    }

    if (creativeClearBtn) {
      creativeClearBtn.addEventListener("click", clearCanvas);
    }

    if (creativeSaveBtn) {
      creativeSaveBtn.addEventListener("click", saveCanvas);
    }

    if (soundBtn) {
      soundBtn.addEventListener("click", toggleSound);
    }

    updateSoundButton();

    loadData()
      .then(function (data) {
        DATA = data;
        renderSplash(data);
        renderMenu(data);
        updateSoundButton();
      })
      .catch(function (err) {
        console.warn("Edukasi: gagal memuat data.json", err);
      });
  }

  document.addEventListener("DOMContentLoaded", init);

  // ---- Service worker registration ----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("./service-worker.js")
        .then(function (registration) {
          console.log(
            "Edukasi: Service worker terdaftar dengan scope:",
            registration.scope
          );
        })
        .catch(function (error) {
          console.warn("Edukasi: Pendaftaran service worker gagal:", error);
        });
    });
  }
})();
