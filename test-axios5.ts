import axios from 'axios';
(async () => {
  try {
      const res = await axios.get('https://cdn.primevideos.workers.dev/eeb2316f27e45390e6ced8aa78131f23611d3d7629f6be7249c31c7cd5bf6cd75ffb4958faa012aa48968b1760b787b0::d3b04dc0c96a53abf08afe4f396a8983/1397975535/Baby.Driver.2017.Hindi.Dual.Audio.1080p.BluRay.moviesdrives.com.mkv', { headers: { Range: 'bytes=0-0' }, maxRedirects: 0, validateStatus: () => true });
      console.log('Success', res.status, res.headers.location);
  } catch(e) {
      console.log('Error', e.message, e.response?.status);
  }
})();
