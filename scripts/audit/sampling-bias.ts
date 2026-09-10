import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { LaborInfoAdapter } from '../../src/services/dataSource/LaborInfoAdapter';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { LaborCaseDatasetBuilder } from '../../src/services/dataset/LaborCaseDatasetBuilder';
import { CityResolver } from '../../src/services/parser/CityResolver';

const base = 'https://laborinfocn.com';
const query = new URLSearchParams({'province[]':'广东省','caseLevel[]':'一审',start_date:'2021-01-01',end_date:'2023-12-31',per_page:'50'});
const requests: any[] = [];
function get(path: string) {
  const url = base + path;
  const text = execFileSync('curl.exe', ['-g','-L','--max-time','30','-sS','-w','\n%{http_code}',url], {encoding:'utf8',maxBuffer:20*1024*1024});
  const split = text.lastIndexOf('\n'); const status = Number(text.slice(split+1)); const body = text.slice(0,split);
  requests.push({url,status,at:new Date().toISOString()});
  if (status === 429 || status === 403) throw new Error(`Stop on rate limit ${status}`);
  return {status,body};
}
const pages: Record<number,any> = {};
function page(n:number) { const r=get('/api/v1/lawcases/search?'+query+'&page='+n); if(r.status!==200) throw new Error(r.body); return JSON.parse(r.body); }
function city(r:any) { const c=r.city || r.courtNm || ''; return ['广州','深圳','东莞'].find(x=>c.includes(x)) || (c.includes('市')?'其他':'unknown'); }
function counts(rows:any[], key:(r:any)=>string) { return rows.reduce((a,r)=>{const k=key(r);a[k]=(a[k]||0)+1;return a;},{} as Record<string,number>); }
function distribution(rows:any[]) {return {n:rows.length,city:counts(rows,city),year:counts(rows,r=>r.pbDt?.slice(0,4)||'unknown'),court:counts(rows,r=>r.courtNm||'unknown'),level:counts(rows,r=>r.caseLevel||'unknown'),cityYear:counts(rows,r=>city(r)+' / '+r.pbDt?.slice(0,4))};}
const docs = ['/openapi.json','/api/v1/openapi.json'].map(path=>({path,...get(path)}));
for(let p=1;p<=20;p++){pages[p]=page(p); console.log('head page',p);}
const stability=[1,2,3,5,10].map(p=>{const again=page(p); const fields=(x:any)=>x.data.map((r:any)=>[r.id,r.courtNm,r.pbDt,r.city??null,r.caseLevel]);return {page:p,identical:JSON.stringify(fields(pages[p]))===JSON.stringify(fields(again)),overlap:again.data.filter((r:any)=>pages[p].data.some((x:any)=>x.id===r.id)).length};});
const totalPages=pages[1].meta.total_pages;
const spread=[...new Set([1,...[.1,.25,.5,.75,.9].map(x=>Math.round(totalPages*x)),totalPages])];
for(const p of spread) {if(!pages[p]) pages[p]=page(p);console.log('spread page',p);}
const head=Array.from({length:20},(_,i)=>pages[i+1].data).flat();
const spreadRows=spread.flatMap(p=>pages[p].data);
const sortProbes=['order=pbDt_asc','order=random','sort=random','order=invalid'].map(s=>{const r=get('/api/v1/lawcases/search?'+query+'&page=1&'+s);let value:any;try{value=JSON.parse(r.body);}catch{value=r.body;}return {query:s,status:r.status,meta:value.meta,error:value.error,ids:value.data?.slice(0,5).map((x:any)=>x.id)};});
// Details are a purposive diagnostic panel, never a population estimate.
const panel:any[]=[];
for(const c of ['广州','深圳','东莞','其他','unknown']) panel.push(...spreadRows.filter(r=>city(r)===c).slice(0,6));
const nativeFetch=globalThis.fetch;
globalThis.fetch = (async (url:any)=>{const r=get(String(url).replace(base,''));return new Response(r.body,{status:r.status});}) as typeof fetch;
const adapter=new LaborInfoAdapter(); const details:any[]=[];
for(const m of panel){const raw=await adapter.fetchCaseDetail(m.id); const parsed=LaborInfoParserAdapter.parseDetailed(raw); const record=LaborCaseDatasetBuilder.buildSingleRecord(raw,null); details.push({id:m.id,apiCity:city(m),court:m.courtNm,pbDt:m.pbDt,parserCity:parsed.city,parserDate:parsed.date,year:record.year,score:record.parserScore,included:record.isIncludedInAnalysisSet,empty:!raw.rawText.trim()});console.log('detail',m.id);}
globalThis.fetch=nativeFetch;
const diagnostics=['（2023）粤03民终123号','（2023）粤19民终123号','（2023）粤01民终123号'].map(caseNumber=>({caseNumber,result:CityResolver.resolveCity({caseNumber})}));
const result={at:new Date().toISOString(),filter:Object.fromEntries(query),meta:pages[1].meta,docs,sortProbes,stability,head:Object.fromEntries([50,100,200,500].map(n=>[n,distribution(head.slice(0,n))])),spreadPages:spread,spread:distribution(spreadRows),pageStats:Object.fromEntries(Object.entries(pages).map(([p,r]:any)=>[p,{...distribution(r.data),first:r.data[0],last:r.data.at(-1)}])),dateAscendingViolations:head.slice(1).filter((r,i)=>r.pbDt>head[i].pbDt).length,uniqueHeadIds:new Set(head.map(r=>r.id)).size,details,diagnostics,requests,metadataPages:pages};
mkdirSync('audit-output',{recursive:true});writeFileSync('audit-output/sampling-bias.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,metadataPages:undefined,pageStats:undefined,requests:undefined},null,2));
