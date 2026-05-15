import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get('https://hubcloud.foo/drive/mkjjlztkzvcvt3v');
    const $ = cheerio.load(res.data);
    const sizeText = $('li:contains("File Size") i').text();
    console.log('Size:', sizeText);
    
    let nextUrl = $('#download').attr('href');
    if (!nextUrl) {
      // Sometimes it's a different way
      nextUrl = $('a:contains("Generate Direct Download Link")').attr('href');
    }
    console.log('Next URL:', nextUrl);
    
    if (nextUrl) {
      const res2 = await axios.get(nextUrl);
      console.log('Res2:', res2.data);
    }
  } catch (err: any) {
    console.error(err.message);
  }
}
test();
