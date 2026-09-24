import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { decodePng } from '../api/_lib/png.js';
import { setSession, getSession, readCookie, unseal } from '../api/_lib/session.js';
import { createSubmission } from '../api/_lib/airtable.js';
import { isDev } from '../api/_lib/config.js';
import submit from '../api/submit.js';
import logout from '../api/auth/logout.js';

const originalFetch = globalThis.fetch;
let records, creates, uploads, failUpload, loseCreate, seconds, statsUrls;
function response() {
  return { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; },
    getHeader(k) { return this.headers[k]; }, end(value) { this.body=value ? JSON.parse(value) : null; } };
}
const ok = (body) => ({ok:true, json:async()=>body});
beforeEach(() => {
  Object.assign(process.env, {PUBLIC_ORIGIN:'https://receipt.hackclub.com', NODE_ENV:'production',
    SESSION_KEY:randomBytes(32).toString('base64'), AIRTABLE_TOKEN:'mock', AIRTABLE_BASE_ID:'appTest'});
  records=[]; creates=0; uploads=0; failUpload=false; loseCreate=false; seconds=0; statsUrls=[];
  globalThis.fetch=async(url, options={})=> {
    if (String(url).includes('api.airtable.com')) {
      const body=options.body && JSON.parse(options.body);
      if(options.method==='GET') return ok({records: structuredClone(records)});
      if(body?.performUpsert) {
        if (!records.length) { creates++; records.push({id:'rec1',fields:body.records[0].fields}); }
        if(loseCreate) { loseCreate=false; throw Error('response lost'); }
        return ok({records:structuredClone(records)});
      }
      if(options.method==='PATCH') { Object.assign(records[0].fields,body.fields); return ok(structuredClone(records[0])); }
    }
    if (String(url).includes('content.airtable.com')) {
      uploads++;
      assert.equal(records[0].fields['Automation - Submit to Unified YSWS'],false);
      if(failUpload) throw Error('upload failed');
      records[0].fields.Screenshot=[{id:'attachment'}]; return ok({});
    }
    if(String(url).includes('auth.hackclub.com')) return ok({ysws_eligible:true});
    if(String(url).includes('authenticated/me')) return ok({id:123});
    if(String(url).includes('authenticated/api_keys')) return ok({token:'mock'});
    if(String(url).includes('/stats?')) { statsUrls.push(String(url)); return ok({total_seconds:seconds}); }
    throw Error(`Unexpected fetch ${url}`);
  };
});
afterEach(()=> { globalThis.fetch=originalFetch; });

async function validPng() { return sharp({create:{width:384,height:240,channels:3,background:'white'}}).png().toBuffer(); }
function authRequest() {
  const res=response(); setSession(res,{at:'mock',ht:'mock',elig:true});
  const cookie=res.headers['Set-Cookie'][0].split(';')[0];
  const payload=unseal(decodeURIComponent(cookie.split('=')[1]));
  return {method:'POST',headers:{cookie,origin:process.env.PUBLIC_ORIGIN,'content-type':'application/json','x-csrf-token':payload.csrf}};
}
async function submission() {return {identity:{},repoUrl:'https://github.com/test/art',projectName:'receipt',hours:0,
  description:'A beautiful receipt for testing.',hackatimeUserId:'123',dateRange:'2026-09-01 to 2026-09-22',png:{buf:await validPng()}};}

test('PNG fully decodes and re-encodes; fabricated header and truncated image are rejected',async()=>{
  const png=await validPng(); const result=await decodePng(png.toString('base64'));
  assert.equal((await sharp(result.buf).metadata()).width,384);
  const fake=Buffer.alloc(24); Buffer.from('89504e470d0a1a0a','hex').copy(fake); fake.writeUInt32BE(384,16);fake.writeUInt32BE(240,20);
  await assert.rejects(decodePng(fake.toString('base64')),/not_a_png/);
  await assert.rejects(decodePng(png.subarray(0,60).toString('base64')),/not_a_png/);
  const wide=await sharp({create:{width:385,height:240,channels:3,background:'white'}}).png().toBuffer();
  await assert.rejects(decodePng(wide.toString('base64')),/bad_width/);
});

test('sibling origin, missing origin, plain text, and wrong CSRF token cannot write',async()=>{
  for(const change of [{origin:'https://evil.hackclub.com'},{origin:undefined},{'content-type':'text/plain'},{'x-csrf-token':'wrong'}]) {
    const req=authRequest();Object.assign(req.headers,change);req.body={};const res=response();await submit(req,res);
    assert.ok([403,415].includes(res.statusCode));assert.equal(creates,0);
  }
});

test('logout clears browser cookie and rejects GET / cross-origin',async()=>{
  const req=authRequest(); const session=await getSession(req);
  const refreshed=response();setSession(refreshed,{...session,ht:'new'});
  const refreshedReq={headers:{cookie:refreshed.headers['Set-Cookie'][0].split(';')[0]}};
  for(const candidate of [{...req,method:'GET'},{...req,headers:{...req.headers,origin:'https://evil.hackclub.com'}}]) {
    const res=response();await logout(candidate,res);assert.ok([403,405].includes(res.statusCode));assert.ok(await getSession(req));
  }
  const res=response();await logout(req,res);assert.equal(res.statusCode,200);
  assert.match(res.headers['Set-Cookie'][0], /Max-Age=0/);
  // Copied cookies intentionally remain valid until expiry.
  assert.ok(await getSession(req));assert.ok(await getSession(refreshedReq));
});

test('persistent project uniqueness rejects sequential and concurrent replays',async()=>{
  const data=await submission();
  const outcomes=await Promise.allSettled([createSubmission(data),createSubmission(data)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(creates,1);
  await assert.rejects(createSubmission(data),{code:'already_submitted'});assert.equal(creates,1);
});

test('failed upload stays pending and retry reuses its record',async()=>{
  const data=await submission();failUpload=true;
  await assert.rejects(createSubmission(data),/upload failed/);
  assert.equal(records[0].fields['Automation - Submit to Unified YSWS'],false);
  failUpload=false;await createSubmission(data);
  assert.equal(creates,1);assert.equal(uploads,2);assert.equal(records[0].fields['Automation - Submit to Unified YSWS'],false);
});

test('lost create response is recovered by the persistent Airtable key',async()=>{
  const data=await submission();loseCreate=true;await assert.rejects(createSubmission(data),/response lost/);
  await createSubmission(data);assert.equal(creates,1);
});

test('zero hours is accepted and the start-date cutoff stays in the upstream request',async()=>{
  const req=authRequest();const data=await submission();req.body={...data,png:data.png.buf.toString('base64')};
  const res=response();await submit(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.hours,0);
  assert.equal(new URL(statsUrls[0]).searchParams.get('start_date'),'2026-09-01');
});

test('malformed cookies fail closed; non-local HTTP cannot enable dev',()=>{
  assert.equal(readCookie({headers:{cookie:'rcpt_session=%ZZ'}},'rcpt_session'),null);
  process.env.NODE_ENV='development';process.env.PUBLIC_ORIGIN='http://example.com';assert.equal(isDev(),false);
  process.env.PUBLIC_ORIGIN='http://localhost:5173';assert.equal(isDev(),true);
});
