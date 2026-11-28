'use strict';
const {connectionConfig}=require('./live-schema.cjs');
const key='pgsafe.connectionProfiles.v1';
function valid(name){if(typeof name!=='string'||!name.trim()||name.length>80||/[\x00-\x1f\x7f]/.test(name))throw Error('Invalid profile name');return name;}
function names(ctx){const n=ctx.globalState.get(key,[]);return Array.isArray(n)?n.filter(x=>typeof x==='string').slice(0,50):[];}
const secret=name=>'pgsafe.profile.v1.'+Buffer.from(valid(name)).toString('base64url');
async function save(ctx,name,data){valid(name);connectionConfig(data);const list=names(ctx);if(!list.includes(name)&&list.length>=50)throw Error('Profile limit');const clean=Object.fromEntries(['host','port','database','user','password','tls'].map(k=>[k,data[k]]));await ctx.secrets.store(secret(name),JSON.stringify(clean));if(!list.includes(name))await ctx.globalState.update(key,[...list,name]);}
async function load(ctx,name){if(!names(ctx).includes(valid(name)))throw Error('Unknown profile');const raw=await ctx.secrets.get(secret(name));if(!raw)throw Error('Saved credentials unavailable');const data=JSON.parse(raw);connectionConfig(data);return data;}
async function remove(ctx,name){valid(name);if(!names(ctx).includes(name))return;await ctx.secrets.delete(secret(name));await ctx.globalState.update(key,names(ctx).filter(n=>n!==name));}
module.exports={names,save,load,remove};
