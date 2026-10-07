import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const OPTIONS_FILE = '/data/options.json';
const EXPORT_ROOT = '/data/exports';
const ROOTS = { share: '/ha-share', media: '/ha-media' };
const PORT = 3100;
const SERVER_VERSION = '0.3.0';

const opts = JSON.parse(await fs.readFile(OPTIONS_FILE, 'utf8'));
const TOKEN = String(opts.access_token || '');
const MAX_TEXT_BYTES = Number(opts.max_text_bytes || 2097152);
const MAX_COPY_BYTES = Number(opts.max_copy_bytes || 1073741824);

if (!TOKEN) throw new Error('access_token is required');
await fs.mkdir(EXPORT_ROOT, { recursive: true });

const sources = new Map();

function safeName(v) {
  return typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v);
}
function safeRelative(v) {
  if (typeof v !== 'string' || !v || path.isAbsolute(v)) return false;
  return !v.split(/[\\/]+/).some(p => !p || p === '..');
}
async function realInside(root, rel) {
  if (!safeRelative(rel)) throw new Error('Invalid relative path');
  const base = await fs.realpath(root);
  const target = await fs.realpath(path.join(base, rel));
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (target !== base && !target.startsWith(prefix)) throw new Error('Path escapes allowed source');
  return target;
}
for (const item of Array.isArray(opts.sources) ? opts.sources : []) {
  const name = String(item?.name || '');
  const rootKey = String(item?.root || '');
  const rel = String(item?.path || '');
  if (!safeName(name) || !(rootKey in ROOTS) || !safeRelative(rel)) continue;
  try {
    const abs = await fs.realpath(path.join(ROOTS[rootKey], rel));
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) sources.set(name, { name, rootKey, abs });
  } catch {}
}

function resolveSource(name) {
  const raw = String(name ?? '').trim();
  if (!raw) throw new Error(`source is required; valid sources: ${[...sources.keys()].join(', ')}`);
  if (sources.has(raw)) return sources.get(raw);
  const lower = raw.toLowerCase();
  for (const [key, src] of sources) {
    if (key.toLowerCase() === lower) return src;
  }
  throw new Error(`Unknown source '${raw}'; valid sources: ${[...sources.keys()].join(', ')}`);
}

function json(res, status, body, extra={}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type':'application/json', 'content-length':Buffer.byteLength(data), ...extra });
  res.end(data);
}
function authorized(req) {
  const got = req.headers.authorization || '';
  const expected = 'Bearer ' + TOKEN;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
async function readBody(req) {
  let s='';
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 1024*1024) throw new Error('Request too large');
  }
  return s ? JSON.parse(s) : {};
}
function ok(id, result) { return { jsonrpc:'2.0', id, result }; }
function fail(id, code, message) { return { jsonrpc:'2.0', id, error:{ code, message } }; }
function textResult(obj) {
  return { content:[{ type:'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj,null,2) }] };
}
async function listDir(sourceName, rel='.') {
  const src = resolveSource(sourceName);
  const target = rel === '.' ? src.abs : await realInside(src.abs, rel);
  const rows = [];
  for (const e of await fs.readdir(target,{withFileTypes:true})) {
    const full = path.join(target,e.name);
    const st = await fs.stat(full);
    rows.push({ name:e.name, type:e.isDirectory()?'directory':'file', size:st.size, mtime:st.mtime.toISOString() });
  }
  return rows;
}

async function listAllFiles() {
  const rows = [];
  async function walk(src, dir, relBase='') {
    for (const e of await fs.readdir(dir,{withFileTypes:true})) {
      const full = path.join(dir,e.name);
      const rel = path.join(relBase,e.name);
      if (e.isDirectory()) {
        await walk(src, full, rel);
        continue;
      }
      const st = await fs.stat(full);
      rows.push({
        source: src.name,
        path: rel.split(path.sep).join('/'),
        size: st.size,
        mtime: st.mtime.toISOString()
      });
    }
  }
  for (const src of sources.values()) await walk(src, src.abs);
  rows.sort((a,b) => b.mtime.localeCompare(a.mtime));
  return rows;
}
async function readText(sourceName, rel) {
  const src = resolveSource(sourceName);
  const target = await realInside(src.abs, rel);
  const st = await fs.stat(target);
  if (!st.isFile()) throw new Error('Not a file');
  if (st.size > MAX_TEXT_BYTES) throw new Error('File exceeds max_text_bytes');
  return fs.readFile(target,'utf8');
}
async function searchText(sourceName, query, subdir='.') {
  const q = String(query).toLowerCase();
  if (!q) throw new Error('query is required');
  const hits=[];
  const selected = String(sourceName ?? '').trim() ? [resolveSource(sourceName)] : [...sources.values()];
  async function walk(src, dir, relBase='') {
    for (const e of await fs.readdir(dir,{withFileTypes:true})) {
      const full=path.join(dir,e.name);
      const rel=path.join(relBase,e.name);
      if (e.isDirectory()) { if (hits.length<100) await walk(src,full,rel); continue; }
      const st=await fs.stat(full);
      if (st.size>MAX_TEXT_BYTES) continue;
      try {
        const txt=await fs.readFile(full,'utf8');
        const idx=txt.toLowerCase().indexOf(q);
        if(idx>=0) hits.push({source:src.name,path:rel.split(path.sep).join('/'),index:idx,snippet:txt.slice(Math.max(0,idx-120),idx+q.length+240)});
      } catch {}
      if(hits.length>=100) return;
    }
  }
  for (const src of selected) {
    const start = subdir === '.' ? src.abs : await realInside(src.abs, subdir);
    await walk(src,start);
    if (hits.length>=100) break;
  }
  return hits;
}
async function copyToExport(sourceName, rel, exportName='') {
  const src=resolveSource(sourceName);
  const source=await realInside(src.abs,rel);
  const st=await fs.stat(source);
  if(!st.isFile()) throw new Error('Only files can be copied');
  if(st.size>MAX_COPY_BYTES) throw new Error('File exceeds max_copy_bytes');
  const baseName = exportName ? String(exportName) : path.basename(source);
  if(!safeName(baseName)) throw new Error('Invalid export_name');
  const dir=path.join(EXPORT_ROOT,sourceName);
  await fs.mkdir(dir,{recursive:true});
  const dest=path.join(dir,baseName);
  await fs.copyFile(source,dest);
  return {source:rel,export_path:`${sourceName}/${baseName}`,size:st.size};
}
async function listExports() {
  const out=[];
  async function walk(dir, rel='') {
    for(const e of await fs.readdir(dir,{withFileTypes:true})) {
      const full=path.join(dir,e.name), r=path.join(rel,e.name);
      if(e.isDirectory()) await walk(full,r);
      else { const st=await fs.stat(full); out.push({path:r,size:st.size,mtime:st.mtime.toISOString()}); }
    }
  }
  await walk(EXPORT_ROOT);
  return out;
}
async function handleTool(name,args={}) {
  switch(name) {
    case 'list_sources': return textResult([...sources.values()].map(s=>({name:s.name,root:s.rootKey,read_only:true})));
    case 'list_files': return textResult(String(args.source ?? '').trim() ? await listDir(args.source,String(args.path||'.')) : await listAllFiles());
    case 'read_text': return textResult(await readText(args.source,args.path));
    case 'search_text': return textResult(await searchText(args.source,args.query,String(args.path||'.')));
    case 'copy_to_export': return textResult(await copyToExport(args.source,args.path,String(args.export_name||'')));
    case 'list_exports': return textResult(await listExports());
    default: throw new Error('Unknown tool');
  }
}
const SOURCE_NAMES = [...sources.keys()];
const sourceSchema = { type:'string', enum: SOURCE_NAMES, description:`Allowed source. Use exactly one of: ${SOURCE_NAMES.join(', ')}` };
const tools=[
  {name:'list_sources',description:'List configured read-only file sources.',inputSchema:{type:'object',properties:{}}},
  {name:'list_files',description:'List files. With no source, recursively returns all files from all allowed sources, newest first. Optionally set source to list one source/directory.',inputSchema:{type:'object',properties:{source:sourceSchema,path:{type:'string'}}}},
  {name:'read_text',description:'Read a UTF-8 text file from an allowed read-only source.',inputSchema:{type:'object',properties:{source:sourceSchema,path:{type:'string'}},required:['source','path']}},
  {name:'search_text',description:'Search text recursively. With no source, searches all allowed sources. Optionally set source to limit the search.',inputSchema:{type:'object',properties:{source:sourceSchema,query:{type:'string'},path:{type:'string'}},required:['query']}},
  {name:'copy_to_export',description:'Copy a file from an allowed read-only source into the MCP private export area. Never modifies the source.',inputSchema:{type:'object',properties:{source:sourceSchema,path:{type:'string'},export_name:{type:'string'}},required:['source','path']}},
  {name:'list_exports',description:'List files previously copied into the private export area.',inputSchema:{type:'object',properties:{}}}
];

const server=http.createServer(async(req,res)=>{
  try {
    if(req.url==='/health') return json(res,200,{ok:true,sources:sources.size});
    if(req.url!=='/mcp') return json(res,404,{error:'not found'});
    if(!authorized(req)) return json(res,401,{error:'unauthorized','www-authenticate':'Bearer'});
    if(req.method!=='POST') return json(res,405,{error:'POST required'});
    const msg=await readBody(req);
    const id=msg.id ?? null;
    if(msg.method==='initialize') return json(res,200,ok(id,{protocolVersion:msg.params?.protocolVersion||'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'ha-readonly-files-mcp',version:SERVER_VERSION}}));
    if(msg.method==='notifications/initialized') return json(res,202,{});
    if(msg.method==='tools/list') return json(res,200,ok(id,{tools}));
    if(msg.method==='tools/call') {
      try { return json(res,200,ok(id,await handleTool(msg.params?.name,msg.params?.arguments||{}))); }
      catch(e) { return json(res,200,ok(id,{content:[{type:'text',text:String(e.message||e)}],isError:true})); }
    }
    return json(res,200,fail(id,-32601,'Method not found'));
  } catch(e) {
    return json(res,500,{error:String(e.message||e)});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[readonly-files-mcp] listening on :${PORT}; sources=${sources.size}`));
