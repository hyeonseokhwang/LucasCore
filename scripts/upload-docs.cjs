const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'G:/Lucas-Initiative/LucasCore';

function findMdFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const skip = ['node_modules', 'target', '.git'];
    if (e.isDirectory() && !skip.includes(e.name)) {
      findMdFiles(full, files);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function post(body) {
  return new Promise((resolve) => {
    const b = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 9000,
      path: '/api/documents', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d.substring(0, 80) }));
    });
    req.on('error', e => resolve({ status: 0, body: e.code }));
    req.end(b);
  });
}

async function main() {
  const files = findMdFiles(BASE);
  console.log('Found:', files.length, 'MD files');
  let ok = 0, fail = 0;
  const failures = [];

  for (const f of files) {
    const filename = path.basename(f);
    let content;
    try {
      content = fs.readFileSync(f, 'utf8');
    } catch (e) {
      failures.push(filename + ': read error');
      fail++;
      continue;
    }
    const isDoc = f.includes('/docs/') || f.includes('\\docs\\');
    const isReport = f.includes('/data/task-reports/') || f.includes('\\data\\task-reports\\') ||
                     f.includes('/data/directives/') || f.includes('\\data\\directives\\');
    const docType = isReport ? 'report' : 'note';
    const title = '[LucasCore] ' + filename.replace(/\.md$/, '').replace(/-/g, ' ');

    const r = await post({
      agentId: 'dev-1',
      docType,
      filename,
      title,
      content,
      contentType: 'text/markdown',
      tags: JSON.stringify(['lucascore', 'branch', 'upload'])
    });

    if (r.status === 200 || r.status === 201) {
      ok++;
      if (ok % 10 === 0) process.stdout.write(ok + '/' + files.length + '\n');
      else process.stdout.write('.');
    } else {
      fail++;
      failures.push(filename + ': HTTP ' + r.status + ' ' + r.body);
      process.stdout.write('F');
    }
  }

  console.log('\nDone: ok=' + ok + ' fail=' + fail);
  if (failures.length) console.log('Failures:', failures.join('\n'));
}

main().catch(console.error);
