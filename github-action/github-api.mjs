// Fixed GitHub.com endpoint; never forward credentials through redirects.
export function githubApi({token, fetchImpl = globalThis.fetch, sleep = ms => new Promise(r=>setTimeout(r,ms))} = {}) {
  if (typeof token !== 'string' || !token.trim() || /[\s\x00-\x1f]/.test(token)) throw new Error('Invalid GitHub token');
  return async function request(path, {method='GET', body}={}) {
    if (!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:pulls\/\d+|issues\/\d+\/comments(?:\?per_page=100&page=\d+)?|issues\/comments\/\d+)$/.test(path)) throw new Error('Invalid GitHub API path');
    for (let attempt=0; attempt<3; attempt++) {
      let response;
      try { response=await fetchImpl('https://api.github.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}); }
      catch { throw new Error('GitHub request failed'); }
      if (response.ok) return response.json();
      const retry=response.headers.get('retry-after');
      const transient=response.status===429 || response.status>=500 || (response.status===403 && retry!==null);
      // Never retry a potentially successful comment creation.
      if (method!=='POST' && transient && attempt<2) {
        const delay=retry===null?500*2**attempt:Number(retry)*1000;
        if (Number.isFinite(delay) && delay>=0 && delay<=10000) { await sleep(delay); continue; }
      }
      throw new Error(`GitHub API HTTP ${response.status}`);
    }
  };
}
