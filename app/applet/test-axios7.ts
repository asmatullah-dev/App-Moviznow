import axios from 'axios';
import * as cheerio from 'cheerio';

(async () => {
  const url = 'https://hubcloud.foo/drive/oa3syo3sadwbjy1';
  try {
      const response = await axios.get(url, { validateStatus: () => true });
      const $ = cheerio.load(response.data);
      
      let nextUrl = $('#download').attr('href') || $('a:contains("Generate Direct Download Link")').attr('href') || $('a.btn-zip').attr('href');
      console.log('NextUrl 1:', nextUrl);
      
      if (!nextUrl) {
         console.log('No next url');
         return;
      }

      const res2 = await axios.get(nextUrl, { validateStatus: () => true });
      const $2 = cheerio.load(res2.data);
      
      let downloadUrl = $2('.btn-success').first().attr('href') || $2('a:contains("Download File")').first().attr('href');
      console.log('DownloadUrl:', downloadUrl);
      
      const candidateLinks: {text: string, href: string}[] = [];
      $2('a').each((_, elem) => {
        const href = $2(elem).attr('href');
        const text = $2(elem).text();
        if (href && (href.startsWith('http') || href.startsWith('//'))) {
           candidateLinks.push({text, href});
        }
      });
      console.log('Candidates', candidateLinks);
  } catch(e) {
      console.log('Error', e.message);
  }
})();
