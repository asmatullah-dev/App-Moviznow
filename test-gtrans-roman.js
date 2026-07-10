import translate from 'google-translate-api-x';
import { UrduMagic } from 'urdumagic';
const magic = UrduMagic.init({ defaultLang: "en", modes: ["en", "ur", "roman"], showSwitcher: false, strategy: 'offline' });

translate('A deaf and mute serial killer in Mumbai can only hear his beautiful sister\'s voice as he commits murders for mysterious reasons.', {to: 'ur'}).then(res => {
  console.log("Urdu:", res.text);
  console.log("Roman:", magic.toRoman(res.text));
}).catch(console.error);
