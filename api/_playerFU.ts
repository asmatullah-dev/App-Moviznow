import express from "express";
import { Readable } from "stream";

export const playerFURouter = express.Router();
export const play4uRouter = playerFURouter;

interface StreamMetaCache {
  exists: boolean;
  timestamp: number;
  qualities?: Array<{ id?: number; slug?: string; label: string; height?: number }>;
  languages?: Array<{ id?: number; code: string; name: string }>;
  print_name?: string;
  runtime_minutes?: number;
  hasImax?: boolean;
}

const streamCheckCache = new Map<string, StreamMetaCache>();

// 1. Check if movie exists on Play4u backend and fetch available stream features
play4uRouter.get(["/api/stream/check", "/stream/check"], async (req, res) => {
  try {
    const imdbId = (req.query.imdbId as string || "").trim();
    if (!imdbId || !/^tt\d+$/i.test(imdbId)) {
      return res.json({ exists: false });
    }

    const cached = streamCheckCache.get(imdbId);
    const now = Date.now();
    if (cached && now - cached.timestamp < 12 * 60 * 60 * 1000) {
      return res.json(cached);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
    let response = await fetch(`https://play4u.org/${imdbId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      response = await fetch(`https://play4u.org/watch/${imdbId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });
    }
      clearTimeout(timeout);

      if (!response.ok) {
        const missData: StreamMetaCache = { exists: false, timestamp: now };
        streamCheckCache.set(imdbId, missData);
        return res.json(missData);
      }

      const html = await response.text();
      const hasPlay = html.includes("window.__PA_PLAY__") && html.includes("streams");

      let qualities: any[] = [];
      let languages: any[] = [];
      let print_name = "";
      let runtime_minutes = 0;
      let hasImax = false;

      if (hasPlay) {
        try {
          const playMatch = html.match(/window\.__PA_PLAY__\s*=\s*(\{.+?\});/);
          if (playMatch) {
            const parsed = JSON.parse(playMatch[1]);
            const streamObj = parsed.streams?.[0] || parsed.item;
            if (streamObj) {
              qualities = streamObj.qualities || [];
              languages = streamObj.languages || [];
              print_name = streamObj.print_name || "";
            }
            if (parsed.movie) {
              runtime_minutes = parsed.movie.runtime_minutes || 0;
            }
            hasImax = html.toLowerCase().includes("imax");
          }
        } catch (e) {
          console.warn("Error parsing play4u streams metadata:", e);
        }
      }

      const hitData: StreamMetaCache = {
        exists: hasPlay,
        timestamp: now,
        qualities,
        languages,
        print_name,
        runtime_minutes,
        hasImax,
      };
      streamCheckCache.set(imdbId, hitData);
      return res.json(hitData);
    } catch (fetchErr) {
      clearTimeout(timeout);
      return res.json({ exists: false });
    }
  } catch (err: any) {
    console.error("Stream check error:", err);
    res.json({ exists: false });
  }
});

// 2. Masked Player Iframe Route (Never reveals play4u to client!)
play4uRouter.get(["/api/stream/player/:contentId", "/stream/player/:contentId"], async (req, res) => {
  try {
    const { contentId } = req.params;
    const season = (req.query.season as string || "").trim();
    const episode = (req.query.episode as string || "").trim();
    const imdbId = (req.query.imdb as string || "").trim();
    const resumeTime = parseFloat((req.query.t as string) || "0") || 0;
    const initialSpeed = parseFloat((req.query.speed as string) || "1") || 1;
    const rawQuality = (req.query.quality as string || "").trim().toLowerCase();
    // Don't select auto in quality, if missing then select minimum quality
    let qualityPref = rawQuality;
    if (!qualityPref || qualityPref === "auto") {
      const cached = streamCheckCache.get(imdbId);
      if (cached && cached.qualities && cached.qualities.length > 0) {
        const heights = cached.qualities
          .map((q: any) => Number(q.height) || parseInt(String(q.slug || q.label || "").replace(/\D/g, ""), 10) || 0)
          .filter((h: number) => h > 0)
          .sort((a: number, b: number) => a - b);
        qualityPref = heights.length > 0 ? `${heights[0]}p` : "480p";
      } else {
        qualityPref = "480p";
      }
    }
    const langPref = (req.query.lang as string || "").trim();
    const autoplay = req.query.autoplay === "1" || req.query.autoplay === "true";

    if (!imdbId || !/^tt\d+$/i.test(imdbId)) {
      return res.status(400).send("Invalid stream identifier");
    }

    // Build upstream URL with explicit working quality option
    const upstreamParams = new URLSearchParams();
    upstreamParams.set("quality", qualityPref);
    if (langPref) upstreamParams.set("lang", langPref);
    if (autoplay) upstreamParams.set("autoplay", "1");
    const qs = upstreamParams.toString() ? `?${upstreamParams.toString()}` : "";

    // Fetch upstream HTML server-side
    let response = await fetch(`https://play4u.org/${imdbId}${qs}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      response = await fetch(`https://play4u.org/watch/${imdbId}${qs}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
    }

    if (!response.ok) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Stream Unavailable - MovizNow</title><style>body{margin:0;background:#09090b;color:#a1a1aa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;}h2{color:#f43f5e;margin-bottom:8px;}p{font-size:14px;}</style></head>
          <body><div><h2>Stream Currently Unavailable</h2><p>This movie stream is not yet available on the instant player. Please use the download/server links below.</p></div></body>
        </html>
      `);
    }

    let html = await response.text();

    // Ensure proper Referrer Policy so video segment CDNs (uprising.best) receive required origin
    // Play4u requires Referer for edge range requests; we insert meta referrer policy, always-visible buttons, and PlayerFU progress bar styling:
    const fullscreenButtonsStyle = `
      <style>
        /* Show all buttons always in PlayerFU - do not hide! */
        #btnAudio,
        #btnSubs,
        #btnSpeed,
        #btnQuality,
        #btnFullscreen,
        #btnPlay,
        #btnMute,
        [data-action="audio"],
        [data-action="subs"],
        [data-action="subtitles"],
        .btn-audio,
        .btn-subs,
        .lang-btn {
          display: inline-flex !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Subtle Mini Progress Bar at the bottom edge when controls/menu are hidden (as in nativePlayer with PlayerFU signature amber color) */
        .player-mini-progress,
        #playerMiniProgress {
          position: absolute !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          height: 4px !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 50 !important;
          cursor: pointer !important;
          pointer-events: auto !important;
          opacity: 0 !important;
          transition: opacity 0.3s ease, height 0.15s ease !important;
        }
        @media (min-width: 640px) {
          .player-mini-progress,
          #playerMiniProgress {
            height: 6px !important;
          }
        }
        .player-mini-progress:hover,
        #playerMiniProgress:hover {
          height: 8px !important;
        }

        /* Unplayed blurred black background */
        .player-mini-progress .player-mini-bg,
        #playerMiniProgress .player-mini-bg {
          position: absolute !important;
          inset: 0 !important;
          background: rgba(0, 0, 0, 0.85) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          border-top: 1px solid rgba(255, 255, 255, 0.2) !important;
          pointer-events: none !important;
        }

        /* Buffer Bar (zinc-600/60) */
        .player-mini-progress .player-mini-buffered,
        #playerMiniProgress .player-mini-buffered {
          position: absolute !important;
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          width: 0% !important;
          background: rgba(113, 113, 122, 0.6) !important;
          transition: width 0.2s ease !important;
          pointer-events: none !important;
        }

        /* Watched Progress Bar with PlayerFU signature amber color (#ff9000 gradient) */
        .player-mini-progress .player-mini-played,
        #playerMiniProgress .player-mini-played {
          position: absolute !important;
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          width: 0% !important;
          background: linear-gradient(90deg, #ff7a00, #ff9000, #ffa42a) !important;
          box-shadow: 0 0 10px rgba(255, 144, 0, 0.85) !important;
          transition: width 0.15s ease !important;
          pointer-events: none !important;
        }

        /* SHOW mini progress bar when controls/menu are hidden (player is idle) */
        .player-mini-progress.is-visible,
        #playerMiniProgress.is-visible,
        .player.idle .player-mini-progress:not(.is-hidden),
        .player.idle #playerMiniProgress:not(.is-hidden),
        body.hide-controls .player .player-mini-progress:not(.is-hidden),
        body.hide-controls .player #playerMiniProgress:not(.is-hidden) {
          opacity: 1 !important;
          pointer-events: auto !important;
        }

        /* STRICTLY HIDE mini progress bar when controls or menu are showing */
        .player-mini-progress.is-hidden,
        #playerMiniProgress.is-hidden,
        .player:not(.idle) .player-mini-progress,
        .player:not(.idle) #playerMiniProgress,
        .player.show-controls .player-mini-progress,
        .player.show-controls #playerMiniProgress,
        .ps-sheet.open ~ .player-mini-progress,
        .ps-sheet.open ~ #playerMiniProgress,
        .ps-backdrop.visible ~ .player-mini-progress,
        .ps-backdrop.visible ~ #playerMiniProgress {
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Center play/pause circle button styling */
        body.is-embed .player .big-play,
        body.is-watch .player .big-play,
        .player .big-play,
        .big-play,
        #bigPlay {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
          max-width: 44px !important;
          max-height: 44px !important;
          border-radius: 50% !important;
          border: 1.5px solid rgba(255, 255, 255, 0.88) !important;
          background: rgba(10, 13, 18, 0.65) !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          z-index: 6 !important;
        }

        .big-play:hover,
        #bigPlay:hover {
          transform: translate(-50%, -50%) scale(1.08) !important;
          background: rgba(15, 20, 28, 0.85) !important;
          border-color: #fff !important;
        }

        /* SVG icon sizing in center circle */
        .big-play svg,
        #bigPlay svg {
          width: 20px !important;
          height: 20px !important;
          max-width: 20px !important;
          max-height: 20px !important;
          margin: 0 !important;
          padding: 0 !important;
          fill: #fff !important;
        }

        /* Center play icon: optical center nudge of +1px balances triangle centroid with its bounding box */
        body.is-embed .player .big-play #bigIconPlay,
        body.is-watch .player .big-play #bigIconPlay,
        .big-play #bigIconPlay,
        #bigIconPlay {
          transform: translateX(1px) !important;
          margin: 0 !important;
        }

        /* Pause icon (two symmetric vertical bars) */
        body.is-embed .player .big-play #bigIconPause,
        body.is-watch .player .big-play #bigIconPause,
        .big-play #bigIconPause,
        #bigIconPause {
          transform: none !important;
          margin: 0 !important;
        }

        /* MUTUAL EXCLUSIVITY: Never show play and pause icons simultaneously in the center circle! */
        /* When paused: show ONLY play icon, hide pause icon */
        .player.show-big-play .big-play #bigIconPlay,
        .player.show-big-play #bigPlay #bigIconPlay,
        .player:not(.is-playing) .big-play #bigIconPlay,
        .player:not(.is-playing) #bigPlay #bigIconPlay {
          display: block !important;
        }
        .player.show-big-play .big-play #bigIconPause,
        .player.show-big-play #bigPlay #bigIconPause,
        .player:not(.is-playing) .big-play #bigIconPause,
        .player:not(.is-playing) #bigPlay #bigIconPause {
          display: none !important;
        }

        /* When playing: show ONLY pause icon, hide play icon */
        .player.is-playing:not(.show-big-play) .big-play #bigIconPlay,
        .player.is-playing:not(.show-big-play) #bigPlay #bigIconPlay {
          display: none !important;
        }
        .player.is-playing:not(.show-big-play) .big-play #bigIconPause,
        .player.is-playing:not(.show-big-play) #bigPlay #bigIconPause {
          display: block !important;
        }

        #btnPlay,
        .cbtn#btnPlay {
          width: 38px !important;
          height: 38px !important;
        }
        #btnPlay svg,
        #iconPlay,
        #iconPause {
          width: 20px !important;
          height: 20px !important;
        }

        /* Speed button refinement: show only the speed (e.g. 1.5x), hide white dot/icon */
        #btnSpeed .p-btn-icon,
        #btnSpeed::before,
        #btnSpeed::after {
          display: none !important;
          content: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
        #btnSpeed,
        .cbtn#btnSpeed {
          font-weight: 600 !important;
          font-size: 12.5px !important;
          letter-spacing: -0.01em !important;
          min-width: 36px !important;
          height: 30px !important;
          padding: 0 8px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        #btnSpeedVal,
        #btnSpeed .lbl-val {
          font-weight: 600 !important;
          font-size: 12.5px !important;
          color: #fff !important;
        }
      </style>
    `;

    if (!html.includes('<meta name="referrer"')) {
      html = html.replace("<head>", `<head>\n<meta name="referrer" content="origin-when-cross-origin">`);
    }
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${fullscreenButtonsStyle}\n</head>`);
    } else {
      html = html.replace("<head>", `<head>\n${fullscreenButtonsStyle}`);
    }

    // Rewrite any edge CDN URLs (e.g. https://uprising.best/range/...) to our proxy /api/stream/range/
    html = html.replace(/https:\/\/[a-zA-Z0-9.-]+\/range\//g, '/api/stream/range/');
    html = html.replace(/"m3u8_path"\s*:\s*"\/range\//g, '"m3u8_path":"/api/stream/range/');
    html = html.replace(/"video_url"\s*:\s*"\/range\//g, '"video_url":"/api/stream/range/');

    // 1. Rewrite assets to our own proxy endpoint so play4u.org NEVER appears in the browser network tab
    html = html.replace(/(href|src)=["']\/assets\/([^"']+)["']/gi, (_match, attr, assetPath) => {
      const sep = assetPath.includes("?") ? "&" : "?";
      return `${attr}="/api/stream/player/assets/${assetPath}${sep}mn=2"`;
    });

    // 2. Neutralize embed-guard.js and sanitize branding
    html = html.replace(/<script[^>]*embed-guard\.js[^>]*><\/script>/gi, '<script>window.__PA_EMBED_GUARD_OK__ = true;</script>');
    html = html.replace(/window\.__PA_SITE__\s*=\s*["'][^"']*["']/g, 'window.__PA_SITE__ = "MovizNow"');
    html = html.replace(/<title>.*?<\/title>/gi, '<title>MovizNow Player</title>');
    html = html.replace(/"embed_url"\s*:\s*"https:\/\/play4u\.org\/[^"]*"/gi, `"embed_url":"/api/stream/player/${contentId}?imdb=${imdbId}"`);

    // Ensure all buttons are shown always: unhide #btnAudio and #btnSubs inline styles
    html = html.replace(/(id="btnAudio"[^>]*?)style="display:none"/g, '$1style="display:inline-flex"');
    html = html.replace(/(id="btnSubs"[^>]*?)style="display:none"/g, '$1style="display:inline-flex"');

    // 3. Inject MovizNow Progress Tracking, Quality Sync & Auto-Resume Script
    const trackingScript = `
      <script>
        (function() {
          var rawContentId = ${JSON.stringify(contentId)};
          var cleanContentId = rawContentId.split("_link_")[0];
          var seasonVal = ${JSON.stringify(season)};
          var episodeVal = ${JSON.stringify(episode)};
          var storageKey = "moviznow_progress_" + cleanContentId;
          if (seasonVal && episodeVal) {
            storageKey = "moviznow_progress_" + cleanContentId + "_s" + seasonVal + "_e" + episodeVal;
          } else if (seasonVal) {
            storageKey = "moviznow_progress_" + cleanContentId + "_s" + seasonVal;
          }
          var resumeTime = ${resumeTime};
          var initialSpeed = ${initialSpeed};

          function initTracker() {
            var video = document.getElementById("video") || document.querySelector("video");
            if (!video) {
              setTimeout(initTracker, 200);
              return;
            }

            // Auto-resume from saved position or query param
            var saved = resumeTime > 5 ? resumeTime : parseFloat(localStorage.getItem(storageKey) || "0");
            var resumed = false;

            function doResume() {
              if (resumed) return;
              if (saved > 5 && video.duration && video.duration > 10 && saved < (video.duration - 15)) {
                resumed = true;
                try {
                  video.currentTime = saved;
                  console.log("[PlayerFU] Resumed playback at:", saved);
                } catch(e) {}
              }
            }

            video.addEventListener("loadedmetadata", doResume);
            video.addEventListener("canplay", doResume);

            // Auto-start playback helper with muted fallback on initial load only
            var initialAutoplayTriggered = false;
            var startInitialPlayback = function() {
              if (initialAutoplayTriggered) return;
              if (video && video.paused) {
                initialAutoplayTriggered = true;
                var p = video.play();
                if (p && typeof p.catch === "function") {
                  p.catch(function() {
                    video.muted = true;
                    video.play().catch(function() {});
                  });
                }
              }
            };

            video.addEventListener("canplay", startInitialPlayback, { once: true });
            video.addEventListener("loadeddata", startInitialPlayback, { once: true });
            setTimeout(startInitialPlayback, 600);

            // One-time user interaction gesture handler to unmute if initial playback was muted
            var hasInteracted = false;
            var handleFirstInteraction = function() {
              if (hasInteracted) return;
              hasInteracted = true;
              document.removeEventListener("click", handleFirstInteraction, true);
              document.removeEventListener("touchend", handleFirstInteraction, true);
              document.removeEventListener("pointerdown", handleFirstInteraction, true);

              if (video && video.muted) {
                video.muted = false;
              }
            };
            document.addEventListener("click", handleFirstInteraction, true);
            document.addEventListener("touchend", handleFirstInteraction, true);
            document.addEventListener("pointerdown", handleFirstInteraction, true);

            // Periodic progress saving and real-time message posting
            var lastSave = 0;
            function reportProgress() {
              var cur = Math.floor(video.currentTime || 0);
              var dur = Math.floor(video.duration || 0);
              var pct = dur > 0 ? (cur / dur) * 100 : 0;
              var realPlayed = document.getElementById("progressPlayed");
              if (realPlayed && realPlayed.style.width) {
                var parsedPct = parseFloat(realPlayed.style.width);
                if (!isNaN(parsedPct) && parsedPct > 0) pct = parsedPct;
              }

              var bufferedPct = 0;
              if (video.buffered && video.buffered.length > 0 && dur > 0) {
                try {
                  var bEnd = video.buffered.end(video.buffered.length - 1);
                  bufferedPct = Math.min(100, Math.max(0, (bEnd / dur) * 100));
                } catch(e) {}
              }

              var now = Date.now();
              if (now - lastSave >= 2000 && cur > 2) {
                lastSave = now;
                try {
                  localStorage.setItem(storageKey, cur.toString());
                } catch(e) {}
              }

              if (window.parent && window.parent !== window) {
                try {
                  var isCtrlVis = true;
                  var pEl = document.getElementById("player") || document.querySelector(".player");
                  if (pEl && pEl.classList.contains("idle")) isCtrlVis = false;
                  window.parent.postMessage({
                    type: "MOVIZNOW_PLAYBACK_PROGRESS",
                    contentId: rawContentId,
                    cleanContentId: cleanContentId,
                    currentTime: cur,
                    duration: dur,
                    percent: pct,
                    bufferedPercent: bufferedPct,
                    isControlsVisible: isCtrlVis
                  }, "*");
                } catch(e) {}
              }
            }

            video.addEventListener("timeupdate", reportProgress);
            video.addEventListener("loadedmetadata", reportProgress);
            video.addEventListener("durationchange", reportProgress);
            video.addEventListener("play", reportProgress);
            video.addEventListener("pause", reportProgress);

            // Apply & persist playback speed preferences
            var currentSpeed = 1;
            try {
              var savedSp = parseFloat(localStorage.getItem("moviznow_playback_speed") || "");
              if (!isNaN(savedSp) && savedSp >= 0.25 && savedSp <= 4) {
                currentSpeed = savedSp;
              } else if (initialSpeed >= 0.25 && initialSpeed <= 4) {
                currentSpeed = initialSpeed;
              }
            } catch(e) {
              if (initialSpeed >= 0.25 && initialSpeed <= 4) currentSpeed = initialSpeed;
            }

            window.__PA_TARGET_SPEED__ = currentSpeed;

            function applySpeed(s) {
              if (typeof s === "number" && s >= 0.25 && s <= 4) {
                currentSpeed = s;
                window.__PA_TARGET_SPEED__ = s;
              } else {
                s = currentSpeed;
              }

              var vid = document.getElementById("video") || document.querySelector("video");
              if (vid) {
                try {
                  if (Math.abs(vid.playbackRate - s) > 0.01) {
                    vid.playbackRate = s;
                    vid.defaultPlaybackRate = s;
                  }
                } catch(e) {}
              }

              try {
                localStorage.setItem("moviznow_playback_speed", String(s));
              } catch(e) {}

              var btnSpeedVal = document.getElementById("btnSpeedVal");
              if (btnSpeedVal) {
                btnSpeedVal.textContent = s + "x";
              }

              checkStatus();
            }

            window.__PA_SET_SPEED__ = applySpeed;

            var speedEvents = ["loadedmetadata", "canplay", "play", "playing", "timeupdate", "seeking", "seeked"];
            speedEvents.forEach(function(evt) {
              video.addEventListener(evt, function() {
                var target = window.__PA_TARGET_SPEED__ || currentSpeed;
                if (target && video && Math.abs(video.playbackRate - target) > 0.01) {
                  try {
                    video.playbackRate = target;
                    video.defaultPlaybackRate = target;
                  } catch(e) {}
                }
                var btnSpeedVal = document.getElementById("btnSpeedVal");
                if (btnSpeedVal && target) {
                  btnSpeedVal.textContent = target + "x";
                }
              });
            });

            applySpeed(currentSpeed);

            // Ensure btnSpeed button is present in control bar
            function ensureBtnSpeed() {
              var btnQuality = document.getElementById("btnQuality");
              if (btnQuality && btnQuality.parentNode && !document.getElementById("btnSpeed")) {
                var btnSpeed = document.createElement("button");
                btnSpeed.type = "button";
                btnSpeed.id = "btnSpeed";
                btnSpeed.className = btnQuality.className || "cbtn text";
                btnSpeed.title = "Playback speed";
                btnSpeed.setAttribute("aria-haspopup", "dialog");
                btnSpeed.setAttribute("aria-label", "Playback speed");
                btnSpeed.innerHTML = '<span id="btnSpeedVal" class="lbl-val">' + (currentSpeed ? (currentSpeed + "x") : "1x") + '</span>';
                btnQuality.parentNode.insertBefore(btnSpeed, btnQuality);
                btnSpeed.addEventListener("click", function(e) {
                  e.stopPropagation();
                  if (typeof window.__PA_OPEN_SPEED_SHEET__ === "function") {
                    window.__PA_OPEN_SPEED_SHEET__();
                  }
                });
              }
            }
            setInterval(ensureBtnSpeed, 400);
            ensureBtnSpeed();

            // Listen to playback speed changes from parent window
            window.addEventListener("message", function(e) {
              if (e.data && e.data.type === "MOVIZNOW_SET_SPEED" && typeof e.data.speed === "number") {
                applySpeed(e.data.speed);
              }
            });

            // Notify parent window when quality, audio track or subtitles are clicked/changed
            function checkStatus() {
              var qualityVal = document.getElementById("btnQualityVal");
              var audioVal = document.getElementById("btnAudioVal");
              var subsVal = document.getElementById("btnSubsVal");
              var btnSpeedVal = document.getElementById("btnSpeedVal");
              var q = qualityVal ? (qualityVal.textContent || "").trim() : "";
              if (q && !q.toLowerCase().startsWith("auto")) {
                try {
                  localStorage.setItem("moviznow_preferred_quality", q.toLowerCase());
                  localStorage.setItem("moviznow_previous_quality", q.toLowerCase());
                } catch(e) {}
              }
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                  type: "MOVIZNOW_PLAYER_STATUS",
                  contentId: contentId,
                  quality: q || null,
                  audio: audioVal ? (audioVal.textContent || "").trim() : null,
                  subs: subsVal ? (subsVal.textContent || "").trim() : null,
                  speed: window.__PA_TARGET_SPEED__ || (video ? video.playbackRate : 1)
                }, "*");
              }
            }

            document.addEventListener("click", function() {
              setTimeout(checkStatus, 150);
              setTimeout(checkStatus, 600);
            }, true);

            setTimeout(checkStatus, 1200);
            setTimeout(checkStatus, 3000);

            // 1. Show all buttons always in PlayerFU - do not hide!
            function syncButtonsVisibility() {
              var btnAudio = document.getElementById("btnAudio") || document.querySelector('[data-action="audio"]');
              if (btnAudio) {
                btnAudio.style.setProperty("display", "inline-flex", "important");
              }
              var btnSubs = document.getElementById("btnSubs") || document.querySelector('[data-action="subs"]') || document.querySelector('[data-action="subtitles"]');
              if (btnSubs) {
                btnSubs.style.setProperty("display", "inline-flex", "important");
              }
              var btnSpeed = document.getElementById("btnSpeed");
              if (btnSpeed) {
                btnSpeed.style.setProperty("display", "inline-flex", "important");
              }
              var btnQuality = document.getElementById("btnQuality");
              if (btnQuality) {
                btnQuality.style.setProperty("display", "inline-flex", "important");
              }
            }

            document.addEventListener("fullscreenchange", syncButtonsVisibility);
            document.addEventListener("webkitfullscreenchange", syncButtonsVisibility);
            document.addEventListener("mozfullscreenchange", syncButtonsVisibility);
            window.addEventListener("resize", syncButtonsVisibility);
            window.addEventListener("orientationchange", syncButtonsVisibility);
            setInterval(syncButtonsVisibility, 350);
            syncButtonsVisibility();

            // 2. Slim progress bar when menu/controls are hidden (identical to nativePlayer, keeping PlayerFU amber color)
            function ensureMiniProgressBar() {
              var player = document.getElementById("player") || document.querySelector(".player");
              if (player && !document.getElementById("playerMiniProgress")) {
                var bar = document.createElement("div");
                bar.className = "player-mini-progress";
                bar.id = "playerMiniProgress";
                bar.title = "Click to show controls";
                bar.innerHTML = '<div class="player-mini-bg" id="playerMiniBg"></div><div class="player-mini-buffered" id="playerMiniBuffered"></div><div class="player-mini-played" id="playerMiniPlayed"></div>';
                player.appendChild(bar);

                var wakeControls = function(e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  if (typeof resetIdle === "function") {
                    resetIdle();
                  } else if (player) {
                    player.classList.remove("idle");
                  }
                  syncMiniProgressVisibility();
                };

                var handleSeekAndWake = function(e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  var rect = bar.getBoundingClientRect();
                  if (rect.width > 0) {
                    var clickX = e.clientX - rect.left;
                    var clickPct = Math.max(0, Math.min(1, clickX / rect.width));
                    var vid = document.getElementById("video") || document.querySelector("video");
                    if (vid && vid.duration && isFinite(vid.duration)) {
                      try {
                        vid.currentTime = clickPct * vid.duration;
                      } catch(err) {}
                    }
                  }
                  wakeControls(e);
                };

                bar.addEventListener("click", handleSeekAndWake);
                bar.addEventListener("pointerdown", wakeControls, { passive: true });
                bar.addEventListener("touchend", wakeControls, { passive: true });
              }
            }
            ensureMiniProgressBar();
            setInterval(ensureMiniProgressBar, 400);

            var lastReportedControlState = null;
            function syncMiniProgressVisibility() {
              var bar = document.getElementById("playerMiniProgress");
              var player = document.getElementById("player") || document.querySelector(".player");
              if (!bar || !player) return;

              // In Play4U, when controls or menu are showing, player does NOT have idle class.
              // When idle auto-hides controls into hidden menu mode, player HAS idle class.
              var isIdle = player.classList.contains("idle") || document.body.classList.contains("hide-controls");
              var psSheet = document.getElementById("psSheet") || document.querySelector(".ps-sheet");
              var isSheetOpen = psSheet ? (psSheet.classList.contains("open") || psSheet.getAttribute("aria-hidden") === "false") : false;
              var isBackdropOpen = Boolean(document.querySelector(".ps-backdrop.visible"));

              // Menu or controls are showing if NOT idle OR a sheet/menu is open
              var isShowing = (!isIdle) || isSheetOpen || isBackdropOpen || player.classList.contains("show-controls");

              if (isShowing) {
                // DO NOT show bottom progress bar when menu or controls are showing!
                bar.classList.add("is-hidden");
                bar.classList.remove("is-visible");
              } else {
                // Show bottom progress bar when menu and controls are hidden (idle mode)
                bar.classList.remove("is-hidden");
                bar.classList.add("is-visible");
              }

              if (lastReportedControlState !== isShowing) {
                lastReportedControlState = isShowing;
                if (window.parent && window.parent !== window) {
                  try {
                    window.parent.postMessage({
                      type: "MOVIZNOW_CONTROLS_VISIBILITY",
                      visible: isShowing
                    }, "*");
                  } catch(e) {}
                }
              }
            }

            function updateMiniProgress() {
              var vid = document.getElementById("video") || document.querySelector("video");
              if (!vid) return;
              var miniPlayed = document.getElementById("playerMiniPlayed");
              var miniBuffered = document.getElementById("playerMiniBuffered");
              var dur = vid.duration || 0;
              var cur = vid.currentTime || 0;
              if (miniPlayed && dur > 0) {
                var pct = (cur / dur) * 100;
                miniPlayed.style.width = Math.min(100, Math.max(0, pct)) + "%";
              }
              if (miniBuffered && dur > 0 && vid.buffered && vid.buffered.length > 0) {
                try {
                  var bEnd = vid.buffered.end(vid.buffered.length - 1);
                  miniBuffered.style.width = Math.min(100, Math.max(0, (bEnd / dur) * 100)) + "%";
                } catch(e) {}
              }
              syncMiniProgressVisibility();
            }

            // Immediately sync on player events and user interactions
            ["mousemove", "mousedown", "pointerdown", "touchstart", "keydown", "click"].forEach(function(evt) {
              window.addEventListener(evt, syncMiniProgressVisibility, { passive: true });
            });

            var playerStage = document.getElementById("player") || document.querySelector(".player");
            if (playerStage && window.MutationObserver) {
              var observer = new MutationObserver(syncMiniProgressVisibility);
              observer.observe(playerStage, { attributes: true, attributeFilter: ["class"] });
            }

            video.addEventListener("timeupdate", updateMiniProgress);
            video.addEventListener("progress", updateMiniProgress);
            video.addEventListener("seeking", updateMiniProgress);
            video.addEventListener("seeked", updateMiniProgress);
            video.addEventListener("pause", syncMiniProgressVisibility);
            video.addEventListener("play", syncMiniProgressVisibility);
            setInterval(updateMiniProgress, 250);

            // Listen for wake controls & seek requests from parent window
            window.addEventListener("message", function(e) {
              if (!e.data) return;
              if (e.data.type === "MOVIZNOW_WAKE_CONTROLS") {
                var player = document.getElementById("player") || document.querySelector(".player");
                if (player) {
                  player.classList.remove("idle");
                  player.classList.add("show-controls");
                  var controls = document.getElementById("controls");
                  if (controls) controls.style.opacity = "1";
                  setTimeout(function() {
                    player.classList.remove("show-controls");
                  }, 3500);
                }
              } else if (e.data.type === "MOVIZNOW_SEEK" && typeof e.data.percent === "number") {
                var vid = document.getElementById("video") || document.querySelector("video");
                if (vid && vid.duration && isFinite(vid.duration)) {
                  try {
                    vid.currentTime = e.data.percent * vid.duration;
                  } catch(err) {}
                }
              }
            });

            // Mutual exclusivity for center circle Play vs Pause icons
            function syncCenterButtonIcons() {
              var vid = document.getElementById("video") || document.querySelector("video");
              var playIcon = document.getElementById("bigIconPlay");
              var pauseIcon = document.getElementById("bigIconPause");
              if (!playIcon || !pauseIcon) return;

              var isPaused = vid ? vid.paused : true;
              if (isPaused) {
                playIcon.style.setProperty("display", "block", "important");
                pauseIcon.style.setProperty("display", "none", "important");
              } else {
                playIcon.style.setProperty("display", "none", "important");
                pauseIcon.style.setProperty("display", "block", "important");
              }
            }

            video.addEventListener("play", syncCenterButtonIcons);
            video.addEventListener("pause", syncCenterButtonIcons);
            video.addEventListener("playing", syncCenterButtonIcons);
            video.addEventListener("timeupdate", syncCenterButtonIcons);
            setInterval(syncCenterButtonIcons, 250);
            syncCenterButtonIcons();

            // 3. Automatically Select Hindi (Hin) when available in PlayerFU until user changed
            function autoSelectHindi() {
              var userChanged = false;
              try {
                userChanged = localStorage.getItem("pa_user_audio_changed") === "true";
              } catch(_) {}
              if (userChanged) return;

              var h = window.hls;
              if (h && h.audioTracks && h.audioTracks.length > 0) {
                var tracks = h.audioTracks;
                var curIdx = h.audioTrack;
                var cur = tracks[curIdx];
                var curLang = cur ? (cur.lang || cur.name || "").toLowerCase() : "";
                if (curLang === "hi" || curLang === "hin" || curLang.startsWith("hi") || curLang.includes("hindi")) {
                  var btnAudioVal = document.getElementById("btnAudioVal");
                  if (btnAudioVal && (btnAudioVal.textContent === "—" || !btnAudioVal.textContent)) {
                    btnAudioVal.textContent = "HIN";
                  }
                  return; // already Hindi
                }

                var hindiIndex = -1;
                for (var i = 0; i < tracks.length; i++) {
                  var t = tracks[i];
                  var c = (t.lang || "").toLowerCase();
                  var n = (t.name || "").toLowerCase();
                  if (c === "hi" || c === "hin" || c.startsWith("hi") || n.includes("hindi") || n.includes("hin")) {
                    hindiIndex = i;
                    break;
                  }
                }

                if (hindiIndex >= 0) {
                  if (typeof h.setAudioOption === "function") {
                    try {
                      h.setAudioOption({ lang: tracks[hindiIndex].lang, name: tracks[hindiIndex].name });
                    } catch(e) {}
                  }
                  h.audioTrack = hindiIndex;
                  var btnAudioValEl = document.getElementById("btnAudioVal");
                  if (btnAudioValEl) btnAudioValEl.textContent = "HIN";
                  console.log("[PlayerFU] Automatically selected Hindi (Hin) track:", tracks[hindiIndex]);
                }
              }
            }

            // Track if user manually chooses another audio track in sheet
            document.addEventListener("click", function(e) {
              var t = e.target;
              if (t && t.closest) {
                var item = t.closest(".ps-item");
                if (item) {
                  var sheetTitle = document.getElementById("psTitle");
                  if (sheetTitle && sheetTitle.textContent && sheetTitle.textContent.toLowerCase().includes("audio")) {
                    try {
                      localStorage.setItem("pa_user_audio_changed", "true");
                    } catch(_) {}
                  }
                }
              }
            }, true);

            setInterval(autoSelectHindi, 500);
            setTimeout(autoSelectHindi, 600);
            setTimeout(autoSelectHindi, 1500);
            setTimeout(autoSelectHindi, 3000);
          }

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initTracker);
          } else {
            initTracker();
          }
        })();
      </script>
    `;

    html = html.replace("</body>", `${trackingScript}</body>`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self' *");
    res.send(html);
  } catch (err: any) {
    console.error("Player proxy error:", err);
    res.status(500).send("Error loading player");
  }
});

// 3. Asset Proxy for Player CSS/JS
play4uRouter.get(["/api/stream/player/assets/*", "/stream/player/assets/*"], async (req, res) => {
  try {
    const assetPath = req.params[0];
    if (!assetPath) return res.status(404).send("Not found");

    const targetUrl = `https://play4u.org/assets/${assetPath}`;
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send("Asset not found");
    }

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    // If this is player.css, normalize optical centering for play icon
    if (assetPath.includes("player.css")) {
      let css = await response.text();
      css = css.replace(/transform:\s*translateX\(5px\);?/g, "transform: translateX(1px);");
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(css);
    }

    // If this is player.js, apply crucial playback & orientation fixes
    if (assetPath.includes("player.js")) {
      let js = await response.text();

      // 1. Prefer AVC/H.264 over HEVC so video plays instantly on all browsers without buffering/stalling
      js = js.replace(/videoPreference:\s*\{\s*videoCodec:\s*["']hvc1["']\s*\}/g, 'videoPreference: { videoCodec: "avc1" }');
      js = js.replace(/videoPreference:\s*IS_IOS\s*\|\|\s*IS_TOUCH\s*\?\s*\{\s*videoCodec:\s*"avc1"\s*\}\s*:\s*\{\s*videoCodec:\s*"hvc1"\s*\}/g, 'videoPreference: { videoCodec: "avc1" }');
      js = js.replace(/const\s+MSE_HEVC_OK\s*=[\s\S]*?MediaSource\.isTypeSupported\([^)]+\)\);/g, 'const MSE_HEVC_OK = false;');
      js = js.replace(
        /function rewriteUrl\(u\)\s*\{[\s\S]*?return\s+s\.startsWith\("\/"\)\s*\?\s*BASE_SERVER\s*\+\s*s\s*:\s*s;\s*\}/,
        `function rewriteUrl(u) {
          if (!u) return "";
          var s = String(u);
          if (s.startsWith("/range/")) return "/api/stream" + s;
          if (s.startsWith("/api/range/")) return "/api/stream" + s.slice(4);
          var rIdx = s.indexOf("/range/");
          if (rIdx !== -1 && !s.includes("/api/stream/range/")) {
            return "/api/stream" + s.slice(rIdx);
          }
          return s.startsWith("/") ? BASE_SERVER + s : s;
        }`
      );

      // EdgeLoader: Ensure all HLS requests (manifest, sub-playlists, fragments, subtitles) route through /api/stream/range/
      js = js.replace(
        /const\s+EdgeLoader\s*=\s*class\s+extends\s+Hls\.DefaultConfig\.loader\s*\{[\s\S]*?super\.load\(context,\s*config,\s*callbacks\);\s*\}\s*\};/,
        `const EdgeLoader = class extends Hls.DefaultConfig.loader {
          load(context, config, callbacks) {
            if (context && context.url) {
              context.url = rewriteUrl(context.url);
            }
            super.load(context, config, callbacks);
          }
        };`
      );

      // Auto-play fallback fix: if unmuted autoplay is blocked by browser, fallback to muted autoplay so video starts immediately
      js = js.replace(
        /if\s*\(paOpts\.autoplay\)\s*\{\s*const\s+tryPlay\s*=\s*\(\)\s*=>\s*videoEl\.play\(\)\.catch\(\(\)\s*=>\s*\{\}\);\s*videoEl\.addEventListener\(["']loadedmetadata["'],\s*tryPlay,\s*\{\s*once:\s*true\s*\}\);\s*setTimeout\(tryPlay,\s*400\);\s*\}/g,
        `if (paOpts.autoplay) {
          const tryPlay = () => {
            var p = videoEl.play();
            if (p && typeof p.catch === "function") {
              p.catch(function() {
                videoEl.muted = true;
                videoEl.play().catch(function(){});
              });
            }
          };
          window.__PA_TRY_PLAY__ = tryPlay;
          videoEl.addEventListener("loadedmetadata", tryPlay, { once: true });
          videoEl.addEventListener("canplay", tryPlay, { once: true });
          setTimeout(tryPlay, 300);
          setTimeout(tryPlay, 800);
          setTimeout(tryPlay, 1500);
        }`
      );

      // 2. Lock screen orientation to landscape when entering fullscreen
      js = js.replace(
        /if\s*\(IS_TOUCH\s*&&\s*screen\.orientation\?\.\s*lock\)/g,
        'if (screen && screen.orientation && typeof screen.orientation.lock === "function")'
      );

      // 3. Patch MANIFEST_PARSED quality selection to use fallback resolution logic and kick off playback
      js = js.replace(
        /if\s*\(window\.__PA_PREF_QUALITY__\s*&&\s*hls\.levels\s*&&\s*hls\.levels\.length\)\s*\{[\s\S]*?applied\s*=\s*true;\s*\}\s*\}/g,
        `var qPref = window.__PA_PREF_QUALITY__ || (function(){ try { return localStorage.getItem("moviznow_preferred_quality"); } catch(e){ return ""; } })();
        var chosenIdx = -1;
        // Don't select auto in quality! If missing or auto, select minimum quality
        if (qPref && String(qPref).toLowerCase() !== "auto") {
          chosenIdx = findBestQualityIndexForTarget(qPref);
        }
        if (chosenIdx < 0 && typeof findMinimumQualityIndex === "function") {
          chosenIdx = findMinimumQualityIndex();
        }
        if (chosenIdx >= 0) {
          setQualityLevel(chosenIdx);
          applied = true;
        }
        if (typeof window.__PA_TRY_PLAY__ === "function") {
          window.__PA_TRY_PLAY__();
        } else if (video && video.paused) {
          var autoP = video.play();
          if (autoP && typeof autoP.catch === "function") {
            autoP.catch(function() {
              video.muted = true;
              video.play().catch(function(){});
            });
          }
        }`
      );

      // 4. Trigger auto playback guard when switching to Auto mode in setQualityLevel
      js = js.replace(
        /if\s*\(idx\s*<\s*0\)\s*\{[\s\S]*?pinLockedQuality\(\{\s*hard:\s*true\s*\}\);\s*\}/g,
        `if (idx < 0) {
          lockedQuality = -1;
          lockedQualityKey = null;
          imaxMode = false;
          storeQualityLock(null);
          // Never save preference if selected Auto
          try { localStorage.removeItem("moviznow_preferred_quality"); } catch(e) {}
          hls.loadLevel = -1;
          hls.nextLevel = -1;
          if (video.paused || !player.classList.contains("has-started")) {
            hls.currentLevel = -1;
          }
          if (typeof __startAutoPlaybackGuard === "function") __startAutoPlaybackGuard();
        } else {
          if (typeof __autoTimer !== "undefined" && __autoTimer) {
            clearTimeout(__autoTimer);
            __autoTimer = null;
          }
          lockedQualityKey = qualityKeyOf(levels[idx], levels);
          lockedQuality = idx;
          if (typeof __recordNonAutoQuality === "function") __recordNonAutoQuality(idx, levels[idx]);
          imaxMode = !!lockedQualityKey.imax;
          storeQualityLock(lockedQualityKey);
          pinLockedQuality({ hard: true });
        }`
      );

      // 5. Patch openSheet to support "speed" sheet type and expose global opener
      js = js.replace(
        "function openSheet(type) {",
        `function openSheet(type) {
          window.__PA_OPEN_SPEED_SHEET__ = function() { openSheet("speed"); };`
      );
      js = js.replace(
        /if\s*\(type\s*===\s*["']quality["']\)\s*\{\s*psTitle\.textContent\s*=\s*["']Quality["'];\s*populateQualitySheet\(\);\s*\}/g,
        `if (type === "speed") {
          psTitle.textContent = "Playback speed";
          populateSpeedSheet();
        } else if (type === "quality") {
          psTitle.textContent = "Quality";
          populateQualitySheet();
        }`
      );

      // 6. Update outside click dismiss to include #btnSpeed
      js = js.replace(
        /\.ps-sheet,\s*#btnAudio,\s*#btnImax,\s*#btnSubs,\s*#btnQuality,\s*\.ps-backdrop/g,
        '.ps-sheet, #btnAudio, #btnImax, #btnSubs, #btnQuality, #btnSpeed, .ps-backdrop'
      );

      // 7. Inject Playback Speed button into control bar
      js = js.replace(
        /btnQuality\.addEventListener\(["']click["'],\s*\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);\s*openSheet\(["']quality["']\);\s*\}\);/g,
        `btnQuality.addEventListener("click", (e) => {
          e.stopPropagation();
          openSheet("quality");
        });
        if (!document.getElementById("btnSpeed") && btnQuality && btnQuality.parentNode) {
          var btnSpeed = document.createElement("button");
          btnSpeed.type = "button";
          btnSpeed.id = "btnSpeed";
          btnSpeed.className = btnQuality.className || "cbtn text";
          btnSpeed.title = "Playback speed";
          btnSpeed.setAttribute("aria-haspopup", "dialog");
          btnSpeed.setAttribute("aria-label", "Playback speed");
          var savedSpeed = 1;
          try {
            var sp = parseFloat(localStorage.getItem("moviznow_playback_speed") || "1");
            if (!isNaN(sp) && sp >= 0.25 && sp <= 4) savedSpeed = sp;
          } catch(e) {}
          btnSpeed.innerHTML = '<span id="btnSpeedVal" class="lbl-val">' + (savedSpeed ? (savedSpeed + "x") : "1x") + '</span>';
          btnQuality.parentNode.insertBefore(btnSpeed, btnQuality);
          btnSpeed.addEventListener("click", (e) => {
            e.stopPropagation();
            openSheet("speed");
          });
        }`
      );

      // 8. Patch preferredAudioLang to automatically prefer Hindi ('hi') unless user changed
      js = js.replace(
        /function preferredAudioLang\(\)\s*\{[\s\S]*?return readStoredAudioLang\(\);\s*\}/,
        `function preferredAudioLang() {
          var userChanged = false;
          try { userChanged = localStorage.getItem("pa_user_audio_changed") === "true"; } catch(_) {}
          if (userChanged) {
            if (window.__PA_PREF_LANG__) {
              return String(window.__PA_PREF_LANG__).toLowerCase().trim().split("-")[0];
            }
            var stored = readStoredAudioLang();
            if (stored) return stored;
          }
          return "hi";
        }`
      );

      // Patch setAudioTrack to mark user changed when a track is manually chosen
      js = js.replace(
        /function setAudioTrack\(index\)\s*\{[\s\S]*?audioUserPicked\s*=\s*true;/,
        `function setAudioTrack(index) {
          try { localStorage.setItem("pa_user_audio_changed", "true"); } catch(_) {}
          if (!hls) return;
          const tracks = hls.audioTracks || [];
          const i = Number(index);
          if (!Number.isFinite(i) || i < 0 || i >= tracks.length) return;
          audioUserPicked = true;`
      );

      // Ensure all buttons are shown always in updateMenuVisibility
      js = js.replace(
        /function updateMenuVisibility\(\)\s*\{[\s\S]*?btnSubs\.style\.display\s*=\s*[^;]+;/g,
        `function updateMenuVisibility() {
          if (btnAudio) btnAudio.style.display = "inline-flex";
          if (btnSubs) btnSubs.style.display = "inline-flex";
          if (typeof btnSpeed !== "undefined" && btnSpeed) btnSpeed.style.display = "inline-flex";
          if (typeof btnQuality !== "undefined" && btnQuality) btnQuality.style.display = "inline-flex";`
      );

      // 9. Inject Speed Sheet builder, Quality Fallback & Auto-Play Protection INSIDE player.js IIFE
      const insideIifeCode = `
        /* MovizNow Playback Speed Sheet inside player.js IIFE */
        function populateSpeedSheet() {
          if (typeof psBody === "undefined" || !psBody) return;
          psBody.innerHTML = "";
          var speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
          var vid = $("video") || document.getElementById("video") || document.querySelector("video");
          var savedSpeedStr = "";
          try { savedSpeedStr = localStorage.getItem("moviznow_playback_speed") || ""; } catch(e) {}
          var savedSpeedNum = parseFloat(savedSpeedStr);
          var curRate = (typeof window.__PA_TARGET_SPEED__ === "number" && window.__PA_TARGET_SPEED__ >= 0.25)
            ? window.__PA_TARGET_SPEED__
            : (!isNaN(savedSpeedNum) && savedSpeedNum >= 0.25
              ? savedSpeedNum
              : ((vid && vid.playbackRate) ? vid.playbackRate : 1));

          speeds.forEach(function(s) {
            var isSel = Math.abs(curRate - s) < 0.01;
            var label = s === 1 ? "1x (Normal)" : (s + "x");
            var item = makeSheetItem({
              label: label,
              selected: isSel,
              keepOpen: true,
              onPick: function() {
                // Immediately show tick/check icon on clicked item and remove from others
                if (psBody) {
                  var allItems = psBody.querySelectorAll(".ps-item");
                  allItems.forEach(function(el) {
                    el.classList.remove("selected");
                    el.setAttribute("aria-selected", "false");
                  });
                  item.classList.add("selected");
                  item.setAttribute("aria-selected", "true");
                }

                // Apply rate and persist
                window.__PA_TARGET_SPEED__ = s;
                if (typeof window.__PA_SET_SPEED__ === "function") {
                  window.__PA_SET_SPEED__(s);
                }
                if (vid) {
                  try {
                    vid.playbackRate = s;
                    vid.defaultPlaybackRate = s;
                  } catch(e) {}
                }
                try {
                  localStorage.setItem("moviznow_playback_speed", String(s));
                } catch(e) {}
                var btnSpeedVal = document.getElementById("btnSpeedVal");
                if (btnSpeedVal) {
                  btnSpeedVal.textContent = s + "x";
                }

                // Brief visual confirmation of the tick before closing sheet
                setTimeout(function() {
                  if (typeof closeSheet === "function") {
                    closeSheet();
                  }
                }, 220);
              }
            });
            psBody.appendChild(item);
          });
        }

        /* MovizNow Smart Quality Fallback & Auto-Play Protection */
        var __lastSelectedNonAutoIndex = -1;
        var __lastSelectedNonAutoHeight = 0;
        function __recordNonAutoQuality(idx, levelObj) {
          __lastSelectedNonAutoIndex = idx;
          if (levelObj && levelObj.height) {
            __lastSelectedNonAutoHeight = Number(levelObj.height);
            try {
              localStorage.setItem("moviznow_previous_quality", String(levelObj.height) + "p");
            } catch(e) {}
          }
        }

        function findMinimumQualityIndex() {
          if (typeof hls === "undefined" || !hls || !hls.levels || !hls.levels.length) return -1;
          var valid = [];
          for (var i = 0; i < hls.levels.length; i++) {
            var l = hls.levels[i];
            if (typeof levelCanPlay === "function" && !levelCanPlay(l)) continue;
            var h = Number(l.height) || 0;
            if (h > 0) valid.push({ i: i, h: h });
          }
          if (!valid.length) return 0;
          valid.sort(function(a, b) { return a.h - b.h; });
          return valid[0].i;
        }

        function findBestQualityIndexForTarget(targetPrefStr) {
          if (typeof hls === "undefined" || !hls || !hls.levels || !hls.levels.length) return -1;
          var targetH = parseInt(String(targetPrefStr).replace(/[^0-9]/g, ""), 10) || 0;
          if (!targetH) return findMinimumQualityIndex();
          var valid = [];
          for (var i = 0; i < hls.levels.length; i++) {
            var l = hls.levels[i];
            if (typeof levelCanPlay === "function" && !levelCanPlay(l)) continue;
            var h = Number(l.height) || 0;
            if (h > 0) valid.push({ i: i, h: h, l: l });
          }
          if (!valid.length) return -1;

          var heights = [];
          for (var j = 0; j < valid.length; j++) {
            if (heights.indexOf(valid[j].h) === -1) heights.push(valid[j].h);
          }

          var chosenH = 0;
          if (heights.indexOf(targetH) !== -1) {
            chosenH = targetH;
          } else {
            var lower = heights.filter(function(h) { return h < targetH; });
            if (lower.length > 0) {
              chosenH = Math.max.apply(null, lower);
            } else {
              var higher = heights.filter(function(h) { return h > targetH; });
              if (higher.length > 0) {
                chosenH = Math.min.apply(null, higher);
              }
            }
          }

          if (!chosenH) return findMinimumQualityIndex();

          var ladder = typeof nearestResolutionLabel === "function" ? (nearestResolutionLabel(chosenH) || (chosenH + "p")) : (chosenH + "p");
          var idx = typeof resolveLockedLevelIndex === "function" ? resolveLockedLevelIndex({ ladder: ladder, fam: "avc", imax: false }) : -1;
          if (idx < 0) {
            for (var k = 0; k < valid.length; k++) {
              if (valid[k].h === chosenH) return valid[k].i;
            }
          }
          return idx;
        }

        var __autoTimer = null;
        function __startAutoPlaybackGuard() {
          if (__autoTimer) clearTimeout(__autoTimer);
          __autoTimer = setTimeout(function() {
            if (typeof qualityIsAuto === "function" && qualityIsAuto()) {
              var vid = $("video") || document.getElementById("video");
              if (vid && (vid.currentTime === 0 || vid.paused || vid.readyState < 3)) {
                console.warn("[PlayerFU] Auto stream did not start playback. Switching to previous selected quality (or minimum).");
                var fallbackIdx = -1;
                if (typeof __lastSelectedNonAutoIndex === "number" && __lastSelectedNonAutoIndex >= 0) {
                  fallbackIdx = __lastSelectedNonAutoIndex;
                } else if (__lastSelectedNonAutoHeight > 0) {
                  fallbackIdx = findBestQualityIndexForTarget(String(__lastSelectedNonAutoHeight) + "p");
                } else {
                  var prevSaved = "";
                  try { prevSaved = localStorage.getItem("moviznow_previous_quality") || ""; } catch(e) {}
                  if (prevSaved && prevSaved.toLowerCase() !== "auto") {
                    fallbackIdx = findBestQualityIndexForTarget(prevSaved);
                  }
                }
                if (fallbackIdx < 0) {
                  fallbackIdx = findMinimumQualityIndex();
                }
                if (fallbackIdx >= 0 && typeof setQualityLevel === "function") {
                  setQualityLevel(fallbackIdx);
                }
              }
            }
          }, 3000);
        }
      `;

      js = js.replace(
        "function populateQualitySheet()",
        `${insideIifeCode}\nfunction populateQualitySheet()`
      );

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(js);
    }

    res.setHeader("Cache-Control", "public, max-age=86400, immutable");

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.status(500).send("Failed to load asset");
  }
});

// 4. Media Range & Segment Proxy (Streams video/audio/subtitles from upstream edge CDN with required Referer)
play4uRouter.options(["/range/*", "/api/stream/range/*", "/api/range/*"], (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.sendStatus(204);
});

play4uRouter.all(["/range/*", "/api/stream/range/*", "/api/range/*"], async (req, res) => {
  try {
    const upstreamPath = req.originalUrl.replace(/^\/api\/stream/, "").replace(/^\/api/, "");
    const upstreamUrl = `https://uprising.best${upstreamPath}`;

    const forwardHeaders: Record<string, string> = {
      "User-Agent": (req.headers["user-agent"] as string) || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://play4u.org/",
      "Accept": (req.headers.accept as string) || "*/*",
    };

    if (req.headers.range) {
      forwardHeaders["Range"] = req.headers.range as string;
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders,
    });

    res.status(upstreamRes.status);

    const passHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "last-modified",
      "etag",
    ];

    for (const h of passHeaders) {
      const val = upstreamRes.headers.get(h);
      if (val) {
        res.setHeader(h, val);
      }
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    if (!upstreamRes.body || req.method === "HEAD") {
      return res.end();
    }

    // If upstream returns an HLS m3u8 playlist, rewrite child /range/ URLs to /api/stream/range/ so all audio, subtitle and video segments proxy through our API seamlessly
    const contentLength = parseInt(upstreamRes.headers.get("content-length") || "0", 10);

    if (upstreamRes.status === 200 && (!contentLength || contentLength < 500000)) {
      const arrayBuf = await upstreamRes.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const head = buf.subarray(0, 7).toString("utf-8");
      if (head === "#EXTM3U") {
        const text = buf.toString("utf-8");
        const rewritten = text
          .replace(/(URI=["'])(?:https?:\/\/[^\/]+)?\/range\//g, '$1/api/stream/range/')
          .replace(/(URI=["'])\/api\/range\//g, '$1/api/stream/range/')
          .replace(/(\r?\n)(?:https?:\/\/[^\/\r\n]+)?\/range\//g, '$1/api/stream/range/')
          .replace(/(\r?\n)\/api\/range\//g, '$1/api/stream/range/');
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Content-Length", Buffer.byteLength(rewritten).toString());
        return res.send(rewritten);
      }
      res.setHeader("Content-Length", buf.length.toString());
      return res.send(buf);
    }

    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    nodeStream.on("error", (streamErr) => {
      console.warn("Stream pipe error:", streamErr);
      if (!res.writableEnded) res.end();
    });
    res.on("close", () => {
      nodeStream.destroy();
    });
    nodeStream.pipe(res);
  } catch (err: any) {
    console.error("Range proxy error:", err);
    if (!res.headersSent) {
      res.status(502).send("Upstream stream error");
    }
  }
});
