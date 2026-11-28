'use strict';
const fs=require('node:fs'), path=require('node:path');
const types=new Set(['text','integer','bigint','smallint','boolean','uuid','date','timestamp','timestamptz','numeric','real','double precision','bytea']);
function read(root,relative){
 const parts=relative.split('/'); let p=root;
 for(const part of parts){p=path.join(p,part);const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('symlink');}
 const s=fs.statSync(p);if(!s.isFile()||s.size>512*1024)throw Error('size');return fs.readFileSync(p,'utf8');
}
function prisma(text,schema,table){
 if(schema!=='public'||/@@schema\s*\(|\/\*/.test(text))return [];
 const result=[];
 for(const m of text.matchAll(/^\s*model\s+(\w+)\s*\{([^{}]*)\}/gm)){
 const body=m[2], map=/@@map\("([a-zA-Z0-9_]+)"\)/.exec(body);
 if((map?.[1]||m[1])!==table||/@@id\s*\(/.test(body))continue;
 const columns=[];
 for(const line of body.split(/\r\n|\n|\r/)){const f=/^\s*(\w+)\s+(String|Int|BigInt|Boolean|Bytes)(\?)?\s*(.*)$/.exec(line);if(!f)continue;
 const attrs=f[4];if(/@db\.|\/\//.test(attrs))continue;const mapped=/@map\("([a-zA-Z0-9_]+)"\)/.exec(attrs);if(/@map\(/.test(attrs)&&!mapped)continue;
 columns.push({name:mapped?.[1]||f[1],type:{String:'text',Int:'integer',BigInt:'bigint',Boolean:'boolean',Bytes:'bytea'}[f[2]],pk:!f[3]&&/@id\b/.test(attrs),notNull:!f[3]});}
 result.push(columns);
 }return result;
}
function snapshot(text,schema,table){const j=JSON.parse(text);if(j.dialect!=='postgresql'||!j.tables)return [];return Object.values(j.tables).filter(t=>t.name===table&&(t.schema||'public')===schema).map(t=>Object.values(t.columns||{}).filter(c=>types.has(c.type)).map(c=>({name:c.name,type:c.type,notNull:typeof c.notNull==='boolean'?c.notNull:undefined,pk:c.primaryKey===true&&c.notNull===true&&!Object.keys(t.compositePrimaryKeys||{}).length})));}
function sql(text,schema,table){const result=[];if(/--|\/\*|\$|['"]/.test(text))return result;for(const m of text.matchAll(/(?:^|;)\s*CREATE\s+TABLE\s+(\w+)\.(\w+)\s*\(([^()]*)\)\s*(?=;|$)/gi)){if(m[1].toLowerCase()!==schema||m[2].toLowerCase()!==table)continue;const cols=[];for(const line of m[3].split(',')){const f=/^\s*(\w+)\s+(text|integer|bigint|smallint|boolean|uuid|date|timestamp|timestamptz|numeric|real|bytea)(\s+PRIMARY\s+KEY|\s+NOT\s+NULL)?\s*$/i.exec(line);if(!f){cols.length=0;break;}cols.push({name:f[1].toLowerCase(),type:f[2].toLowerCase(),pk:/PRIMARY/i.test(f[3]||''),notNull:!!f[3]});}result.push(cols);}return result;}
function discover(root,defaults,details=false){if(!root||!defaults[0])return null;const [schema,table,column,destination]=defaults;const candidates=[];
 const sources=[['prisma/schema.prisma',prisma],['schema.prisma',prisma],['schema.sql',sql],['db/schema.sql',sql]];
 try{const dir=path.join(root,'drizzle','meta');if(!fs.lstatSync(path.join(root,'drizzle')).isSymbolicLink()&&!fs.lstatSync(dir).isSymbolicLink()){const names=fs.readdirSync(dir).filter(n=>/^\d+_snapshot\.json$/.test(n));if(names.length===1)sources.push(['drizzle/meta/'+names[0],snapshot]);}}catch{}
 for(const [file,parse] of sources){try{for(const cols of parse(read(root,file),schema,table)){const c=cols.filter(c=>c.name===column),keys=cols.filter(c=>c.pk);if(c.length===1&&(details||!cols.some(c=>c.name===destination)))candidates.push({source:file,type:c[0].type,key:keys.length===1?keys[0].name:'',keyType:keys.length===1?keys[0].type:'',...(details?{columns:cols,complete:false}: {})});}}catch{}}
 return candidates.length===1?candidates[0]:null;
}
module.exports={discover};
