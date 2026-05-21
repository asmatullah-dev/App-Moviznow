import axios from 'axios';
import http from 'http';
import https from 'https';

const httpAgent = new http.Agent({ family: 4 });
const httpsAgent = new https.Agent({ family: 4, rejectUnauthorized: false });

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = 8000;

async function run() {
  try {
    const res = await axios.get('https://google.com');
    console.log(res.status);
  } catch (err: any) {
    console.error(err.message);
  }
}
run();
