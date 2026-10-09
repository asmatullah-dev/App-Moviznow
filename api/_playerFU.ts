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
    const imdbId = (req.query.imdb as string || "").trim();
    const resumeTime = parseFloat((req.query.t as string) || "0") || 0;
    const initialSpeed = parseFloat((req.query.speed as string) || "1") || 1;
    const rawQuality = (req.query.quality as string || "").trim().toLowerCase();
    // Default to 1080p instead of broken Auto (which hangs on HEVC IMAX streams in standard browsers)
    const qualityPref = (!rawQuality || rawQuality === "auto") ? "1080p" : rawQuality;
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
    // Play4u requires Referer for edge range requests; we insert meta referrer policy:
    if (!html.includes('<meta name="referrer"')) {
      html = html.replace("<head>", '<head>\n<meta name="referrer" content="origin-when-cross-origin">');
    }

    // Rewrite any edge CDN URLs (e.g. https://uprising.best/range/...) to our proxy /api/stream/range/
    html = html.replace(/https:\/\/[a-zA-Z0-9.-]+\/range\//g, '/api/stream/range/');
    html = html.replace(/"m3u8_path"\s*:\s*"\/range\//g, '"m3u8_path":"/api/stream/range/');
    html = html.replace(/"video_url"\s*:\s*"\/range\//g, '"video_url":"/api/stream/range/');

    // 1. Rewrite assets to our own proxy endpoint so play4u.org NEVER appears in the browser network tab
    html = html.replace(/(href|src)=["']\/assets\//gi, '$1="/api/stream/player/assets/');

    // 2. Neutralize embed-guard.js and sanitize branding
    html = html.replace(/<script[^>]*embed-guard\.js[^>]*><\/script>/gi, '<script>window.__PA_EMBED_GUARD_OK__ = true;</script>');
    html = html.replace(/window\.__PA_SITE__\s*=\s*["'][^"']*["']/g, 'window.__PA_SITE__ = "MovizNow"');
    html = html.replace(/<title>.*?<\/title>/gi, '<title>MovizNow Player</title>');
    html = html.replace(/"embed_url"\s*:\s*"https:\/\/play4u\.org\/[^"]*"/gi, `"embed_url":"/api/stream/player/${contentId}?imdb=${imdbId}"`);

    // 3. Inject MovizNow Progress Tracking, Quality Sync & Auto-Resume Script
    const trackingScript = `
      <script>
        (function() {
          var contentId = ${JSON.stringify(contentId)};
          var storageKey = "moviznow_progress_" + contentId;
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

            // Unmute on first user touch/click if video was autostarted muted
            var unmuteOnTouch = function() {
              if (video && video.muted) {
                video.muted = false;
              }
            };
            document.addEventListener("click", unmuteOnTouch, { once: true });
            document.addEventListener("touchend", unmuteOnTouch, { once: true });

            // Periodic progress saving every 2 seconds
            var lastSave = 0;
            video.addEventListener("timeupdate", function() {
              var now = Date.now();
              if (now - lastSave >= 2000 && video.currentTime > 2) {
                lastSave = now;
                var cur = Math.floor(video.currentTime);
                var dur = Math.floor(video.duration || 0);
                try {
                  localStorage.setItem(storageKey, cur.toString());
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      type: "MOVIZNOW_PLAYBACK_PROGRESS",
                      contentId: contentId,
                      currentTime: cur,
                      duration: dur,
                      percent: dur > 0 ? (cur / dur) * 100 : 0
                    }, "*");
                  }
                } catch(e) {}
              }
            });

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

              var btnSpeed = document.getElementById("btnSpeed");
              if (btnSpeed) {
                if (s !== 1) btnSpeed.classList.add("active");
                else btnSpeed.classList.remove("active");
              }

              checkStatus();
            }

            window.__PA_SET_SPEED__ = applySpeed;

            var speedEvents = ["loadedmetadata", "canplay", "play", "playing", "ratechange", "timeupdate", "seeking", "seeked"];
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

    // If this is player.js, apply crucial playback & orientation fixes
    if (assetPath.includes("player.js")) {
      let js = await response.text();

      // 1. Prefer AVC/H.264 over HEVC so video plays instantly on all browsers without buffering/stalling
      js = js.replace(/videoPreference:\s*\{\s*videoCodec:\s*["']hvc1["']\s*\}/g, 'videoPreference: { videoCodec: "avc1" }');
      js = js.replace(/videoPreference:\s*IS_IOS\s*\|\|\s*IS_TOUCH\s*\?\s*\{\s*videoCodec:\s*"avc1"\s*\}\s*:\s*\{\s*videoCodec:\s*"hvc1"\s*\}/g, 'videoPreference: { videoCodec: "avc1" }');
      js = js.replace(/const\s+MSE_HEVC_OK\s*=[\s\S]*?MediaSource\.isTypeSupported\([^)]+\)\);/g, 'const MSE_HEVC_OK = false;');
      js = js.replace(/function rewriteUrl\(u\)\s*\{[\s\S]*?return\s+s\.startsWith\("\/"\)\s*\?\s*BASE_SERVER\s*\+\s*s\s*:\s*s;\s*\}/, 'function rewriteUrl(u) { if (!u) return ""; var s = String(u); if (s.startsWith("/range/")) return "/api/stream" + s; return s.startsWith("/") ? BASE_SERVER + s : s; }');

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
          videoEl.addEventListener("loadedmetadata", tryPlay, { once: true });
          videoEl.addEventListener("canplay", tryPlay, { once: true });
          setTimeout(tryPlay, 300);
          setTimeout(tryPlay, 800);
        }`
      );

      // 2. Lock screen orientation to landscape when entering fullscreen
      js = js.replace(
        /if\s*\(IS_TOUCH\s*&&\s*screen\.orientation\?\.\s*lock\)/g,
        'if (screen && screen.orientation && typeof screen.orientation.lock === "function")'
      );

      // 3. Patch MANIFEST_PARSED quality selection to use fallback resolution logic
      js = js.replace(
        /if\s*\(window\.__PA_PREF_QUALITY__\s*&&\s*hls\.levels\s*&&\s*hls\.levels\.length\)\s*\{[\s\S]*?applied\s*=\s*true;\s*\}\s*\}/g,
        `var qPref = window.__PA_PREF_QUALITY__ || (function(){ try { return localStorage.getItem("moviznow_preferred_quality"); } catch(e){ return ""; } })();
        if (qPref && String(qPref).toLowerCase() !== "auto" && hls.levels && hls.levels.length) {
          var bestIdx = findBestQualityIndexForTarget(qPref);
          if (bestIdx >= 0) {
            setQualityLevel(bestIdx);
            applied = true;
          }
        }
        if (!applied && typeof qualityIsAuto === "function" && qualityIsAuto()) {
          if (typeof __startAutoPlaybackGuard === "function") __startAutoPlaybackGuard();
        }`
      );

      // 4. Trigger auto playback guard when switching to Auto mode in setQualityLevel
      js = js.replace(
        /if\s*\(idx\s*<\s*0\)\s*\{\s*lockedQuality\s*=\s*-1;[\s\S]*?hls\.currentLevel\s*=\s*-1;\s*\}\s*\}/g,
        `if (idx < 0) {
          lockedQuality = -1;
          lockedQualityKey = null;
          imaxMode = false;
          storeQualityLock(null);
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
        }`
      );

      // 5. Patch openSheet to support "speed" sheet type
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
          btnSpeed.className = btnQuality.className || "p-btn";
          btnSpeed.title = "Playback speed";
          var savedSpeed = 1;
          try {
            var sp = parseFloat(localStorage.getItem("moviznow_playback_speed") || "1");
            if (!isNaN(sp) && sp >= 0.25 && sp <= 4) savedSpeed = sp;
          } catch(e) {}
          if (savedSpeed !== 1) btnSpeed.classList.add("active");
          btnSpeed.innerHTML = '<span class="p-btn-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg></span><span id="btnSpeedVal" class="p-btn-val">' + savedSpeed + 'x</span>';
          btnQuality.parentNode.insertBefore(btnSpeed, btnQuality);
          btnSpeed.addEventListener("click", (e) => {
            e.stopPropagation();
            openSheet("speed");
          });
        }`
      );

      // 8. Append helper methods for quality resolution, playback speed sheet & 15s Auto safety guard
      js += `
        /* MovizNow Playback Speed Sheet */
        function populateSpeedSheet() {
          if (typeof psBody === "undefined" || !psBody) return;
          psBody.innerHTML = "";
          var speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
          var video = document.getElementById("video") || document.querySelector("video");
          var curRate = window.__PA_TARGET_SPEED__ || (video ? video.playbackRate : 1) || 1;

          speeds.forEach(function(s) {
            var isSel = Math.abs(curRate - s) < 0.01;
            var label = s === 1 ? "1x (Normal)" : (s + "x");
            var item = makeSheetItem({
              label: label,
              selected: isSel,
              onPick: function() {
                if (typeof window.__PA_SET_SPEED__ === "function") {
                  window.__PA_SET_SPEED__(s);
                } else {
                  if (video) {
                    try {
                      video.playbackRate = s;
                      video.defaultPlaybackRate = s;
                    } catch(e) {}
                  }
                  try {
                    localStorage.setItem("moviznow_playback_speed", String(s));
                  } catch(e) {}
                  var btnSpeedVal = document.getElementById("btnSpeedVal");
                  if (btnSpeedVal) {
                    btnSpeedVal.textContent = s + "x";
                  }
                  var btnSpeed = document.getElementById("btnSpeed");
                  if (btnSpeed) {
                    if (s !== 1) btnSpeed.classList.add("active");
                    else btnSpeed.classList.remove("active");
                  }
                }
                if (typeof closeSheet === "function") {
                  closeSheet();
                }
              }
            });
            psBody.appendChild(item);
          });
        }

        /* MovizNow Smart Quality Fallback & Auto-Play Protection */
        function findBestQualityIndexForTarget(targetPrefStr) {
          if (typeof hls === "undefined" || !hls || !hls.levels || !hls.levels.length) return -1;
          var targetH = parseInt(String(targetPrefStr).replace(/[^0-9]/g, ""), 10) || 1080;
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

          if (!chosenH) return -1;

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
              var vid = document.getElementById("video");
              if (vid && (vid.currentTime === 0 || vid.paused || vid.readyState < 3)) {
                console.warn("[PlayerFU] Auto stream stalled for 15s. Switching to saved preference.");
                var saved = "1080p";
                try {
                  saved = localStorage.getItem("moviznow_preferred_quality") || "1080p";
                } catch(e) {}
                var bestIdx = findBestQualityIndexForTarget(saved);
                if (bestIdx < 0) bestIdx = findBestQualityIndexForTarget("1080p");
                if (bestIdx < 0) bestIdx = findBestQualityIndexForTarget("720p");
                if (bestIdx >= 0 && typeof setQualityLevel === "function") {
                  setQualityLevel(bestIdx);
                }
              }
            }
          }, 15000);
        }

        (function() {
          function attachAutoListeners() {
            var vid = document.getElementById("video");
            if (!vid) {
              setTimeout(attachAutoListeners, 200);
              return;
            }
            var cancelGuard = function() {
              if (vid.currentTime > 0) {
                if (__autoTimer) {
                  clearTimeout(__autoTimer);
                  __autoTimer = null;
                }
              }
            };
            vid.addEventListener("timeupdate", cancelGuard);
            vid.addEventListener("playing", cancelGuard);
          }
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", attachAutoListeners);
          } else {
            attachAutoListeners();
          }
        })();
      `;

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
    const contentType = (upstreamRes.headers.get("content-type") || "").toLowerCase();
    const contentLength = parseInt(upstreamRes.headers.get("content-length") || "0", 10);
    const isPlaylist = contentType.includes("mpegurl") || contentType.includes("application/vnd.apple.mpegurl") || (contentLength > 0 && contentLength < 350000);

    if (upstreamRes.status === 200 && isPlaylist) {
      const text = await upstreamRes.text();
      if (text.includes("#EXTM3U")) {
        const rewritten = text
          .replace(/(URI=["'])\/range\//g, '$1/api/stream/range/')
          .replace(/(\n)\/range\//g, '$1/api/stream/range/');
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Content-Length", Buffer.byteLength(rewritten).toString());
        return res.send(rewritten);
      }
      res.setHeader("Content-Length", Buffer.byteLength(text).toString());
      return res.send(text);
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
