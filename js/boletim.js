// ── Gerador de Boletim Diário ─────────────────────────────────
let _boletimDados = null;
let _boletimCSVDados = null;

function processarCSVBoletim(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const resultado = parsearCSV(e.target.result);
      if (!resultado.metricas || !Object.keys(resultado.metricas).length) {
        mostrarToast('⚠️ Nenhuma corrida finalizada encontrada.', 'erro'); return;
      }
      _boletimCSVDados = resultado;
      const datas = Object.keys(resultado.metricas).sort();
      document.getElementById('boletim-data-sel').innerHTML =
        datas.map(d => `<option value="${d}">${d}</option>`).join('');
      document.getElementById('boletim-data-sel').value = datas[datas.length - 1];
      document.getElementById('boletim-csv-info').textContent =
        `✅ ${file.name} — ${datas.length} dia(s) disponível(is)`;
      document.getElementById('btn-gerar-boletim').disabled = false;
    } catch(err) {
      console.error(err);
      mostrarToast('❌ Erro ao processar CSV: ' + err.message, 'erro');
    }
  };
  reader.readAsText(file, 'latin1');
}

function gerarBoletim() {
  if (!_boletimCSVDados) { mostrarToast('❌ Carregue um CSV primeiro.', 'erro'); return; }
  const data = document.getElementById('boletim-data-sel').value;
  if (!data) { mostrarToast('❌ Selecione uma data.', 'erro'); return; }

  _boletimDados = calcularBoletim(_boletimCSVDados.todasCorridas, data);

  const html  = _construirHtmlBoletim(_boletimDados);
  const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
  const oldUrl = document.getElementById('boletim-iframe').src;
  document.getElementById('boletim-iframe').src = URL.createObjectURL(blob);
  if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);

  document.getElementById('boletim-fechamento').value = _boletimDados.fechamento;
  abrirModal('modal-boletim');
}

async function publicarBoletim() {
  if (!_boletimDados) return;
  const msg  = document.getElementById('boletim-fechamento').value.trim() || _boletimDados.fechamento;
  const html = _construirHtmlBoletim(Object.assign({}, _boletimDados, { fechamento: msg }));

  const btn = document.getElementById('btn-publicar-boletim');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }

  try {
    await publicarArquivo('boletim-atual.html', html, 'boletim: ' + _boletimDados.dataFormatada);
    mostrarToast('✅ Boletim publicado! Deploy em ~1 min', 'sucesso');
    fecharModal('modal-boletim');
  } catch(e) {
    console.error('[boletim/publicar]', e);
    mostrarToast('❌ ' + e.message, 'erro');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Publicar Boletim'; }
  }
}

// ── Cálculo ────────────────────────────────────────────────────
function calcularBoletim(todasCorridas, data) {
  const corridas     = todasCorridas.filter(r => r.data === data);
  const finalizadas  = corridas.filter(r => r.statusNorm === 'finalizada');
  const canceladas   = corridas.filter(r => r.statusNorm.includes('cancelad'));
  const naoAtendidas = corridas.filter(r =>
    r.statusNorm.includes('não atendid') || r.statusNorm.includes('nao atendid') ||
    r.statusNorm.includes('expirad')     || r.statusNorm.includes('sem motorista'));
  const total = corridas.length || 1;

  const temPassageiro = canceladas.some(r => r.passageiro);
  let cancelReais = canceladas, rechamadas = 0;
  if (temPassageiro) {
    cancelReais = canceladas.filter(c => {
      if (!c.passageiro) return true;
      const limite = c.momentoMs + 2 * 3600 * 1000;
      return !finalizadas.some(f => f.passageiro === c.passageiro && f.momentoMs > c.momentoMs && f.momentoMs <= limite);
    });
    rechamadas = canceladas.length - cancelReais.length;
  }

  function pct(n) { return Math.round(n / total * 1000) / 10; }

  const motivosMap = {};
  cancelReais.forEach(r => { const m = (r.motivo || '').trim() || 'Outros'; motivosMap[m] = (motivosMap[m] || 0) + 1; });
  const topMotivos = Object.entries(motivosMap).sort((a,b)=>b[1]-a[1]).slice(0,4).map(e=>({ motivo:e[0], qtd:e[1] }));

  const horasMap = {};
  cancelReais.forEach(r => { horasMap[r.hora] = (horasMap[r.hora] || 0) + 1; });
  const horariosCancel = Object.entries(horasMap).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map((e,i) => ({ hora: parseInt(e[0]), qtd: e[1], nivel: i < 2 ? 'alto' : 'medio' }));

  const motMap = {};
  finalizadas.forEach(r => { if (r.nomeMotorista) motMap[r.nomeMotorista] = (motMap[r.nomeMotorista] || 0) + 1; });
  const top3 = Object.entries(motMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>({ nome:e[0], corridas:e[1] }));

  const madMap = {};
  finalizadas.filter(r => r.hora >= 0 && r.hora <= 4).forEach(r => { if (r.nomeMotorista) madMap[r.nomeMotorista] = (madMap[r.nomeMotorista] || 0) + 1; });
  const madSorted = Object.entries(madMap).sort((a,b)=>b[1]-a[1]);
  const destMadrugada = madSorted.length ? { nome: madSorted[0][0], corridas: madSorted[0][1] } : null;

  const criticoMap = {};
  finalizadas.filter(r => (r.hora >= 7 && r.hora <= 10) || (r.hora >= 16 && r.hora <= 20))
    .forEach(r => { if (r.nomeMotorista) criticoMap[r.nomeMotorista] = (criticoMap[r.nomeMotorista] || 0) + 1; });
  const destCritico = Object.entries(criticoMap).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>({ nome:e[0], corridas:e[1] }));

  const constMap = {};
  finalizadas.forEach(r => {
    if (!r.nomeMotorista) return;
    if (!constMap[r.nomeMotorista]) constMap[r.nomeMotorista] = new Set();
    constMap[r.nomeMotorista].add(r.hora);
  });
  const constSorted = Object.entries(constMap).map(e=>({ nome:e[0], horas:e[1].size })).sort((a,b)=>b.horas-a.horas);
  const destConstancia = [];
  if (constSorted.length > 0) {
    destConstancia.push({ nomes: [constSorted[0].nome], horas: constSorted[0].horas });
    if (constSorted.length > 1) {
      const h2 = constSorted[1].horas;
      const tied2 = constSorted.slice(1).filter(x=>x.horas===h2).map(x=>x.nome);
      destConstancia.push({ nomes: tied2, horas: h2 });
    }
  }

  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const DIAS  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const [y, m, d] = data.split('-').map(Number);
  const dt = new Date(y, m - 1, d);

  return {
    data, dataFormatada: d + ' de ' + MESES[m - 1] + ' de ' + y,
    diaSemana: DIAS[dt.getDay()],
    total: corridas.length, finalizadas: finalizadas.length,
    taxaFinalizacao: pct(finalizadas.length),
    canceladas: canceladas.length, cancelTotalPct: pct(canceladas.length),
    cancelReais: cancelReais.length, cancelReaisPct: pct(cancelReais.length),
    naoAtendidas: naoAtendidas.length, naoAtendidasPct: pct(naoAtendidas.length),
    rechamadas, temPassageiro,
    topMotivos, horariosCancel, top3,
    destMadrugada, destCritico, destConstancia,
    fechamento: 'Bom trabalho a todos! ✅'
  };
}

// ── HTML helpers ───────────────────────────────────────────────
function _emojiMotivo(m) {
  const s = (m || '').toLowerCase();
  if (/espera|demora|tempo|atraso/.test(s))              return '⏱️';
  if (/n.o entrou|n.o embarcou|passageiro n.o/.test(s))  return '🚪';
  if (/plano|mudan|desist|cancelei|arrependeu/.test(s))  return '📅';
  if (/endere.o|local|destino|rota|errou/.test(s))       return '📍';
  if (/pre.o|valor|taxa|cobran/.test(s))                 return '💰';
  if (/segur|peri|risco/.test(s))                        return '⚠️';
  return '📋';
}
function _fmtPct(n) { return n.toFixed(1).replace('.', ',') + '%'; }

function _construirHtmlBoletim(dados) {
  var rechamadasHtml = '';
  if (dados.temPassageiro) {
    rechamadasHtml = dados.rechamadas > 0
      ? '<div class="info-box"><strong>' + dados.rechamadas + ' passageiro' + (dados.rechamadas > 1 ? 's' : '') +
        '</strong> ' + (dados.rechamadas > 1 ? 'rechamaram' : 'rechamou') + ' em até 2h e ' + (dados.rechamadas > 1 ? 'finalizaram' : 'finalizou') + '.</div>'
      : '<div class="info-box">Nenhum passageiro rechamou em até 2h.</div>';
  }

  var motivosHtml = !dados.topMotivos.length
    ? '<div style="color:#888;font-size:12px;padding:8px 0;">Sem motivos registrados.</div>'
    : dados.topMotivos.map((m, i) =>
        '<div class="cancel-row"><div class="cancel-pos">' + (i+1) + '</div>' +
        '<div class="cancel-motivo">' + _emojiMotivo(m.motivo) + ' ' + m.motivo + '</div>' +
        '<div class="cancel-qtd">' + m.qtd + '</div></div>'
      ).join('');

  var horasHtml = dados.horariosCancel.map(h =>
    '<span class="horario-tag tag-' + h.nivel + '">' + h.hora + 'h — ' + h.qtd + '</span>'
  ).join('');

  var medalhas = ['🥇','🥈','🥉'];
  var top3Html = dados.top3.map((m, i) =>
    '<div class="top-item ' + (i===0?'primeiro':'') + '">' +
    '<div class="top-emoji">' + medalhas[i] + '</div>' +
    '<div class="top-nome">' + m.nome + '</div>' +
    '<div class="top-num">' + m.corridas + '<small>corridas</small></div></div>'
  ).join('');

  var destaquesHtml = '';
  if (dados.destMadrugada) {
    destaquesHtml += '<div class="destaque-item"><div class="destaque-icon">🌙</div><div>' +
      '<div class="destaque-tipo">Madrugada (00h–05h)</div>' +
      '<div class="destaque-nome">' + dados.destMadrugada.nome + '</div>' +
      '<div class="destaque-detalhe"><strong>' + dados.destMadrugada.corridas + ' corridas</strong> nas primeiras horas do dia</div>' +
    '</div></div>';
  }
  dados.destCritico.forEach(d => {
    destaquesHtml += '<div class="destaque-item"><div class="destaque-icon">⚡</div><div>' +
      '<div class="destaque-tipo">Horário Crítico (07h–10h e 16h–20h)</div>' +
      '<div class="destaque-nome">' + d.nome + '</div>' +
      '<div class="destaque-detalhe"><strong>' + d.corridas + ' corridas</strong> nos horários de pico</div>' +
    '</div></div>';
  });
  dados.destConstancia.forEach(d => {
    var sufixo = d.nomes.length > 1 ? ' cada' : ' com corridas finalizadas';
    destaquesHtml += '<div class="destaque-item"><div class="destaque-icon">🕐</div><div>' +
      '<div class="destaque-tipo">Constância — horas distintas</div>' +
      '<div class="destaque-nome">' + d.nomes.join(' · ') + '</div>' +
      '<div class="destaque-detalhe"><strong>' + d.horas + ' horas distintas</strong>' + sufixo + '</div>' +
    '</div></div>';
  });

  var css = `  :root { --azul:#1a2f5e; --azul-escuro:#111f3e; --amarelo:#F5A800; --verde:#27ae60; --vermelho:#e74c3c; --cinza:#f4f6f9; --cinza-texto:#666; --branco:#ffffff; }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Barlow',sans-serif;background:var(--azul-escuro);min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;}
  .card{width:100%;max-width:420px;background:var(--branco);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);}
  .header{background:var(--azul);padding:24px 24px 20px;position:relative;overflow:hidden;}
  .header::before{content:'';position:absolute;top:-50px;right:-50px;width:180px;height:180px;background:rgba(245,168,0,0.1);border-radius:50%;}
  .header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;position:relative;}
  .logo-box{background:var(--amarelo);border-radius:8px;padding:6px 10px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:var(--azul);line-height:1.1;}
  .data-pill{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;}
  .header-titulo{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--amarelo);margin-bottom:4px;position:relative;}
  .header-dia{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:var(--branco);line-height:1;position:relative;}
  .secao{padding:18px 20px;border-bottom:1px solid #eee;}
  .secao:last-child{border-bottom:none;}
  .secao-label{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--amarelo);margin-bottom:12px;}
  .taxas-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .taxa-box{background:var(--cinza);border-radius:10px;padding:14px;text-align:center;border-left:4px solid var(--amarelo);}
  .taxa-box.verde{border-left-color:var(--verde);}
  .taxa-box.vermelho{border-left-color:var(--vermelho);}
  .taxa-label{font-size:10px;color:var(--cinza-texto);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;}
  .taxa-valor{font-family:'Barlow Condensed',sans-serif;font-size:34px;font-weight:900;line-height:1;color:var(--azul);}
  .taxa-valor.verde{color:var(--verde);}
  .taxa-valor.vermelho{color:var(--vermelho);}
  .taxa-sub{font-size:10px;color:var(--cinza-texto);margin-top:3px;}
  .info-box{background:#e8eef8;border-radius:8px;padding:10px 14px;font-size:12px;color:var(--azul);margin-top:12px;}
  .cancel-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;}
  .cancel-row:last-child{border-bottom:none;}
  .cancel-pos{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;color:#ddd;width:20px;flex-shrink:0;}
  .cancel-motivo{flex:1;font-size:12px;color:#444;}
  .cancel-qtd{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;color:var(--amarelo);}
  .horarios-wrap{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;}
  .horario-tag{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;}
  .tag-alto{background:#fdf0ef;color:var(--vermelho);}
  .tag-medio{background:#fff8e6;color:#b7800a;}
  .top-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;margin-bottom:6px;background:var(--cinza);}
  .top-item:last-child{margin-bottom:0;}
  .top-item.primeiro{background:#fff8e6;}
  .top-emoji{font-size:20px;flex-shrink:0;}
  .top-nome{flex:1;font-size:12px;font-weight:600;color:var(--azul);line-height:1.3;}
  .top-num{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:var(--azul);text-align:right;}
  .top-num small{display:block;font-size:9px;font-weight:400;color:var(--cinza-texto);line-height:1;}
  .destaque-item{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f0f0f0;}
  .destaque-item:last-child{border-bottom:none;}
  .destaque-icon{font-size:18px;flex-shrink:0;margin-top:1px;}
  .destaque-tipo{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--cinza-texto);margin-bottom:3px;}
  .destaque-nome{font-size:13px;font-weight:700;color:var(--azul);margin-bottom:1px;}
  .destaque-detalhe{font-size:11px;color:var(--cinza-texto);}
  .destaque-detalhe strong{color:var(--azul);}
  .fechamento{background:var(--azul);padding:18px 20px;display:flex;align-items:center;gap:12px;}
  .fechamento-emoji{font-size:24px;flex-shrink:0;}
  .fechamento-texto{font-size:13px;color:rgba(255,255,255,0.8);line-height:1.5;}`;

  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Boletim Diário — Rota 77</title>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
    '<style>\n' + css + '\n</style>\n</head>\n<body>\n<div class="card">\n' +
    '<div class="header"><div class="header-top"><div class="logo-box">ROTA<br>77</div>' +
    '<div class="data-pill">' + dados.dataFormatada + '</div></div>' +
    '<div class="header-titulo">Boletim Diário</div>' +
    '<div class="header-dia">' + dados.diaSemana + '</div></div>\n' +
    '<div class="secao"><div class="secao-label">Resultado do Dia</div><div class="taxas-grid">' +
    '<div class="taxa-box verde"><div class="taxa-label">Taxa de finalização</div><div class="taxa-valor verde">' + _fmtPct(dados.taxaFinalizacao) + '</div></div>' +
    '<div class="taxa-box verde"><div class="taxa-label">Cancel. real (2h)</div><div class="taxa-valor verde">' + _fmtPct(dados.cancelReaisPct) + '</div><div class="taxa-sub">' + dados.cancelReais + ' cancelamentos</div></div>' +
    '<div class="taxa-box vermelho"><div class="taxa-label">Cancel. total</div><div class="taxa-valor vermelho">' + _fmtPct(dados.cancelTotalPct) + '</div><div class="taxa-sub">' + dados.canceladas + ' corridas</div></div>' +
    '<div class="taxa-box"><div class="taxa-label">Não atendidas</div><div class="taxa-valor">' + _fmtPct(dados.naoAtendidasPct) + '</div><div class="taxa-sub">' + dados.naoAtendidas + ' chamadas</div></div>' +
    '</div>' + rechamadasHtml + '</div>\n' +
    '<div class="secao"><div class="secao-label">Cancelamentos Reais — Top Motivos</div>' + motivosHtml +
    (dados.horariosCancel.length ? '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--cinza-texto);margin-top:12px;margin-bottom:6px;">Horários com mais cancelamentos</div><div class="horarios-wrap">' + horasHtml + '</div>' : '') +
    '</div>\n' +
    '<div class="secao"><div class="secao-label">Top 3 — Corridas Finalizadas</div>' + top3Html + '</div>\n' +
    '<div class="secao"><div class="secao-label">Destaques</div>' + destaquesHtml + '</div>\n' +
    '<div class="fechamento"><div class="fechamento-emoji">🚗</div><div class="fechamento-texto">' + dados.fechamento + '</div></div>\n' +
    '</div>\n</body>\n</html>';
}

window.gerarBoletim    = gerarBoletim;
window.publicarBoletim = publicarBoletim;
window.processarCSVBoletim = processarCSVBoletim;
