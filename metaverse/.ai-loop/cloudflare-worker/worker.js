export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/trigger') {
      return new Response(JSON.stringify({ok:false,error:'POST /trigger required'}), {status:405, headers:{'content-type':'application/json'}});
    }
    const now = new Date().toISOString();
    const task = {
      project: 'Saiyairak 2D / Saiyairak 2D',
      trigger: 'cloudflare',
      created_at: now,
      instruction: 'Inspect the current development state, choose one highest-priority unresolved bug or improvement, work only on the development branch, run QA, record the result, and never modify production directly.'
    };
    if (!env.TASK_QUEUE) return new Response(JSON.stringify({ok:false,error:'TASK_QUEUE binding is not configured',task}), {status:503, headers:{'content-type':'application/json'}});
    await env.TASK_QUEUE.send(JSON.stringify(task));
    return new Response(JSON.stringify({ok:true, queued:true, task}), {headers:{'content-type':'application/json'}});
  },
  async scheduled(event, env) {
    const task = {
      project: 'Saiyairak 2D / Saiyairak 2D',
      trigger: 'cloudflare-cron',
      created_at: new Date().toISOString(),
      instruction: 'Prepare the next bounded development cycle: inspect GitHub/QA state, select one unresolved issue, and queue the work. Do not deploy production.'
    };
    if (env.TASK_QUEUE) await env.TASK_QUEUE.send(JSON.stringify(task));
  }
};
