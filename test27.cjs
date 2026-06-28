const axios = require('axios');
const cheerio = require('cheerio');
axios.get("https://api.microlink.io?url=https://hubcloud.foo/drive/irrpsfrrf0sfsar&meta=false&data.html.selector=body").then(res => {
   const text = res.data.data.html;
   const $ = cheerio.load(text);
   let tgFileUrl = "";
   let tgGoUrlDirect = "";
   $('a').each((_, el) => {
         const href = $(el).attr('href');
         if (href && href.includes('tg/go')) {
            tgGoUrlDirect = href;
         } else if (href && (href.includes('hubcloud.php') || href.includes('link-generated'))) {
            tgFileUrl = href;
         }
   });
   console.log("tgFileUrl", tgFileUrl);
}).catch(e => console.error(e.response ? e.response.data : e.message));
