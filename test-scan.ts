import { performFullLinkScan } from './src/utils/linkScanner.ts';
async function test() {
  const result = await performFullLinkScan('https://hubcloud.foo/drive/mkjjlztkzvcvt3v');
  console.log(result);
}
test();
