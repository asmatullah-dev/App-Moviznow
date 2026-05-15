import axios from 'axios';
import * as cheerio from 'cheerio';

(async () => {
  const url = 'https://hubcloud.foo/drive/oa3syo3sadwbjy1';
  try {
      const response = await axios.get(url, { validateStatus: () => true });
      const $ = cheerio.load(response.data);
      
      let nextUrl = $('#download').attr('href') || $('a:contains("Generate Direct Download Link")').attr('href') || $('a.btn-zip').attr('href');
      
      if (!nextUrl) {
         console.log('No next url');
         return;
      }

      const res2 = await axios.get(nextUrl, { validateStatus: () => true });
      const $2 = cheerio.load(res2.data);
      
      const candidateLinks: {text: string, href: string}[] = [];
      $2('a.btn').each((i, el) => {
         const href = $2(el).attr('href');
         const text = $2(el).text().toLowerCase();
         if (href && !text.includes('telegram')) candidateLinks.push({ text, href });
      });
      console.log('Candidates btn', candidateLinks);
  } catch(e) {
      console.log('Error', e.message);
  }
})();
