const axios = require('axios');
axios.get("https://api.microlink.io?url=https://hubcloud.foo/drive/irrpsfrrf0sfsar&meta=false&data.html.selector=body").then(res => {
   const text = res.data.data.html;
   const tgGoMatch = text.match(/href=["'](https?:\/\/[^"']+\/tg\/go[^"']*)["']/i);
   console.log("tgGoMatch:", tgGoMatch ? tgGoMatch[1] : null);
   const telegramMatch = text.match(/href=["'](tg:\/\/[^"']+)["']/i) || text.match(/href=["'](https?:\/\/(t\.me|telegram\.me)[^"']+)["']/i);
   console.log("telegramMatch:", telegramMatch ? telegramMatch[1] : null);
}).catch(e => console.error(e.response ? e.response.data : e.message));
