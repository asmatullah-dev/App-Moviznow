import axios from 'axios';
async function test() {
  try {
    const res = await axios.post('http://localhost:3000/api/check-link', { url: "https://google.com" });
    console.log(res.data);
  } catch(e: any) {
    console.error(e.message);
  }
}
test();
