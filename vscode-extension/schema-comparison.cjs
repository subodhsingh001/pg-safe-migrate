'use strict';
const aliases={'timestamp without time zone':'timestamp','timestamp with time zone':'timestamptz'};
const normalize=t=>aliases[t]||t;
function compare(local,live){
 const section=live?.intelligence?.columns;
 if(!local||!Array.isArray(local.columns)||!Array.isArray(section?.rows))return null;
 const rows=[];const remote=new Map(section.rows.map(c=>[c.name,c]));const names=new Set(local.columns.map(c=>c.name));
 for(const c of local.columns){const r=remote.get(c.name);const type=r?normalize(c.type)===normalize(r.type)?'match':'different':section.truncated?'unknown':'missing-live';const nullability=r&&typeof c.notNull==='boolean'&&typeof r.not_null==='boolean'?c.notNull===r.not_null?'match':'different':'unknown';rows.push({name:c.name,local:c.type,live:r?.type??null,type,nullability});}
 for(const r of section.rows)if(!names.has(r.name))rows.push({name:r.name,local:null,live:r.type,type:local.complete?'live-only':'unknown',nullability:'unknown'});
 const keys=local.columns.filter(c=>c.pk).map(c=>c.name);const actual=live.keyColumns;
 const primaryKey=keys.length===1&&Array.isArray(actual)?actual.length===1&&actual[0]===keys[0]?'match':'different':'unknown';
 return {source:local.source,partial:!local.complete||section.truncated===true,primaryKey,rows};
}
function format(report){if(!report)return 'No unambiguous static candidate for comparison.';return [`Schema comparison: ${report.source} (partial discovery; unknown is not drift).`,`Primary key: ${report.primaryKey}`,...report.rows.map(r=>`${r.name}: ${r.local??'unknown'} / ${r.live??'unknown'} | type: ${r.type} | nullability: ${r.nullability}`)].join('\n');}
module.exports={compare,format};
