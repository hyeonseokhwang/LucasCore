const b = JSON.stringify({
  author: 'branch-ceo',
  body: '지사 시저입니다. 본사 미팅 연결 완료. 지사 6명 전원 active 상태입니다.',
  targets: ['lucas','coo','cto','inspector']
});
require('http').request({
  hostname:'localhost', port:9000,
  path:'/api/meetings/mtg-1780195037159/speak',
  method:'POST',
  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}
}, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => console.log(r.statusCode, d.substring(0, 80)));
}).end(b);
