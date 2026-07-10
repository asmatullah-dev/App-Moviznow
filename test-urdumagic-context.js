import { UrduMagic } from 'urdumagic';
const magic = UrduMagic.init({ defaultLang: "en", modes: ["en", "ur", "roman"], showSwitcher: false, strategy: 'offline' });
magic.translate("He was walking in the park.", "ur").then(console.log);
magic.translate("He was walking in the park.", "roman").then(console.log);
