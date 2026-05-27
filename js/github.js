// ── GitHub API + token via localStorage ──────────────────────
const _GH_OWNER = 'mugaoliao1';
const _GH_REPO  = 'rota77-operacao';

function getToken() { return localStorage.getItem('r77_gh_token') || ''; }
function saveToken(t) { localStorage.setItem('r77_gh_token', t); }

async function publicarArquivo(path, html, commitMsg) {
  const token = getToken();
  if (!token) throw new Error('Token GitHub não configurado. Configure na página de Configurações.');

  const API  = 'https://api.github.com/repos/' + _GH_OWNER + '/' + _GH_REPO + '/contents/' + path;
  const hdrs = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };

  const bytes = new TextEncoder().encode(html);
  let binary = '';
  bytes.forEach(function(b) { binary += String.fromCharCode(b); });
  const content = btoa(binary);

  let sha;
  const existing = await fetch(API, { headers: hdrs });
  if (existing.ok) sha = (await existing.json()).sha;

  const body = { message: commitMsg, content: content };
  if (sha) body.sha = sha;

  const res = await fetch(API, {
    method: 'PUT',
    headers: Object.assign({}, hdrs, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });

  if (!res.ok) { const e = await res.json(); throw new Error(e.message || res.statusText); }
  return true;
}
