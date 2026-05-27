// ── Radar Semanal ─────────────────────────────────────────────
const TICKET_MEDIO = 13.12;
let _radarDados    = null;
let _radarCSVs     = [];

function processarCSVsRadar(files) {
  _radarCSVs = [];
  const arr = Array.from(files);
  if (!arr.length) return;

  let loaded = 0;
  arr.forEach(file => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const resultado = parsearCSV(e.target.result);
        _radarCSVs.push({ arquivo: file.name, ...resultado });
      } catch(err) {
        console.warn('Erro ao ler ' + file.name, err);
      }
      loaded++;
      if (loaded === arr.length) _finalizarCarregamentoRadar(arr.length);
    };
    reader.readAsText(file, 'latin1');
  });
}

function _finalizarCarregamentoRadar(total) {
  const todasCorridas = _radarCSVs.flatMap(r => r.todasCorridas);
  if (!todasCorridas.length) { mostrarToast('⚠️ Nenhuma corrida encontrada nos arquivos.', 'erro'); return; }

  const datas = [...new Set(todasCorridas.map(r => r.data))].sort();
  document.getElementById('radar-csv-info').textContent =
    `✅ ${total} arquivo(s) — ${datas.length} dia(s): ${datas[0]} a ${datas[datas.length-1]}`;

  // Preencher contexto padrão
  const ini = _fmtDataBR(datas[0]), fim = _fmtDataBR(datas[datas.length-1]);
  if (!document.getElementById('radar-contexto').value) {
    document.getElementById('radar-contexto').value =
      `Semana de ${ini} a ${fim}. Análise consolidada de ${datas.length} dia(s) de operação.`;
  }
  document.getElementById('btn-gerar-radar').disabled = false;
  mostrarToast(`✅ ${total} arquivo(s) carregado(s).`, 'sucesso');
}

function _fmtDataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

function gerarRadar() {
  if (!_radarCSVs.length) { mostrarToast('❌ Carregue os CSVs primeiro.', 'erro'); return; }

  const todasCorridas = _radarCSVs.flatMap(r => r.todasCorridas);
  const contexto  = document.getElementById('radar-contexto').value.trim();
  const destaque  = document.getElementById('radar-destaque').value.trim();
  const acoes     = [1,2,3].map(i => ({
    texto:       document.getElementById('radar-acao' + i).value.trim(),
    responsavel: document.getElementById('radar-resp' + i).value.trim(),
    status:      document.getElementById('radar-status' + i).value
  }));

  _radarDados = calcularRadar(todasCorridas, { contexto, destaque, acoes });

  const html   = _construirHtmlRadar(_radarDados);
  const blob   = new Blob([html], { type: 'text/html;charset=utf-8' });
  const oldUrl = document.getElementById('radar-iframe').src;
  document.getElementById('radar-iframe').src = URL.createObjectURL(blob);
  if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
  abrirModal('modal-radar');
}

async function publicarRadar() {
  if (!_radarDados) return;
  const html = _construirHtmlRadar(_radarDados);

  const btn = document.getElementById('btn-publicar-radar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }

  try {
    await publicarArquivo('radar-atual.html', html, 'radar: ' + _radarDados.periodo);
    mostrarToast('✅ Radar publicado! Deploy em ~1 min', 'sucesso');
    fecharModal('modal-radar');
  } catch(e) {
    console.error('[radar/publicar]', e);
    mostrarToast('❌ ' + e.message, 'erro');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Publicar Radar'; }
  }
}

// ── Cálculo ────────────────────────────────────────────────────
function calcularRadar(todasCorridas, { contexto, destaque, acoes }) {
  const datas       = [...new Set(todasCorridas.map(r => r.data))].sort();
  const finalizadas = todasCorridas.filter(r => r.statusNorm === 'finalizada');
  const canceladas  = todasCorridas.filter(r => r.statusNorm.includes('cancelad'));
  const naoAtend    = todasCorridas.filter(r =>
    r.statusNorm.includes('não atendid') || r.statusNorm.includes('nao atendid') ||
    r.statusNorm.includes('expirad')     || r.statusNorm.includes('sem motorista'));

  const total      = todasCorridas.length || 1;
  const taxaFin    = Math.round(finalizadas.length / total * 1000) / 10;
  const taxaCancel = Math.round(canceladas.length  / total * 1000) / 10;
  const receita    = Math.round(finalizadas.length * TICKET_MEDIO);

  // Motoristas ativos (finalizadas)
  const motoristasAtivos = new Set(finalizadas.filter(r => r.nomeMotorista).map(r => r.nomeMotorista)).size;

  // Por dia
  const porDia = datas.map(data => {
    const dc = todasCorridas.filter(r => r.data === data);
    const df = dc.filter(r => r.statusNorm === 'finalizada');
    return { data, total: dc.length, finalizadas: df.length };
  });
  const maxDiaTotal = Math.max(...porDia.map(d => d.total), 1);

  // Top motivos cancelamento
  const motivosMap = {};
  canceladas.forEach(r => {
    const m = (r.motivo || '').trim() || 'Outros';
    motivosMap[m] = (motivosMap[m] || 0) + 1;
  });
  const topMotivos = Object.entries(motivosMap).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(e => ({ motivo: e[0], qtd: e[1], pct: Math.round(e[1] / (canceladas.length || 1) * 100) }));

  // Top 10 motoristas
  const motMap = {};
  finalizadas.forEach(r => { if (r.nomeMotorista) motMap[r.nomeMotorista] = (motMap[r.nomeMotorista] || 0) + 1; });
  const top10 = Object.entries(motMap).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map((e, i) => ({ pos: i+1, nome: e[0], corridas: e[1] }));
  const maxCorridas = top10.length ? top10[0].corridas : 1;

  const periodo = datas.length === 1 ? _fmtDataBR(datas[0]) : _fmtDataBR(datas[0]) + ' a ' + _fmtDataBR(datas[datas.length-1]);

  return {
    periodo, datas,
    totalSolicitacoes: todasCorridas.length,
    mediaDiaria: Math.round(todasCorridas.length / (datas.length || 1)),
    finalizadas: finalizadas.length,
    taxaFin, taxaCancel,
    receita,
    motoristasAtivos,
    canceladas: canceladas.length,
    naoAtendidas: naoAtend.length,
    porDia, maxDiaTotal,
    topMotivos, top10, maxCorridas,
    contexto, destaque, acoes
  };
}

// ── Construtor HTML ────────────────────────────────────────────
function _construirHtmlRadar(d) {
  var statusIcon = { '✅': '✅', '🔄': '🔄', '⏳': '⏳' };

  var kpiGrid = `
    <div class="kpi-box">
      <div class="kpi-val">${d.totalSolicitacoes.toLocaleString('pt-BR')}</div>
      <div class="kpi-label">Total de solicitações</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-val">${d.mediaDiaria.toLocaleString('pt-BR')}</div>
      <div class="kpi-label">Média por dia</div>
    </div>
    <div class="kpi-box amarelo">
      <div class="kpi-val">${d.finalizadas.toLocaleString('pt-BR')}</div>
      <div class="kpi-label">Finalizadas</div>
    </div>
    <div class="kpi-box verde">
      <div class="kpi-val">${d.taxaFin.toFixed(1).replace('.',',')}%</div>
      <div class="kpi-label">Taxa finalização</div>
    </div>
    <div class="kpi-box vermelho">
      <div class="kpi-val">${d.taxaCancel.toFixed(1).replace('.',',')}%</div>
      <div class="kpi-label">Taxa cancelamento</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-val">R$&nbsp;${d.receita.toLocaleString('pt-BR')}</div>
      <div class="kpi-label">Receita estimada</div>
    </div>`;

  var barras = d.porDia.map(function(dia) {
    var pctTotal = Math.round(dia.total / d.maxDiaTotal * 100);
    var pctFin   = dia.total > 0 ? Math.round(dia.finalizadas / dia.total * 100) : 0;
    var partes   = dia.data.split('-');
    var label    = partes[2] + '/' + partes[1];
    return `<div class="bar-item">
      <div class="bar-label">${label}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pctTotal}%">
          <div class="bar-fill-fin" style="width:${pctFin}%"></div>
        </div>
      </div>
      <div class="bar-num">${dia.total}</div>
    </div>`;
  }).join('');

  var motivosRows = d.topMotivos.map(function(m, i) {
    return `<tr>
      <td class="td-pos">${i+1}</td>
      <td>${m.motivo}</td>
      <td class="td-qtd">${m.qtd}</td>
      <td class="td-pct">${m.pct}%</td>
    </tr>`;
  }).join('');

  var top10Rows = d.top10.map(function(m) {
    var barW = Math.round(m.corridas / d.maxCorridas * 100);
    return `<tr>
      <td class="td-pos">${m.pos <= 3 ? ['🥇','🥈','🥉'][m.pos-1] : m.pos}</td>
      <td>
        <div class="mot-nome">${m.nome}</div>
        <div class="mot-bar"><div class="mot-bar-fill" style="width:${barW}%"></div></div>
      </td>
      <td class="td-qtd">${m.corridas}</td>
    </tr>`;
  }).join('');

  var acoesHtml = d.acoes.filter(function(a){ return a.texto; }).map(function(a) {
    return `<div class="acao-item">
      <div class="acao-status">${a.status}</div>
      <div class="acao-corpo">
        <div class="acao-texto">${a.texto}</div>
        ${a.responsavel ? '<div class="acao-resp">👤 ' + a.responsavel + '</div>' : ''}
      </div>
    </div>`;
  }).join('');

  var css = `:root{--azul:#1a2f5e;--azul-escuro:#111f3e;--amarelo:#F5A800;--verde:#27ae60;--vermelho:#e74c3c;--cinza:#f4f6f9;--cinza-texto:#666;--branco:#fff;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Barlow',sans-serif;background:var(--azul-escuro);min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;}
.card{width:100%;max-width:480px;background:var(--branco);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);}
.header{background:var(--azul);padding:24px 24px 20px;position:relative;overflow:hidden;}
.header::before{content:'';position:absolute;top:-50px;right:-50px;width:200px;height:200px;background:rgba(245,168,0,.1);border-radius:50%;}
.header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;position:relative;}
.logo-box{background:var(--amarelo);border-radius:8px;padding:6px 10px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:var(--azul);line-height:1.1;}
.periodo-pill{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7);font-size:10px;font-weight:600;padding:4px 12px;border-radius:20px;}
.header-eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--amarelo);margin-bottom:4px;position:relative;}
.header-titulo{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:var(--branco);line-height:1;position:relative;}
.secao{padding:18px 20px;border-bottom:1px solid #eee;}
.secao:last-child{border-bottom:none;}
.secao-label{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--amarelo);margin-bottom:12px;}
.kpi-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
.kpi-box{background:var(--cinza);border-radius:10px;padding:12px;text-align:center;border-top:3px solid #ddd;}
.kpi-box.amarelo{border-top-color:var(--amarelo);}
.kpi-box.verde{border-top-color:var(--verde);}
.kpi-box.vermelho{border-top-color:var(--vermelho);}
.kpi-val{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:var(--azul);line-height:1;}
.kpi-label{font-size:9px;color:var(--cinza-texto);text-transform:uppercase;letter-spacing:.5px;margin-top:3px;}
.bar-item{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.bar-label{font-size:10px;font-weight:700;color:var(--azul);width:42px;flex-shrink:0;}
.bar-track{flex:1;background:#eee;border-radius:4px;height:14px;overflow:hidden;}
.bar-fill{height:100%;background:rgba(26,47,94,.2);border-radius:4px;position:relative;min-width:2px;}
.bar-fill-fin{position:absolute;top:0;left:0;height:100%;background:var(--azul);border-radius:4px;}
.bar-num{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:var(--azul);width:36px;text-align:right;flex-shrink:0;}
table{width:100%;border-collapse:collapse;}
th{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cinza-texto);padding:6px 8px;text-align:left;border-bottom:2px solid #eee;}
td{font-size:12px;color:#333;padding:8px 8px;border-bottom:1px solid #f5f5f5;}
tr:last-child td{border-bottom:none;}
.td-pos{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:900;color:#ccc;width:28px;}
.td-qtd{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;color:var(--amarelo);text-align:right;}
.td-pct{font-size:11px;color:var(--cinza-texto);text-align:right;width:36px;}
.mot-nome{font-size:12px;font-weight:600;color:var(--azul);margin-bottom:4px;}
.mot-bar{background:#eee;border-radius:3px;height:4px;overflow:hidden;}
.mot-bar-fill{height:100%;background:var(--amarelo);border-radius:3px;}
.contexto-box{background:#f0f4ff;border-radius:10px;padding:14px;font-size:12px;color:var(--azul);line-height:1.6;margin-bottom:12px;}
.destaque-box{background:#fff8e6;border:1px solid rgba(245,168,0,.3);border-radius:10px;padding:12px 14px;font-size:12px;color:#7a5800;line-height:1.6;}
.destaque-box strong{color:var(--azul);}
.acao-item{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f0f0f0;}
.acao-item:last-child{border-bottom:none;}
.acao-status{font-size:20px;flex-shrink:0;margin-top:1px;}
.acao-texto{font-size:12px;font-weight:600;color:var(--azul);margin-bottom:2px;}
.acao-resp{font-size:10px;color:var(--cinza-texto);}
.fechamento{background:var(--azul);padding:18px 20px;display:flex;align-items:center;gap:12px;}
.fechamento-emoji{font-size:24px;flex-shrink:0;}
.fechamento-texto{font-size:13px;color:rgba(255,255,255,.8);line-height:1.5;}`;

  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Radar Semanal — Rota 77</title>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
    '<style>\n' + css + '\n</style>\n</head>\n<body>\n<div class="card">\n' +

    '<div class="header">\n' +
    '  <div class="header-top"><div class="logo-box">ROTA<br>77</div>' +
    '<div class="periodo-pill">' + d.periodo + '</div></div>\n' +
    '  <div class="header-eyebrow">📊 Análise semanal</div>\n' +
    '  <div class="header-titulo">Radar Semanal</div>\n' +
    '</div>\n' +

    '<div class="secao"><div class="secao-label">KPIs da Semana</div>' +
    '<div class="kpi-grid">' + kpiGrid + '</div></div>\n' +

    '<div class="secao"><div class="secao-label">Corridas por Dia</div>' + barras + '</div>\n' +

    '<div class="secao"><div class="secao-label">Top Motivos de Cancelamento</div>' +
    '<table><thead><tr><th>#</th><th>Motivo</th><th>Qtd</th><th>%</th></tr></thead>' +
    '<tbody>' + motivosRows + '</tbody></table></div>\n' +

    '<div class="secao"><div class="secao-label">Top 10 — Motoristas da Semana</div>' +
    '<table><thead><tr><th>#</th><th>Motorista</th><th>Corridas</th></tr></thead>' +
    '<tbody>' + top10Rows + '</tbody></table></div>\n' +

    '<div class="secao"><div class="secao-label">Diagnóstico da Semana</div>' +
    (d.contexto ? '<div class="contexto-box">' + d.contexto.replace(/\n/g,'<br>') + '</div>' : '') +
    (d.destaque ? '<div class="destaque-box">⭐ <strong>Destaque:</strong> ' + d.destaque.replace(/\n/g,'<br>') + '</div>' : '') +
    '</div>\n' +

    (acoesHtml ? '<div class="secao"><div class="secao-label">Ações da Próxima Semana</div>' + acoesHtml + '</div>\n' : '') +

    '<div class="fechamento"><div class="fechamento-emoji">📊</div>' +
    '<div class="fechamento-texto">Rota 77 — Operação em análise constante. ✅</div></div>\n' +
    '</div>\n</body>\n</html>';
}

window.gerarRadar         = gerarRadar;
window.publicarRadar      = publicarRadar;
window.processarCSVsRadar = processarCSVsRadar;
