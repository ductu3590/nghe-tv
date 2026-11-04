// Desktop preview of app/ on 127.0.0.1 (loopback only). Browsers block cross-site feeds (CORS), so the preview
// adds /proxy?url=… that forwards GET (and Range, for seeking audio) to hosts listed in app/sources.json only.
// The TV never uses this proxy: on the TV the app calls every source directly.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');

const root = path.resolve(__dirname, '../app');
const port = /^[0-9]{4,5}$/.test(process.env.PORT || '') ? Number(process.env.PORT) : 4190;
const allowedName = /^[a-z][a-z0-9-]*\.(html|css|js|png|json)$/;
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json'};

function allowedHosts() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8')).hosts || []; } catch (error) { return []; }
}
function hostAllowed(host, hosts) {
  return hosts.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}
// Exported for tests: is this URL one the preview proxy may fetch?
function proxyTarget(raw, hosts) {
  let url;
  try { url = new URL(raw); } catch (error) { return null; }
  if (url.protocol !== 'https:' || !hostAllowed(url.hostname, hosts)) return null;
  return url;
}

// Corporate or sandbox networks: tunnel through HTTPS_PROXY when it is set (Node does not do this by itself).
function proxyAgent() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return undefined;
  const proxy = new URL(raw);
  const agent = new https.Agent({keepAlive: false});
  agent.createConnection = (options, callback) => {
    const target = options.host + ':' + (options.port || 443);
    const request = http.request({host: proxy.hostname, port: proxy.port || 80, method: 'CONNECT', path: target, headers: {host: target}});
    request.on('connect', (response, socket) => {
      if (response.statusCode !== 200) { socket.destroy(); callback(new Error('proxy CONNECT ' + response.statusCode)); return; }
      callback(null, tls.connect({socket, servername: options.servername || options.host}));
    });
    request.on('error', callback);
    request.end();
  };
  return agent;
}
const agent = proxyAgent();

function forward(target, req, res, hops) {
  const headers = {'User-Agent': 'Mozilla/5.0 (nghe-tv desktop preview)', Accept: '*/*'};
  if (req.headers.range) headers.Range = req.headers.range;
  https.get(target, {headers, agent}, (upstream) => {
    if ([301, 302, 303, 307, 308].includes(upstream.statusCode) && upstream.headers.location && hops < 5) {
      upstream.resume();
      // Audio CDNs redirect to storage hosts; follow https redirects only.
      const next = new URL(upstream.headers.location, target);
      if (next.protocol !== 'https:') { res.writeHead(502); res.end('Non-https redirect'); return; }
      forward(next, req, res, hops + 1);
      return;
    }
    const out = {'Cache-Control': 'no-store'};
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (upstream.headers[name]) out[name] = upstream.headers[name];
    }
    res.writeHead(upstream.statusCode || 502, out);
    upstream.pipe(res);
  }).on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Upstream error'); });
}

if (require.main === module) {
  http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    if (requestUrl.pathname === '/proxy') {
      const target = proxyTarget(requestUrl.searchParams.get('url') || '', allowedHosts());
      if (!target) { res.writeHead(403); res.end('Host not in app/sources.json hosts'); return; }
      forward(target, req, res, 0);
      return;
    }
    const name = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1);
    if (!allowedName.test(name)) { res.writeHead(404); res.end('Not found'); return; }
    fs.readFile(path.join(root, name), (error, data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-store'}); res.end(data);
    });
  }).listen(port, '127.0.0.1', () => console.log('Nghe preview: http://127.0.0.1:' + port));
}

module.exports = {proxyTarget, hostAllowed};
