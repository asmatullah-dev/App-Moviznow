import express from "express";
import translate from "google-translate-api-x";
import { UrduMagic } from "urdumagic";

export const translateRouter = express.Router();
const magic = UrduMagic.init({ defaultLang: "en", modes: ["en", "ur", "roman"], showSwitcher: false, strategy: 'offline' });

translateRouter.post("/translate", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: "Missing text or targetLanguage" });
    }

    const isArray = Array.isArray(text);
    const targetLang = targetLanguage.toLowerCase();
    const isRoman = targetLang.includes("roman");
    const targetGoogleLang = isRoman ? "ur" : (targetLang.includes("urdu") ? "ur" : "en"); // fallback to english or default

    if (isArray) {
      // Translate batch
      try {
        const results = await translate(text as string[], { to: targetGoogleLang });
        const translatedArray = results.map((result: any) => {
          let t = result.text;
          if (isRoman) {
            t = magic.toRoman(t);
          }
          return t;
        });
        return res.json({ translation: translatedArray });
      } catch (e) {
        console.error("Batch translation failed:", e);
        return res.status(500).json({ error: "Batch translation failed" });
      }
    } else {
      // Translate single text
      try {
        const result = await translate(text as string, { to: targetGoogleLang });
        let t = result.text;
        if (isRoman) {
          t = magic.toRoman(t);
        }
        return res.json({ translation: t });
      } catch (e) {
        console.error("Single translation failed:", e);
        return res.status(500).json({ error: "Single translation failed" });
      }
    }

  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});
