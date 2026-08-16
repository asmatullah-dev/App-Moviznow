import { GoogleGenAI } from "@google/genai";
import express from "express";

export const translateRouter = express.Router();

translateRouter.post("/translate", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      return res.status(400).json({ error: "Missing text or targetLanguage" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    
    // Support JSON array for batch translation to preserve structure
    const isArray = Array.isArray(text);
    
    const targetLang = targetLanguage.toLowerCase();
    const isRoman = targetLang.includes("roman");
    
    let prompt;
    if (isArray) {
      prompt = `Translate the following JSON array of strings to ${targetLanguage}. 
      ${isRoman ? "IMPORTANT: Use Roman Urdu (Urdu language written using the Latin/English alphabet). Example: 'Welcome' -> 'Khushamdeed', 'Episode' -> 'Qist'. Do NOT return the original English text if a translation exists." : ""}
      Keep the exact same JSON array structure, length, and order. Provide ONLY the raw valid JSON array as output without markdown formatting or conversational filler.\n\nJSON array to translate:\n${JSON.stringify(text)}`;
    } else {
      prompt = `Translate the following text to ${targetLanguage}. 
      ${isRoman ? "IMPORTANT: Use Roman Urdu (Urdu language written using the Latin/English alphabet). Example: 'Welcome' -> 'Khushamdeed', 'Episode' -> 'Qist'. Do NOT return the original English text if a translation exists." : ""}
      Provide ONLY the translation without any conversational filler, markdown formatting, or surrounding quotes.\n\nText to translate:\n${text}`;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt
    });

    let result = response.text || "";
    
    if (isArray) {
      try {
        result = result.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(result);
        return res.json({ translation: parsed });
      } catch (e) {
        console.error("Failed to parse array translation output:", result);
        return res.status(500).json({ error: "Failed to parse JSON response from AI" });
      }
    }

    res.json({ translation: result });
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

translateRouter.post("/predict-ott", async (req, res) => {
  try {
    const { title, originalTitle, type, year, country, language, overview, genres } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Missing title" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `You are an expert global and regional movie & TV streaming distribution database.
Identify the official OTT/streaming platform or primary network distributor for this ${type === 'tv' ? 'Series' : 'Movie'}:
Title: "${title}"
${originalTitle ? `Original Title: "${originalTitle}"` : ''}
Year: ${year || 'Recent / Upcoming'}
${country ? `Country of Origin: ${country}` : ''}
${language ? `Original Language: ${language}` : ''}
${genres && genres.length > 0 ? `Genres: ${Array.isArray(genres) ? genres.join(', ') : genres}` : ''}
${overview ? `Synopsis: ${overview.slice(0, 300)}` : ''}

Rules:
1. Identify the primary official streaming service where this content is released or announced to release.
2. Choose from major global and regional platforms such as:
- Netflix
- Amazon Prime
- Disney+
- Hotstar
- Apple TV+
- HBO Max
- Hulu
- Paramount+
- Peacock
- JioCinema
- Zee5
- SonyLIV
- Lionsgate Play
- Rakuten Viki
- Crunchyroll
- Aha
- Hoichoi
- Sun NXT
- MX Player
- ShemarooMe
- Chaupal

3. Infer based on studios/networks if exact OTT is not explicitly stated:
- Marvel Studios, Pixar, Disney Animation, Star Wars -> Disney+ / Hotstar
- HBO, Warner Bros., Max Originals -> HBO Max / JioCinema
- Netflix Originals / Co-productions -> Netflix
- Amazon MGM, Prime Video Originals -> Amazon Prime
- Apple Studios / Apple Originals -> Apple TV+
- Paramount / Showtime -> Paramount+
- Universal Pictures -> Peacock / Netflix / Amazon Prime

Respond with ONLY the exact name of the streaming platform. If you cannot determine with confidence, respond with "Unknown". No explanations, markdown, or surrounding quotes.`;

    const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash"];
    let platform = "";
    let isRateLimited = false;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt
        });
        platform = (response.text || "").trim().replace(/[".]/g, "");
        if (platform) break;
      } catch (err: any) {
        const errStr = String(err?.message || err || "");
        if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
          isRateLimited = true;
          continue;
        }
        break;
      }
    }

    if (platform.toLowerCase().includes("unknown") || platform.length > 30) {
      platform = "";
    }

    if (!platform && isRateLimited) {
      return res.status(429).json({ platform: null, rateLimited: true });
    }

    res.json({ platform: platform || null });
  } catch (error: any) {
    res.status(200).json({ platform: null });
  }
});

