import {chromium} from 'patchright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const header=fs.readFileSync('.secrets/nyt-cookie-header.txt','utf8').trim();
const cookies=header.split('; ').map(p=>{const i=p.indexOf('='); const n=p.slice(0,i), v=p.slice(i+1);
 if(n==='datadome') return {name:n,value:v,domain:'.www.nytimes.com',path:'/'};
 return {name:n,value:v,domain:'.nytimes.com',path:'/'};});
const userDataDir=path.join(os.homedir(),'.hermes/cache/scratch/patchright-nyt-profile');
fs.mkdirSync(userDataDir,{recursive:true});
const ctx=await chromium.launchPersistentContext(userDataDir,{headless:false,channel:'chrome',viewport:null});
await ctx.addCookies(cookies);
const p=await ctx.newPage();
const url=process.argv[2]||'https://www.nytimes.com/2026/10/25/world/americas/machado-venezuela-return.html';
const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
console.log('initial status',r.status());
try { await p.waitForLoadState('networkidle',{timeout:20000}); } catch {}
await p.waitForTimeout(5000);
console.log('final url',p.url());
const info=await p.evaluate(()=>{
 const bodies=[];
 for(const s of document.querySelectorAll('script[type="application/ld+json"]')){
  try{const d=JSON.parse(s.textContent); const walk=v=>{if(v&&typeof v==='object'){if(typeof v.articleBody==='string')bodies.push(v.articleBody); Object.values(v).forEach(walk)}}; walk(d)}catch{}}
 const paras=[...document.querySelectorAll('section[name="articleBody"] p, article p')].map(x=>x.textContent||'').filter(x=>x.length>40);
 return {body:bodies.sort((a,b)=>b.length-a.length)[0]||'', paraCount:paras.length, paraChars:paras.join(' ').length, hasPaywall:document.body.innerText.includes('Create your free account')||document.body.innerText.includes('Already a subscriber'), accountMenu:!!document.querySelector('[data-testid="user-settings-menu"]')};});
console.log(JSON.stringify({...info, bodyChars:info.body.length},null,2));
console.log('BODY_PREVIEW:', (info.body||'').slice(0,500));
await ctx.close();
