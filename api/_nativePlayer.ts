import express from "express";
import { Readable } from "stream";
import { spawn } from "child_process";
import { getCachedHubcloudData, isExtractableIntermediate, performExtraction } from "./_LinkExtractionModal.js";
import { normalizeDomain } from "./_domainUtils.js";

export const nativePlayerRouter = express.Router();

let cachedFfmpegAvailable: boolean | null = null;
export async function checkFFmpegAvailable(): Promise<boolean> {
  if (cachedFfmpegAvailable !== null) return cachedFfmpegAvailable;
  return new Promise((resolve) => {
    try {
      const proc = spawn("ffmpeg", ["-version"]);
      proc.on("error", () => {
        cachedFfmpegAvailable = false;
        resolve(false);
      });
      proc.on("close", (code) => {
        cachedFfmpegAvailable = code === 0;
        resolve(cachedFfmpegAvailable);
      });
    } catch {
      cachedFfmpegAvailable = false;
      resolve(false);
    }
  });
}

let cachedFfprobeAvailable: boolean | null = null;
export async function checkFFprobeAvailable(): Promise<boolean> {
  if (cachedFfprobeAvailable !== null) return cachedFfprobeAvailable;
  return new Promise((resolve) => {
    try {
      const proc = spawn("ffprobe", ["-version"]);
      proc.on("error", () => {
        cachedFfprobeAvailable = false;
        resolve(false);
      });
      proc.on("close", (code) => {
        cachedFfprobeAvailable = code === 0;
        resolve(cachedFfprobeAvailable);
      });
    } catch {
      cachedFfprobeAvailable = false;
      resolve(false);
    }
  });
}

export interface NativeStreamData {
  hasWatchOnline: boolean;
  playable?: boolean;
  watchUrl?: string;
  streamUrl?: string;
  directUrl?: string;
  sourceUrl?: string;
  title?: string;
  mime?: string;
  size?: string;
  quality?: string;
  candidates?: Array<{ text: string; href: string }>;
  duration?: number;
  format?: string;
  videoCodec?: string;
  audioCodec?: string;
  needsTranscode?: boolean;
  isHls?: boolean;
  audioTracks?: Array<{ id: number; language: string; codec: string; title: string }>;
  subtitleTracks?: Array<{ id: number; language: string; title: string }>;
}

export interface MediaProbeInfo {
  duration: number;
  format: string;
  videoCodec: string;
  width: number;
  height: number;
  isMkv: boolean;
  audioTracks: Array<{ id: number; language: string; codec: string; title: string }>;
  subtitleTracks: Array<{ id: number; language: string; title: string }>;
  needsTranscode: boolean;
  playable?: boolean;
}

export function decodeBase64Safe(input?: string): string {
  if (!input || typeof input !== "string") return "";
  try {
    let clean = input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    while (clean.length % 4 !== 0) {
      clean += "=";
    }
    return Buffer.from(clean, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

export function parseWatchUrl(watchUrl: string): {
  streamUrl?: string;
  mime?: string;
  title?: string;
} {
  if (!watchUrl) return {};
  try {
    const parsed = new URL(watchUrl);
    const uParam = parsed.searchParams.get("u");
    const mParam = parsed.searchParams.get("m");
    const tParam = parsed.searchParams.get("t");

    const streamUrl = uParam ? decodeBase64Safe(uParam) : undefined;
    const mime = mParam ? decodeBase64Safe(mParam) : undefined;
    const title = tParam ? decodeBase64Safe(tParam) : undefined;

    return {
      streamUrl: streamUrl && streamUrl.startsWith("http") ? streamUrl : undefined,
      mime: mime || undefined,
      title: title || undefined,
    };
  } catch {
    return {};
  }
}

export function normalizePixeldrainUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const uMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(pixeldrain\.(?:dev|com|net)|pixel\.drain|pixeldra\.in)\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/i
  );
  if (uMatch && uMatch[2]) {
    const host = uMatch[1].toLowerCase().includes("dev") ? "pixeldrain.dev" : "pixeldrain.com";
    return `https://${host}/api/file/${uMatch[2]}`;
  }
  return trimmed;
}

export function findFslCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const match = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("fsl") ||
      h.includes("cloudflarestorage") ||
      h.includes(".r2.")
    );
  });
  if (match && match.href) {
    return {
      text: match.text || "FSL Server",
      href: match.href,
    };
  }
  return null;
}

export function findPixeldrainCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string; streamUrl: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const match = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("pixel") ||
      h.includes("pixeldrain") ||
      h.includes("pixelserver") ||
      t.includes("pdrain")
    );
  });
  if (match && match.href) {
    const rawHref = match.href.trim();
    return {
      text: match.text || "Pixeldrain Server",
      href: rawHref,
      streamUrl: normalizePixeldrainUrl(rawHref),
    };
  }
  return null;
}

export function findWatchCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  // 1. Prioritize FSL server candidate if available
  const fslCandidate = findFslCandidate(candidates);
  if (fslCandidate) {
    return fslCandidate;
  }

  // 2. Prioritize Pixeldrain server candidate if FSL is missing
  const pixelCandidate = findPixeldrainCandidate(candidates);
  if (pixelCandidate) {
    return {
      text: pixelCandidate.text,
      href: pixelCandidate.streamUrl,
    };
  }

  // 3. Explicit "watch online" or "watch" text
  const watchCandidate = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("watch online") ||
      t.includes("watch") ||
      t.includes("stream") ||
      h.includes("hbplay.pages.dev")
    );
  });

  if (watchCandidate && watchCandidate.href) {
    return {
      text: watchCandidate.text || "Watch Online",
      href: watchCandidate.href,
    };
  }

  // 4. Any direct video extension candidate
  const directVid = candidates.find((c) => {
    if (!c || !c.href) return false;
    const h = c.href.toLowerCase();
    return (
      (h.includes(".mp4") || h.includes(".mkv") || h.includes(".webm")) &&
      !isExtractableIntermediate(c.href)
    );
  });

  if (directVid && directVid.href) {
    return {
      text: directVid.text || "Watch Video",
      href: directVid.href,
    };
  }

  return null;
}

const checkCache = new Map<string, { data: NativeStreamData; timestamp: number }>();
const CHECK_CACHE_TTL = 15 * 60 * 1000;

const infoCache = new Map<string, { data: MediaProbeInfo; timestamp: number }>();
const INFO_CACHE_TTL = 30 * 60 * 1000;

/**
 * 1. Automatically check Hubcloud link for watch online / FSL server extraction
 */
nativePlayerRouter.post(["/api/native-player/check", "/native-player/check"], async (req, res) => {
  try {
    const rawUrl = (req.body?.url || req.query?.url || "") as string;
    const url = rawUrl.trim();
    if (!url) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const cached = checkCache.get(url);
    if (cached && Date.now() - cached.timestamp < CHECK_CACHE_TTL) {
      return res.json(cached.data);
    }

    // 1. Direct watch or stream URL check (workers.dev, R2, Pixeldrain, raw video links, hbplay)
    if (
      url.includes("workers.dev") ||
      url.includes("cloudflarestorage") ||
      url.includes(".r2.") ||
      url.includes("pixeldrain") ||
      url.includes("pixel.drain") ||
      url.includes(".mp4") ||
      url.includes(".mkv") ||
      url.includes(".webm")
    ) {
      const resolvedStreamUrl = normalizePixeldrainUrl(url);
      const isMkv =
        resolvedStreamUrl.includes(".mkv") ||
        url.includes(".mkv") ||
        url.toLowerCase().includes("matroska");
      const result: NativeStreamData = {
        hasWatchOnline: true,
        playable: true,
        watchUrl: resolvedStreamUrl,
        streamUrl: resolvedStreamUrl,
        directUrl: `/api/native-player/stream?url=${encodeURIComponent(resolvedStreamUrl)}${isMkv ? "&mode=transcode" : ""}`,
        sourceUrl: resolvedStreamUrl,
        title: "Movie Stream",
        mime: isMkv ? "video/x-matroska" : "video/mp4",
        quality: "720p",
        candidates: [{ text: "Pixeldrain Server", href: resolvedStreamUrl }],
      };
      checkCache.set(url, { data: result, timestamp: Date.now() });
      return res.json(result);
    }

    if (url.includes("hbplay.pages.dev") || url.includes("?u=")) {
      const parsed = parseWatchUrl(url);
      const stream = parsed.streamUrl || url;
      const result: NativeStreamData = {
        hasWatchOnline: true,
        playable: true,
        watchUrl: url,
        streamUrl: stream,
        directUrl: `/api/native-player/stream?url=${encodeURIComponent(stream)}`,
        sourceUrl: stream,
        title: parsed.title || "Movie",
        mime: parsed.mime || "video/mp4",
        quality: "720p",
      };
      checkCache.set(url, { data: result, timestamp: Date.now() });
      return res.json(result);
    }

    // 2. Check in-memory Hubcloud extraction cache
    const cachedHub = getCachedHubcloudData(url);
    if (cachedHub && Array.isArray(cachedHub.candidates) && cachedHub.candidates.length > 0) {
      const fsl = findFslCandidate(cachedHub.candidates);
      const pixel = findPixeldrainCandidate(cachedHub.candidates);
      const match = findWatchCandidate(cachedHub.candidates);
      if (fsl || pixel || match) {
        const rawStream = fsl ? fsl.href : pixel ? pixel.streamUrl : (match ? match.href : "");
        const streamUrl = normalizePixeldrainUrl(rawStream);
        const parsed = parseWatchUrl(streamUrl);
        const title = parsed.title || cachedHub.title || "Movie";

        let watchUrl = streamUrl.includes("hbplay.pages.dev")
          ? streamUrl
          : `https://hbplay.pages.dev/?u=${Buffer.from(streamUrl).toString("base64")}&m=${Buffer.from("video/x-matrosk").toString("base64")}&t=${Buffer.from(title).toString("base64")}`;

        const isMkv = streamUrl.includes(".mkv") || streamUrl.toLowerCase().includes("matroska");
        const result: NativeStreamData = {
          hasWatchOnline: true,
          playable: true,
          watchUrl,
          streamUrl,
          directUrl: `/api/native-player/stream?url=${encodeURIComponent(streamUrl)}`,
          sourceUrl: streamUrl,
          title,
          mime: parsed.mime || (isMkv ? "video/x-matroska" : "video/mp4"),
          size: cachedHub.size,
          quality: cachedHub.quality || "720p",
          candidates: cachedHub.candidates,
        };
        checkCache.set(url, { data: result, timestamp: Date.now() });
        return res.json(result);
      }
    }

    // 3. Perform server extraction call (in-process direct extraction for Vercel & local support)
    try {
      let data: any = null;
      try {
        data = await performExtraction(url, false, 0, false, false);
      } catch {
        const port = process.env.PORT || 3000;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        try {
          const extractRes = await fetch(`http://127.0.0.1:${port}/api/hubcloud/direct-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (extractRes.ok) {
            data = await extractRes.json();
          }
        } catch {
          clearTimeout(timeout);
        }
      }

      if (data) {
        const fsl = findFslCandidate(data.candidates);
        const pixel = findPixeldrainCandidate(data.candidates);
        const match = findWatchCandidate(data.candidates);

        if (fsl || pixel || match) {
          const rawStream = fsl ? fsl.href : pixel ? pixel.streamUrl : (match ? match.href : "");
          const streamUrl = normalizePixeldrainUrl(rawStream);
          const parsed = parseWatchUrl(streamUrl);
          const title = parsed.title || data.title || data.original_title || "Movie";

          let watchUrl = streamUrl.includes("hbplay.pages.dev")
            ? streamUrl
            : `https://hbplay.pages.dev/?u=${Buffer.from(streamUrl).toString("base64")}&m=${Buffer.from("video/x-matrosk").toString("base64")}&t=${Buffer.from(title).toString("base64")}`;

          const isMkv = streamUrl.includes(".mkv") || streamUrl.toLowerCase().includes("matroska");
          const result: NativeStreamData = {
            hasWatchOnline: true,
            playable: true,
            watchUrl,
            streamUrl,
            directUrl: `/api/native-player/stream?url=${encodeURIComponent(streamUrl)}`,
            sourceUrl: streamUrl,
            title,
            mime: parsed.mime || (isMkv ? "video/x-matroska" : "video/mp4"),
            size: data.size,
            quality: data.quality || data.shortQuality || "720p",
            candidates: data.candidates,
          };
          checkCache.set(url, { data: result, timestamp: Date.now() });
          return res.json(result);
        }
      }
    } catch {}

    const noResult: NativeStreamData = { hasWatchOnline: false, playable: false };
    // Only cache transient failure for 5 seconds so retries or subsequent links are never blocked
    checkCache.set(url, { data: noResult, timestamp: Date.now() - (CHECK_CACHE_TTL - 5000) });
    return res.json(noResult);
  } catch (err: any) {
    console.error("[NativePlayer Check Error]:", err);
    return res.status(500).json({ error: "Failed to check watch link", hasWatchOnline: false });
  }
});

/**
 * 2. Resolve watch online details from any watchUrl or hubcloud link
 */
nativePlayerRouter.get(["/api/native-player/resolve", "/native-player/resolve"], async (req, res) => {
  try {
    const rawUrl = (req.query?.url || "") as string;
    const url = rawUrl.trim();
    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    if (url.includes("hbplay.pages.dev") || url.includes("?u=")) {
      const parsed = parseWatchUrl(url);
      return res.json({
        watchUrl: url,
        streamUrl: parsed.streamUrl,
        title: parsed.title,
        mime: parsed.mime,
      });
    }

    let data: any = null;
    try {
      data = await performExtraction(url, false, 0, false, false);
    } catch {
      const port = process.env.PORT || 3000;
      try {
        const extractRes = await fetch(`http://127.0.0.1:${port}/api/hubcloud/direct-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (extractRes.ok) {
          data = await extractRes.json();
        }
      } catch {}
    }

    if (data) {
      const fsl = findFslCandidate(data.candidates);
      const pixel = findPixeldrainCandidate(data.candidates);
      const match = findWatchCandidate(data.candidates);
      const chosen = fsl || pixel || match;
      if (chosen) {
        const rawStream = fsl ? fsl.href : pixel ? pixel.streamUrl : chosen.href;
        const streamUrl = normalizePixeldrainUrl(rawStream);
        const parsed = parseWatchUrl(streamUrl);
        return res.json({
          watchUrl: streamUrl,
          streamUrl,
          title: parsed.title || data.title,
          mime: parsed.mime,
          quality: data.quality || "720p",
        });
      }
    }

    return res.json({ error: "No stream found" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * 3. Media Information Probe with ffprobe
 * Inspects duration, codecs, audio tracks and subtitles
 */
nativePlayerRouter.all(["/api/native-player/info", "/native-player/info"], async (req, res) => {
  try {
    const rawTarget = ((req.query.url || req.body?.url || "") as string).trim();
    if (!rawTarget || !rawTarget.startsWith("http")) {
      return res.status(400).json({ error: "Invalid or missing url" });
    }
    const targetUrl = normalizePixeldrainUrl(rawTarget) || rawTarget;

    const cached = infoCache.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < INFO_CACHE_TTL) {
      return res.json(cached.data);
    }

    let isPixeldrain = false;
    let pixeldrainId = "";
    const pdMatch = targetUrl.match(/pixeldrain\.(?:dev|com|net)\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/i);
    if (pdMatch && pdMatch[1]) {
      isPixeldrain = true;
      pixeldrainId = pdMatch[1];
    }

    let isMkv = isPixeldrain || targetUrl.toLowerCase().includes(".mkv") || targetUrl.toLowerCase().includes("matroska");
    let needsTranscode = isMkv;

    if (isPixeldrain && pixeldrainId) {
      try {
        const primaryHost = targetUrl.includes("pixeldrain.dev") ? "pixeldrain.dev" : "pixeldrain.com";
        const secondaryHost = primaryHost === "pixeldrain.dev" ? "pixeldrain.com" : "pixeldrain.dev";
        const pdInfoRes = await fetch(`https://${primaryHost}/api/file/${pixeldrainId}/info`, {
          signal: AbortSignal.timeout(2000),
        }).catch(() =>
          fetch(`https://${secondaryHost}/api/file/${pixeldrainId}/info`, {
            signal: AbortSignal.timeout(2000),
          })
        );
        if (pdInfoRes && pdInfoRes.ok) {
          const pdInfo: any = await pdInfoRes.json();
          const mime = (pdInfo.mime_type || "").toLowerCase();
          const fname = (pdInfo.name || "").toLowerCase();
          if (
            mime.includes("matroska") ||
            fname.endsWith(".mkv") ||
            fname.includes("mkv") ||
            fname.includes("hevc") ||
            fname.includes("h265") ||
            mime.includes("hevc")
          ) {
            isMkv = true;
            needsTranscode = true;
          }
        }
      } catch {}
    }

    const defaultData: MediaProbeInfo = {
      duration: 0,
      format: isMkv ? "matroska,webm" : "mp4",
      videoCodec: isMkv ? "hevc" : "h264",
      width: 1920,
      height: 1080,
      isMkv,
      audioTracks: [{ id: 0, language: "Stereo", codec: "aac", title: "Audio Track" }],
      subtitleTracks: [],
      needsTranscode,
      playable: true,
    };

    const hasFfprobe = await checkFFprobeAvailable();
    if (!hasFfprobe) {
      // Vercel serverless environment: ffprobe is not installed
      // Return instant metadata without spawning ffprobe to avoid ENOENT errors
      infoCache.set(targetUrl, { data: defaultData, timestamp: Date.now() });
      return res.json(defaultData);
    }

    let referer = "";
    if (targetUrl.includes("hbplay.pages.dev")) {
      referer = "https://hbplay.pages.dev/";
    }

    const headerStr = referer
      ? `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`
      : `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`;

    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      "-headers", headerStr,
      targetUrl,
    ];

    let probeTimeout: any = null;
    let finished = false;

    let child: any;
    try {
      child = spawn("ffprobe", args);
    } catch {
      infoCache.set(targetUrl, { data: defaultData, timestamp: Date.now() });
      return res.json(defaultData);
    }

    let output = "";
    let errorOutput = "";

    const finishProbe = (data: MediaProbeInfo) => {
      if (finished) return;
      finished = true;
      if (probeTimeout) clearTimeout(probeTimeout);
      try {
        child.kill("SIGKILL");
      } catch {}
      infoCache.set(targetUrl, { data, timestamp: Date.now() });
      return res.json(data);
    };

    // Attach child error handler to PREVENT uncaught exceptions on spawn error!
    child.on("error", (err: any) => {
      console.warn("[ffprobe spawn error]:", err);
      finishProbe(defaultData);
    });

    probeTimeout = setTimeout(() => {
      finishProbe(defaultData);
    }, 5000);

    child.stdout.on("data", (d: any) => {
      output += d.toString();
    });

    child.stderr.on("data", (d: any) => {
      errorOutput += d.toString();
    });

    child.on("close", (code: number) => {
      if (code !== 0 || !output) {
        console.warn("[ffprobe exit code]:", code, errorOutput.slice(0, 200));
        return finishProbe(defaultData);
      }

      try {
        const meta = JSON.parse(output);
        const videoStream = meta.streams?.find((s: any) => s.codec_type === "video");
        const audioStreams = meta.streams?.filter((s: any) => s.codec_type === "audio") || [];
        const subtitleStreams = meta.streams?.filter((s: any) => s.codec_type === "subtitle") || [];

        const formatName = meta.format?.format_name || "";
        const isMkv =
          formatName.includes("matroska") ||
          formatName.includes("webm") ||
          targetUrl.includes(".mkv") ||
          targetUrl.includes("cloudflarestorage");
        const vCodec = (videoStream?.codec_name || "").toLowerCase();
        const duration = parseFloat(meta.format?.duration || "0") || 0;

        const audioTracks = audioStreams.map((s: any, idx: number) => {
          const lang = s.tags?.language || s.tags?.LANGUAGE || "";
          const title = s.tags?.title || s.tags?.TITLE || "";
          let label = title || lang || `Track ${idx + 1}`;
          if (lang.toLowerCase() === "hin") label = "Hindi";
          else if (lang.toLowerCase() === "tel") label = "Telugu";
          else if (lang.toLowerCase() === "tam") label = "Tamil";
          else if (lang.toLowerCase() === "eng") label = "English";
          else if (lang.toLowerCase() === "kan") label = "Kannada";
          else if (lang.toLowerCase() === "mal") label = "Malayalam";
          return {
            id: idx,
            language: label,
            codec: s.codec_name || "aac",
            title: title || label,
          };
        });

        const subtitleTracks = subtitleStreams.map((s: any, idx: number) => {
          const lang = s.tags?.language || s.tags?.LANGUAGE || "";
          const title = s.tags?.title || s.tags?.TITLE || "";
          let label = title || lang || `Sub ${idx + 1}`;
          if (lang.toLowerCase() === "eng") label = "English";
          return {
            id: idx,
            language: label,
            title: title || label,
          };
        });

        // Browser standard <video> cannot decode MKV containers, HEVC (H.265) or AC3 natively
        const needsTranscode =
          isMkv ||
          vCodec.includes("hevc") ||
          vCodec.includes("h265") ||
          audioStreams.some((a: any) =>
            ["ac3", "eac3", "dts", "truehd"].includes((a.codec_name || "").toLowerCase())
          );

        const resultInfo: MediaProbeInfo = {
          duration,
          format: formatName,
          videoCodec: vCodec || "h264",
          width: videoStream?.width || 1280,
          height: videoStream?.height || 720,
          isMkv,
          audioTracks: audioTracks.length > 0 ? audioTracks : [{ id: 0, language: "Stereo", codec: "aac", title: "Audio" }],
          subtitleTracks,
          needsTranscode,
          playable: true,
        };

        return finishProbe(resultInfo);
      } catch (parseErr: any) {
        console.error("[ffprobe parse error]:", parseErr);
        const isMkv = targetUrl.includes(".mkv") || targetUrl.includes("cloudflarestorage");
        return finishProbe({
          duration: 0,
          format: isMkv ? "matroska,webm" : "mp4",
          videoCodec: "h264",
          width: 1280,
          height: 720,
          isMkv,
          audioTracks: [{ id: 0, language: "Stereo", codec: "aac", title: "Audio" }],
          subtitleTracks: [],
          needsTranscode: false,
          playable: true,
        });
      }
    });

    child.on("error", (err) => {
      console.warn("[ffprobe error]:", err);
      const isMkv = targetUrl.includes(".mkv") || targetUrl.includes("cloudflarestorage");
      return finishProbe({
        duration: 0,
        format: isMkv ? "matroska,webm" : "mp4",
        videoCodec: "h264",
        width: 1280,
        height: 720,
        isMkv,
        audioTracks: [{ id: 0, language: "Stereo", codec: "aac", title: "Audio" }],
        subtitleTracks: [],
        needsTranscode: false,
        playable: true,
      });
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Parse raw WebVTT content into structured time-coded cues
 */
function parseWebVTT(vttText: string): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  if (!vttText || typeof vttText !== "string") return cues;
  const lines = vttText.split(/\r?\n/);
  let i = 0;
  const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/;

  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(timeRegex);
    if (match) {
      const h1 = parseInt(match[1] || "0", 10);
      const m1 = parseInt(match[2], 10);
      const s1 = parseInt(match[3], 10);
      const ms1 = parseInt(match[4], 10);
      const start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;

      const h2 = parseInt(match[5] || "0", 10);
      const m2 = parseInt(match[6], 10);
      const s2 = parseInt(match[7], 10);
      const ms2 = parseInt(match[8], 10);
      const end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;

      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].trim());
        i++;
      }
      cues.push({ start, end, text: textLines.join("\n") });
    } else {
      i++;
    }
  }
  return cues;
}

const subtitleCuesCache = new Map<string, { cues: Array<{ start: number; end: number; text: string }>; timestamp: number }>();

/**
 * 4. Subtitle extraction endpoint (Returns parsed JSON cues for in-player HD overlay)
 */
nativePlayerRouter.get(["/api/native-player/subtitles", "/native-player/subtitles"], async (req, res) => {
  try {
    const rawTarget = (req.query.url as string || "").trim();
    if (!rawTarget || !rawTarget.startsWith("http")) {
      return res.status(400).json({ error: "Invalid stream URL", cues: [] });
    }
    const targetUrl = normalizePixeldrainUrl(rawTarget) || rawTarget;

    const hasFFmpeg = await checkFFmpegAvailable();
    if (!hasFFmpeg) {
      return res.json({ ok: true, cues: [] });
    }

    const subIdx = parseInt((req.query.sub as string) || "0", 10) || 0;
    const cacheKey = `${targetUrl}_sub_${subIdx}`;
    const cached = subtitleCuesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return res.json({ ok: true, cues: cached.cues });
    }

    let referer = "";
    if (targetUrl.includes("hbplay.pages.dev")) {
      referer = "https://hbplay.pages.dev/";
    }

    const subHeaders = referer
      ? `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`
      : `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`;

    const ffmpegArgs: string[] = [
      "-headers",
      subHeaders,
      "-i", targetUrl,
      "-vn", "-an",
      "-map", `0:s:${subIdx}`,
      "-f", "webvtt",
      "pipe:1"
    ];

    let child: any;
    try {
      child = spawn("ffmpeg", ffmpegArgs, {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return res.json({ ok: false, cues: [] });
    }

    let vttText = "";
    child.stdout.on("data", (chunk: any) => {
      vttText += chunk.toString();
    });

    child.on("close", () => {
      const cues = parseWebVTT(vttText);
      subtitleCuesCache.set(cacheKey, { cues, timestamp: Date.now() });
      return res.json({ ok: true, cues });
    });

    child.on("error", (err: any) => {
      console.warn("[FFmpeg subtitle extraction error]:", err);
      return res.json({ ok: false, cues: [] });
    });

    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 20000);
  } catch (err: any) {
    return res.status(500).json({ error: err.message, cues: [] });
  }
});

/**
 * Fallback raw WebVTT stream endpoint
 */
nativePlayerRouter.get(["/api/native-player/subtitle", "/native-player/subtitle"], async (req, res) => {
  try {
    const rawTarget = (req.query.url as string || "").trim();
    if (!rawTarget || !rawTarget.startsWith("http")) {
      return res.status(400).send("Invalid stream URL");
    }
    const targetUrl = normalizePixeldrainUrl(rawTarget) || rawTarget;

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");

    const hasFFmpeg = await checkFFmpegAvailable();
    if (!hasFFmpeg) {
      return res.send("WEBVTT\n\n");
    }

    const subIdx = parseInt((req.query.sub as string) || "0", 10) || 0;
    const ss = parseFloat((req.query.ss as string) || "0") || 0;

    let referer = "";
    if (targetUrl.includes("hbplay.pages.dev")) {
      referer = "https://hbplay.pages.dev/";
    }

    const subHeaders = referer
      ? `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`
      : `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`;

    const ffmpegArgs: string[] = [
      "-headers",
      subHeaders,
    ];

    if (ss > 0) {
      ffmpegArgs.push("-ss", String(ss));
    }

    ffmpegArgs.push(
      "-i", targetUrl,
      "-vn", "-an",
      "-map", `0:s:${subIdx}`,
      "-f", "webvtt",
      "pipe:1"
    );

    let child: any;
    try {
      child = spawn("ffmpeg", ffmpegArgs, {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return res.send("WEBVTT\n\n");
    }

    child.stdout.pipe(res);

    req.on("close", () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    });

    child.on("error", () => {
      if (!res.headersSent) res.send("WEBVTT\n\n");
    });
  } catch (err: any) {
    if (!res.headersSent) res.status(500).send("Subtitle error");
  }
});

/**
 * Helper to stream media directly via HTTP byte ranges (supports instant seek, 0 CPU overhead)
 */
async function streamViaProxy(rawTargetUrl: string, req: express.Request, res: express.Response) {
  try {
    let targetUrl = normalizePixeldrainUrl(rawTargetUrl) || rawTargetUrl;

    let referer = "";
    if (targetUrl.includes("hbplay.pages.dev")) {
      referer = "https://hbplay.pages.dev/";
    }

    const forwardHeaders: Record<string, string> = {
      "User-Agent":
        (req.headers["user-agent"] as string) ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": (req.headers.accept as string) || "*/*",
    };
    if (referer) {
      forwardHeaders["Referer"] = referer;
    }

    if (req.headers.range) {
      forwardHeaders["Range"] = req.headers.range as string;
    }

    let upstreamRes: Response | null = null;
    let fetchError: any = null;

    try {
      upstreamRes = await fetch(targetUrl, {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers: forwardHeaders,
      });
    } catch (err: any) {
      fetchError = err;
    }

    // If Pixeldrain request failed or gave an error (status >= 400), try the alternate domain (.dev <-> .com)
    if (!upstreamRes || upstreamRes.status >= 400) {
      let alternateUrl = "";
      if (targetUrl.includes("pixeldrain.dev")) {
        alternateUrl = targetUrl.replace("pixeldrain.dev", "pixeldrain.com");
      } else if (targetUrl.includes("pixeldrain.com")) {
        alternateUrl = targetUrl.replace("pixeldrain.com", "pixeldrain.dev");
      }

      if (alternateUrl && alternateUrl !== targetUrl) {
        try {
          const altRes = await fetch(alternateUrl, {
            method: req.method === "HEAD" ? "HEAD" : "GET",
            headers: forwardHeaders,
          });
          if (altRes && (altRes.ok || altRes.status === 206)) {
            upstreamRes = altRes;
            targetUrl = alternateUrl;
          }
        } catch {}
      }
    }

    // If upstream returned 403 or 401 with referer, retry without referer
    if (upstreamRes && (upstreamRes.status === 403 || upstreamRes.status === 401) && forwardHeaders["Referer"]) {
      delete forwardHeaders["Referer"];
      try {
        upstreamRes = await fetch(targetUrl, {
          method: req.method === "HEAD" ? "HEAD" : "GET",
          headers: forwardHeaders,
        });
      } catch {}
    }

    if (!upstreamRes) {
      console.warn("[NativePlayer Stream Proxy fetch failed]:", fetchError);
      if (!res.headersSent) {
        return res.status(502).send("Upstream video streaming error");
      }
      return;
    }

    res.status(upstreamRes.status);

    const forwardHeaderKeys = [
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "last-modified",
      "etag",
    ];

    for (const h of forwardHeaderKeys) {
      const val = upstreamRes.headers.get(h);
      if (val) {
        res.setHeader(h, val);
      }
    }

    const upstreamType = upstreamRes.headers.get("content-type") || "";
    const isMatroska = upstreamType.includes("matroska") || upstreamType.includes("octet-stream");
    res.setHeader("Content-Type", !isMatroska && upstreamType.startsWith("video/") ? upstreamType : "video/mp4");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type"
    );

    if (!upstreamRes.body || req.method === "HEAD") {
      return res.end();
    }

    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    nodeStream.on("error", (err) => {
      console.warn("[NativePlayer Stream pipe error]:", err);
      if (!res.writableEnded) {
        try { res.end(); } catch {}
      }
    });

    res.on("close", () => {
      try { nodeStream.destroy(); } catch {}
    });

    nodeStream.pipe(res);
  } catch (err: any) {
    console.error("[NativePlayer Stream Proxy Error]:", err);
    if (!res.headersSent) {
      res.status(502).send("Upstream video streaming error");
    }
  }
}

/**
 * 5. Media Stream Engine (Universal MKV/HEVC/AC3 Transcode + Direct Byte-Range Proxy)
 */
nativePlayerRouter.options(
  [
    "/api/native-player/stream",
    "/native-player/stream",
    "/api/native-player/proxy",
    "/native-player/proxy",
  ],
  (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.sendStatus(204);
  }
);

nativePlayerRouter.all(
  [
    "/api/native-player/stream",
    "/native-player/stream",
    "/api/native-player/proxy",
    "/native-player/proxy",
  ],
  async (req, res) => {
    try {
      const rawTargetUrl = (req.query.url as string || "").trim();
      if (!rawTargetUrl || !rawTargetUrl.startsWith("http")) {
        return res.status(400).send("Invalid stream URL");
      }
      const targetUrl = normalizePixeldrainUrl(rawTargetUrl) || rawTargetUrl;

      const mode = (req.query.mode as string || "proxy").toLowerCase();
      const ss = parseFloat((req.query.ss as string) || "0") || 0;
      const audioIdx = parseInt((req.query.audio as string) || "0", 10) || 0;

      const cachedProbe = infoCache.get(targetUrl)?.data;
      const isPixeldrain =
        targetUrl.toLowerCase().includes("pixeldrain") ||
        targetUrl.toLowerCase().includes("pixel.drain") ||
        targetUrl.toLowerCase().includes("pixeldra.in");

      const isMkvTarget =
        isPixeldrain ||
        targetUrl.toLowerCase().includes(".mkv") ||
        targetUrl.toLowerCase().includes("matroska") ||
        Boolean(cachedProbe?.isMkv) ||
        Boolean(cachedProbe?.needsTranscode) ||
        cachedProbe?.videoCodec === "hevc" ||
        cachedProbe?.videoCodec === "h265" ||
        cachedProbe?.format?.includes("matroska");

      // Handle HEAD requests immediately for browser pre-flight checks
      if (req.method === "HEAD") {
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "*");
        return res.status(200).end();
      }

      // Check whether FFmpeg is available on the hosting environment (Vercel has no ffmpeg)
      const hasFFmpeg = await checkFFmpegAvailable();

      // If FFmpeg is NOT available (e.g. Vercel runtime), ALWAYS stream cleanly via proxy
      if (!hasFFmpeg) {
        return streamViaProxy(targetUrl, req, res);
      }

      // If mode is explicitly raw, stream directly via byte-range proxy
      if (mode === "raw") {
        return streamViaProxy(targetUrl, req, res);
      }

      // If mode is proxy and target is NOT an MKV link and doesn't need transcoding, stream directly via byte-range proxy
      if (mode === "proxy" && !isMkvTarget && audioIdx === 0 && ss === 0) {
        return streamViaProxy(targetUrl, req, res);
      }

      // Activate FFmpeg Universal Remux/Transcode Engine if mode=transcode or isMkvTarget or audio/seek specified
      if (mode === "transcode" || isMkvTarget || audioIdx > 0 || ss > 0) {
        let headersSentOrPiping = false;

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "*");
        res.setHeader("Accept-Ranges", "none");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Cache-Control", "no-cache, no-store");

        let referer = "";
        if (targetUrl.includes("hbplay.pages.dev")) {
          referer = "Referer: https://hbplay.pages.dev/\r\n";
        }

        const ffmpegArgs: string[] = [
          "-headers",
          `${referer}User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`,
        ];

        // Instant seeking support with fast input seek
        if (ss > 0) {
          ffmpegArgs.push("-noaccurate_seek", "-ss", String(ss));
        }

        ffmpegArgs.push("-i", targetUrl);

        // Map video and specified audio stream
        ffmpegArgs.push(
          "-map", "0:v:0",
          "-map", `0:a:${audioIdx}?`
        );

        // Check cached probe info to see if video and audio can be fast-copied (0 CPU, 0 buffering!)
        const cachedProbe = infoCache.get(targetUrl)?.data;
        const videoIsH264 = cachedProbe
          ? (cachedProbe.videoCodec?.includes("h264") || cachedProbe.videoCodec?.includes("avc"))
          : !isPixeldrain && !targetUrl.toLowerCase().includes("hevc") && !targetUrl.toLowerCase().includes("h265");
        const selectedAudio = cachedProbe?.audioTracks?.find((a: any) => a.id === audioIdx);
        const audioIsAac = (selectedAudio?.codec || "").toLowerCase().includes("aac");

        if (videoIsH264) {
          ffmpegArgs.push("-c:v", "copy");
        } else {
          ffmpegArgs.push(
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-threads", "0",
            "-g", "48",
            "-keyint_min", "24",
            "-crf", "23",
            "-pix_fmt", "yuv420p"
          );
        }

        if (audioIsAac) {
          ffmpegArgs.push("-c:a", "copy");
        } else {
          ffmpegArgs.push(
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2"
          );
        }

        ffmpegArgs.push(
          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-flush_packets", "1",
          "-f", "mp4",
          "pipe:1"
        );

        let child: any;
        try {
          child = spawn("ffmpeg", ffmpegArgs, {
            stdio: ["ignore", "pipe", "ignore"],
          });
        } catch (spawnErr) {
          console.warn("[FFmpeg spawn failed, falling back to proxy]:", spawnErr);
          return streamViaProxy(targetUrl, req, res);
        }

        child.stdout.on("data", () => {
          headersSentOrPiping = true;
        });

        child.stdout.pipe(res);

        req.on("close", () => {
          try {
            child.kill("SIGKILL");
          } catch {}
        });

        child.on("error", (err: any) => {
          console.warn("[FFmpeg transcode stream error, falling back to proxy]:", err);
          if (!headersSentOrPiping && !res.headersSent) {
            return streamViaProxy(targetUrl, req, res);
          } else if (!res.writableEnded) {
            res.end();
          }
        });

        child.on("close", (code: number) => {
          if (code !== 0 && !headersSentOrPiping && !res.headersSent) {
            console.warn("[FFmpeg exited with non-zero before piping, falling back to proxy]:", code);
            return streamViaProxy(targetUrl, req, res);
          }
        });
        return;
      }

      // Default fallback: direct stream via proxy
      return streamViaProxy(targetUrl, req, res);
    } catch (err: any) {
      console.error("[NativePlayer Stream Route Error]:", err);
      if (!res.headersSent) {
        res.status(502).send("Upstream video streaming error");
      }
    }
  }
);

/**
 * 6. Embeddable masked Native Player HTML view
 */
nativePlayerRouter.get(["/api/native-player/embed/:contentId", "/native-player/embed/:contentId"], async (req, res) => {
  try {
    const { contentId } = req.params;
    const watchUrl = (req.query.watch as string || "").trim();
    const parsed = parseWatchUrl(watchUrl);
    const streamUrl = parsed.streamUrl || "";
    const title = parsed.title || (req.query.title as string) || "MovizNow Video";
    const resumeTime = parseFloat((req.query.t as string) || "0") || 0;
    const initialSpeed = parseFloat((req.query.speed as string) || "1") || 1;

    // Return custom player HTML page
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <title>${title} - MovizNow Player</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body, html { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
            .player-container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            video, iframe { width: 100%; height: 100%; border: none; object-fit: contain; }
          </style>
        </head>
        <body>
          <div class="player-container">
            ${
              streamUrl
                ? `<video id="video" src="/api/native-player/stream?url=${encodeURIComponent(streamUrl)}" controls autoplay playsinline></video>`
                : `<iframe id="frame" src="${watchUrl}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`
            }
          </div>
          <script>
            (function() {
              var contentId = ${JSON.stringify(contentId)};
              var storageKey = "moviznow_progress_" + contentId;
              var resumeTime = ${resumeTime};
              var initialSpeed = ${initialSpeed};

              var video = document.getElementById("video");
              if (video) {
                if (initialSpeed >= 0.25 && initialSpeed <= 4) {
                  video.playbackRate = initialSpeed;
                  video.defaultPlaybackRate = initialSpeed;
                }
                var saved = resumeTime > 5 ? resumeTime : parseFloat(localStorage.getItem(storageKey) || "0");
                if (saved > 5) {
                  video.addEventListener("loadedmetadata", function() {
                    try { video.currentTime = saved; } catch(e) {}
                  }, { once: true });
                }
                video.addEventListener("timeupdate", function() {
                  if (video.currentTime > 2) {
                    try { localStorage.setItem(storageKey, String(Math.floor(video.currentTime))); } catch(e) {}
                    if (window.parent && window.parent !== window) {
                      window.parent.postMessage({
                        type: "MOVIZNOW_PLAYBACK_PROGRESS",
                        contentId: contentId,
                        currentTime: video.currentTime,
                        duration: video.duration || 0
                      }, "*");
                    }
                  }
                });
              }
            })();
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    return res.status(500).send("Error rendering player");
  }
});
