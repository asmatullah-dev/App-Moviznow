import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf-8');

// remove old app.use("/api", translateRouter)
content = content.replace('app.use("/api", translateRouter);', '');

// add directly inside startServer
const directRoute = `
  import translate from "google-translate-api-x";
  import { UrduMagic } from "urdumagic";
  const magic = UrduMagic.init({ defaultLang: "en", modes: ["en", "ur", "roman"], showSwitcher: false, strategy: 'offline' });

  app.post("/api/translate", async (req, res) => {
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
        try {
          const results = await translate(text, { to: targetGoogleLang });
          const translatedArray = results.map((result) => {
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
        try {
          const result = await translate(text, { to: targetGoogleLang });
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
    } catch (error) {
      console.error("Translation error:", error);
      res.status(500).json({ error: "Translation failed" });
    }
  });
`;

content = content.replace('app.use(linkExtractionRouter);', 'app.use(linkExtractionRouter);\\n' + directRoute);

fs.writeFileSync('api/index.ts', content);
