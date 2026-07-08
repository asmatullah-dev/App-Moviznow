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

    const ai = new GoogleGenAI({ apiKey });
    
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
      model: "gemini-1.5-flash",
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

export default translateRouter;
