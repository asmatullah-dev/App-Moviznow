import { UrduMagic } from 'urdumagic';
const magic = UrduMagic.init({ defaultLang: "en", modes: ["en", "ur", "roman"], showSwitcher: false, strategy: 'offline' });
magic.translate('Apple', 'ur').then(console.log);
magic.translate('Apple', 'roman').then(console.log);
