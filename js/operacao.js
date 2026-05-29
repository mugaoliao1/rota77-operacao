// ── Operação Rota 77 ──────────────────────────────────────────
var _opCSVs    = [];
var _opAnalise = null;

// ── Upload ────────────────────────────────────────────────────
function processarCSVsOperacao(files) {
  _opCSVs = [];
  window.dadosImportados = null;
  var cardQE = document.getElementById('card-conversa-dados');
  if (cardQE) cardQE.style.display = 'none';
  if (typeof window.qeLimparContexto === 'function') window.qeLimparContexto();
  var arr = Array.from(files);
  if (!arr.length) return;

  var carregados = 0;
  document.getElementById('op-info').textContent = 'Lendo ' + arr.length + ' arquivo(s)...';
  document.getElementById('btn-analisar-op').disabled = true;

  arr.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var r = parsearCSV(e.target.result);
        if (r.todasCorridas.length) _opCSVs.push(r.todasCorridas);
      } catch(err) {
        console.warn('[operacao] Erro em ' + file.name, err);
      }
      carregados++;
      if (carregados === arr.length) _finalizarCarregamentoOp(arr.length);
    };
    reader.onerror = function() {
      carregados++;
      if (carregados === arr.length) _finalizarCarregamentoOp(arr.length);
    };
    reader.readAsText(file, 'latin1');
  });
}

function _finalizarCarregamentoOp(total) {
  var todas = _opCSVs.reduce(function(a, b) { return a.concat(b); }, []);
  if (!todas.length) {
    mostrarToast('⚠️ Nenhuma corrida encontrada nos arquivos.', 'erro');
    document.getElementById('op-info').textContent = 'Nenhuma corrida encontrada.';
    return;
  }
  var datas = Array.from(new Set(todas.map(function(c) { return c.data; }))).sort();
  var ini   = datas[0];
  var fim   = datas[datas.length - 1];
  document.getElementById('op-info').textContent =
    '✅ ' + total + ' arquivo(s) — ' + todas.length.toLocaleString('pt-BR') + ' corridas · ' +
    datas.length + ' dia(s): ' + _opFmt(ini) + ' a ' + _opFmt(fim);
  document.getElementById('op-periodo-ini').value = ini;
  document.getElementById('op-periodo-fim').value = fim;
  document.getElementById('btn-analisar-op').disabled = false;
  mostrarToast('✅ ' + total + ' arquivo(s) carregado(s).', 'sucesso');

  // Bridge: expõe dados no formato esperado pelo motor de consulta (Fases 3 e 4)
  var _qeMet = {}, _qeMot = {};
  todas.filter(function(c) { return c.statusNorm === 'finalizada'; }).forEach(function(c) {
    if (!_qeMet[c.data]) _qeMet[c.data] = { corridas:0, km:0, tempo_min:0 };
    _qeMet[c.data].corridas++;
    _qeMet[c.data].km += (c.km || 0);
    _qeMet[c.data].tempo_min += (c.tempo || 0);
    if (c.nomeMotorista) {
      if (!_qeMot[c.nomeMotorista]) _qeMot[c.nomeMotorista] = { corridas:0, km:0 };
      _qeMot[c.nomeMotorista].corridas++;
      _qeMot[c.nomeMotorista].km += (c.km || 0);
    }
  });
  window.dadosImportados = { todasCorridas: todas, metricas: _qeMet, motoristas: _qeMot };
}

// ── Análise ───────────────────────────────────────────────────
function analisarOperacao() {
  var todas = _opCSVs.reduce(function(a, b) { return a.concat(b); }, []);
  if (!todas.length) { mostrarToast('❌ Carregue os CSVs primeiro.', 'erro'); return; }
  var ini = document.getElementById('op-periodo-ini').value;
  var fim = document.getElementById('op-periodo-fim').value;
  if (!ini || !fim)   { mostrarToast('❌ Defina o período.', 'erro'); return; }
  if (fim < ini)      { mostrarToast('❌ Data fim deve ser ≥ início.', 'erro'); return; }

  var btn = document.getElementById('btn-analisar-op');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analisando...'; }

  // defer para não travar UI
  setTimeout(function() {
    try {
      _opAnalise = calcularOperacao(todas, ini, fim);
      _renderizarResultados(_opAnalise);
      var res = document.getElementById('op-resultados');
      res.style.display = 'block';
      res.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var cardQE = document.getElementById('card-conversa-dados');
      if (cardQE) cardQE.style.display = 'block';
    } catch(e) {
      console.error('[operacao/analisar]', e);
      mostrarToast('❌ Erro na análise: ' + e.message, 'erro');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Analisar'; }
    }
  }, 30);
}

// ── Cálculo central ───────────────────────────────────────────
function calcularOperacao(todas, ini, fim) {
  var corridas     = todas.filter(function(c) { return c.data >= ini && c.data <= fim; });
  if (!corridas.length) throw new Error('Nenhuma corrida no período selecionado.');

  var finalizadas  = corridas.filter(function(c) { return c.statusNorm === 'finalizada'; });
  var canceladas   = corridas.filter(function(c) { return c.statusNorm.includes('cancelad'); });
  var naoAtendidas = corridas.filter(function(c) {
    return c.statusNorm.includes('não atendid') || c.statusNorm.includes('nao atendid') ||
           c.statusNorm.includes('expirad')     || c.statusNorm.includes('sem motorista');
  });
  var total = corridas.length || 1;

  // ── Cancel real ──
  var cancelRes     = _opCancelReais(canceladas, finalizadas);
  var cancelReais   = cancelRes.reais;
  var rechamadas    = cancelRes.rechamadas;

  // ── KPIs ──
  var datasSet = Array.from(new Set(corridas.map(function(c) { return c.data; }))).sort();
  var motAtivos = new Set(
    finalizadas.filter(function(c) { return c.nomeMotorista; }).map(function(c) { return c.nomeMotorista; })
  ).size;

  var kpis = {
    total:           corridas.length,
    finalizadas:     finalizadas.length,
    canceladas:      canceladas.length,
    canceladasReal:  cancelReais.length,
    rechamadas:      rechamadas,
    naoAtendidas:    naoAtendidas.length,
    taxaFin:         _opPct(finalizadas.length, total),
    taxaCancel:      _opPct(canceladas.length, total),
    taxaCancelReal:  _opPct(cancelReais.length, total),
    mediaDiaria:     Math.round(corridas.length / (datasSet.length || 1)),
    motoristasAtivos: motAtivos
  };

  // ── Por dia ──
  var porDia = datasSet.map(function(data) {
    var dc   = corridas.filter(function(c) { return c.data === data; });
    var df   = dc.filter(function(c) { return c.statusNorm === 'finalizada'; });
    var dcan = dc.filter(function(c) { return c.statusNorm.includes('cancelad'); });
    return { data: data, total: dc.length, finalizadas: df.length, canceladas: dcan.length,
             taxaFin: _opPct(df.length, dc.length || 1) };
  });

  // ── Por hora ──
  var porHora = [];
  for (var h = 0; h < 24; h++) {
    var hc   = corridas.filter(function(c) { return c.hora === h; });
    var hf   = hc.filter(function(c) { return c.statusNorm === 'finalizada'; });
    var hcan = hc.filter(function(c) { return c.statusNorm.includes('cancelad'); });
    porHora.push({ hora: h, total: hc.length, finalizadas: hf.length, canceladas: hcan.length });
  }
  var maxHora   = Math.max.apply(null, porHora.map(function(h) { return h.total; })) || 1;
  var picoHoras = porHora.slice().sort(function(a, b) { return b.total - a.total; })
                    .slice(0, 5).filter(function(h) { return h.total > 0; });

  // ── Por mês ──
  var mesesMap = {};
  corridas.forEach(function(c) {
    var mes = c.data.substring(0, 7);
    if (!mesesMap[mes]) mesesMap[mes] = { total: 0, finalizadas: 0 };
    mesesMap[mes].total++;
    if (c.statusNorm === 'finalizada') mesesMap[mes].finalizadas++;
  });
  var MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var porMes = Object.keys(mesesMap).sort().map(function(mes) {
    var v = mesesMap[mes], parts = mes.split('-');
    return { mes: mes, label: MESES_PT[parseInt(parts[1]) - 1] + '/' + parts[0].slice(2),
             total: v.total, finalizadas: v.finalizadas, taxaFin: _opPct(v.finalizadas, v.total || 1) };
  });
  var crescimentoMensal = null;
  if (porMes.length >= 2) {
    var ult = porMes[porMes.length - 1], ant = porMes[porMes.length - 2];
    if (ant.total > 0) crescimentoMensal = Math.round((ult.total - ant.total) / ant.total * 1000) / 10;
  }

  // ── Motoristas ──
  var motMap = {};
  finalizadas.forEach(function(c) {
    if (!c.nomeMotorista) return;
    if (!motMap[c.nomeMotorista]) motMap[c.nomeMotorista] = { finalizadas: 0, cancelamentos: 0, km: 0 };
    motMap[c.nomeMotorista].finalizadas++;
    motMap[c.nomeMotorista].km += (c.km || 0);
  });
  canceladas.forEach(function(c) {
    if (!c.nomeMotorista) return;
    if (!motMap[c.nomeMotorista]) motMap[c.nomeMotorista] = { finalizadas: 0, cancelamentos: 0, km: 0 };
    motMap[c.nomeMotorista].cancelamentos++;
  });
  var motoristas = Object.entries(motMap).map(function(e) {
    var v = e[1], tot2 = v.finalizadas + v.cancelamentos;
    return { nome: e[0], finalizadas: v.finalizadas, cancelamentos: v.cancelamentos,
             taxaCancelamento: _opPct(v.cancelamentos, tot2 || 1),
             km: Math.round(v.km * 10) / 10 };
  }).sort(function(a, b) { return b.finalizadas - a.finalizadas; });

  // ── Maçaneta ──
  var macaneta = _opMacaneta(corridas);

  // ── Top motivos ──
  var motivosMap = {};
  canceladas.forEach(function(c) {
    var m = (c.motivo || '').trim() || 'Outros';
    motivosMap[m] = (motivosMap[m] || 0) + 1;
  });
  var topMotivos = Object.entries(motivosMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 8)
    .map(function(e) { return { motivo: e[0], qtd: e[1], pct: _opPct(e[1], canceladas.length || 1) }; });

  var analise = {
    periodo: { inicio: ini, fim: fim, totalDias: datasSet.length,
               label: _opFmt(ini) + ' a ' + _opFmt(fim) },
    kpis: kpis, porDia: porDia, porHora: porHora, maxHora: maxHora,
    picoHoras: picoHoras, porMes: porMes, crescimentoMensal: crescimentoMensal,
    motoristas: motoristas, macaneta: macaneta, topMotivos: topMotivos
  };
  analise.resumo    = _opResumo(analise);
  analise.payloadIA = _opPayload(analise);
  return analise;
}

// ── Helpers de cálculo ────────────────────────────────────────
function _opPct(n, d) { return d > 0 ? Math.round(n / d * 1000) / 10 : 0; }

function _opCancelReais(canceladas, finalizadas) {
  var temPass = canceladas.some(function(c) { return c.passageiro; });
  if (!temPass) return { reais: canceladas, rechamadas: 0 };
  var reais = canceladas.filter(function(c) {
    if (!c.passageiro) return true;
    var lim = c.momentoMs + 7200000;
    return !finalizadas.some(function(f) {
      return f.passageiro === c.passageiro && f.momentoMs > c.momentoMs && f.momentoMs <= lim;
    });
  });
  return { reais: reais, rechamadas: canceladas.length - reais.length };
}

function _opMacaneta(corridas) {
  // Prioridade: canceladas com motorista atribuído (aceitou e cancelou)
  var lista = corridas.filter(function(c) {
    return c.statusNorm.includes('cancelad') && c.nomeMotorista;
  });
  var tipo = 'cancelada_com_motorista';
  // Fallback: finalizadas curtíssimas (< 0,5 km)
  if (!lista.length) {
    lista = corridas.filter(function(c) {
      return c.statusNorm === 'finalizada' && (c.km || 0) > 0 && (c.km || 0) < 0.5;
    });
    tipo = 'finalizada_curta';
  }
  var porMot = {};
  lista.forEach(function(c) {
    if (c.nomeMotorista) porMot[c.nomeMotorista] = (porMot[c.nomeMotorista] || 0) + 1;
  });
  var rankMot = Object.entries(porMot).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
  return { total: lista.length, tipo: tipo, rankMot: rankMot };
}

function _opResumo(a) {
  var k = a.kpis, destaques = [], alertas = [], criticos = [];

  if (k.taxaFin >= 85)             destaques.push('Taxa de finalização de ' + _opFmtPct(k.taxaFin) + ' — acima da meta operacional.');
  if (k.rechamadas > 0)            destaques.push(k.rechamadas + ' passageiro(s) rechamou em até 2h e finalizou — bom sinal de retenção.');
  if (a.crescimentoMensal > 0)     destaques.push('Crescimento de +' + a.crescimentoMensal + '% em relação ao mês anterior.');
  if (a.motoristas.length && a.motoristas[0].finalizadas >= 10)
    destaques.push('Melhor motorista: ' + a.motoristas[0].nome + ' — ' + a.motoristas[0].finalizadas + ' corridas finalizadas.');
  if (k.motoristasAtivos >= 5)     destaques.push(k.motoristasAtivos + ' motoristas ativos no período.');

  if (k.taxaFin < 75)              alertas.push('Taxa de finalização abaixo de 75% (' + _opFmtPct(k.taxaFin) + ') — requer ação imediata.');
  if (k.taxaCancelReal > 15)       alertas.push('Cancelamento real acima de 15% (' + _opFmtPct(k.taxaCancelReal) + ') — avaliar causas.');
  if (a.macaneta.total > 5)        alertas.push(a.macaneta.total + ' corridas maçaneta — verificar padrão de cancelamento por motorista.');
  if (a.crescimentoMensal !== null && a.crescimentoMensal < -10)
    alertas.push('Queda de ' + Math.abs(a.crescimentoMensal) + '% em relação ao mês anterior.');

  if (k.naoAtendidas > 0)          criticos.push(k.naoAtendidas + ' corridas não atendidas (' + _opFmtPct(_opPct(k.naoAtendidas, k.total)) + ') — demanda descoberta.');
  if (a.topMotivos.length)         criticos.push('Principal motivo de cancelamento: "' + a.topMotivos[0].motivo + '" — ' + a.topMotivos[0].qtd + ' ocorrências.');
  var altaCancel = a.motoristas.filter(function(m) { return m.cancelamentos >= 5 && m.taxaCancelamento > 30; });
  if (altaCancel.length)           criticos.push(altaCancel.length + ' motorista(s) com taxa de cancelamento >30% — avaliar treinamento.');

  if (!destaques.length) destaques.push(k.total.toLocaleString('pt-BR') + ' corridas analisadas no período ' + a.periodo.label + '.');
  return { destaques: destaques, alertas: alertas, criticos: criticos };
}

function _opPayload(a) {
  var k   = a.kpis;
  var pic = a.picoHoras.map(function(h) { return h.hora + 'h(' + h.total + ')'; }).join(' ');
  var mot = a.motoristas.slice(0, 3).map(function(m) { return m.nome + '(' + m.finalizadas + ')'; }).join(', ');
  var mot2 = a.motoristas.slice(0, 3).map(function(m) { return m.nome + '(can:' + m.cancelamentos + '/' + _opFmtPct(m.taxaCancelamento) + ')'; }).join(', ');
  var mts = a.topMotivos.slice(0, 3).map(function(m) { return '"' + m.motivo + '"(' + m.qtd + ')'; }).join(', ');
  var alts = a.resumo.alertas.concat(a.resumo.criticos).join(' | ');
  var cres = a.crescimentoMensal !== null ? 'Cresc.mensal: ' + (a.crescimentoMensal >= 0 ? '+' : '') + a.crescimentoMensal + '%. ' : '';
  var mac  = a.macaneta.total > 0 ? 'Maçaneta: ' + a.macaneta.total + '. ' : '';

  return 'ROTA 77 | ' + a.periodo.label + ' | ' + a.periodo.totalDias + ' dias\n' +
    'Total: ' + k.total + ' | Fin: ' + k.finalizadas + ' (' + _opFmtPct(k.taxaFin) + ') | Can: ' + k.canceladas + ' (' + _opFmtPct(k.taxaCancel) + ') | CanReal: ' + k.canceladasReal + ' (' + _opFmtPct(k.taxaCancelReal) + ')\n' +
    'NãoAtend: ' + k.naoAtendidas + ' | Recham: ' + k.rechamadas + ' | MotAtivos: ' + k.motoristasAtivos + ' | Média/dia: ' + k.mediaDiaria + '\n' +
    (pic  ? 'Picos: ' + pic + '\n' : '') +
    (mot  ? 'Top motor. (fin): ' + mot + '\n' : '') +
    (mot2 ? 'Top motor. (can): ' + mot2 + '\n' : '') +
    (mts  ? 'Motivos cancel.: ' + mts + '\n' : '') +
    cres + mac +
    (alts ? 'ALERTAS: ' + alts : '');
}

// ── Renderização ──────────────────────────────────────────────
function _renderizarResultados(a) {
  document.getElementById('op-resultados').innerHTML =
    _opRenderKpis(a.kpis, a.periodo) +
    _opRenderPorHora(a.porHora, a.maxHora, a.picoHoras) +
    _opRenderPorDia(a.porDia) +
    (a.porMes.length >= 2 ? _opRenderCrescimento(a.porMes, a.crescimentoMensal) : '') +
    _opRenderMotoristas(a.motoristas) +
    _opRenderTopMotivos(a.topMotivos) +
    _opRenderMacaneta(a.macaneta) +
    _opRenderResumo(a.resumo) +
    _opRenderPayload(a.payloadIA) +
    (typeof _opRenderBotaoSalvar === 'function' ? _opRenderBotaoSalvar() : '');
}

function _opKpiBox(val, label, bordaCor) {
  return '<div style="background:var(--azul-esc);border-radius:10px;padding:14px;text-align:center;border-top:3px solid ' + (bordaCor || 'var(--cinza2)') + ';">' +
    '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:26px;font-weight:900;color:var(--branco);line-height:1;">' + val + '</div>' +
    '<div style="font-size:9px;color:var(--cinza4);text-transform:uppercase;letter-spacing:.8px;margin-top:4px;">' + label + '</div>' +
  '</div>';
}

function _opRenderKpis(k, p) {
  var finCor    = k.taxaFin >= 85 ? 'var(--verde)' : k.taxaFin >= 75 ? 'var(--amarelo)' : 'var(--vm)';
  var cancelCor = k.taxaCancelReal > 15 ? 'var(--vm)' : k.taxaCancelReal > 8 ? 'var(--amarelo)' : 'var(--cinza2)';
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">📊 KPIs do Período</div>' +
    '<div class="card-sub">' + p.label + ' · ' + k.total.toLocaleString('pt-BR') + ' corridas · ' + p.totalDias + ' dia(s) · ' + k.mediaDiaria + '/dia</div>' +
    '</div><div class="card-body">' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">' +
      _opKpiBox(k.finalizadas.toLocaleString('pt-BR'), 'Finalizadas', 'var(--verde)') +
      _opKpiBox(_opFmtPct(k.taxaFin), 'Taxa Fin.', finCor) +
      _opKpiBox(k.motoristasAtivos.toLocaleString('pt-BR'), 'Mot. Ativos', 'var(--amarelo)') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">' +
      _opKpiBox(k.canceladasReal.toLocaleString('pt-BR'), 'Cancel. Real', 'var(--vm)') +
      _opKpiBox(_opFmtPct(k.taxaCancelReal), 'Taxa Cancel. Real', cancelCor) +
      _opKpiBox(k.rechamadas.toLocaleString('pt-BR'), 'Rechamadas', k.rechamadas > 0 ? 'var(--verde)' : 'var(--cinza2)') +
    '</div>' +
    (k.naoAtendidas > 0
      ? '<div style="margin-top:10px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--vm);">⚠️ ' + k.naoAtendidas + ' corridas não atendidas (' + _opFmtPct(_opPct(k.naoAtendidas, k.total)) + ') — demanda sem cobertura</div>'
      : '') +
    '</div></div>';
}

function _opRenderPorHora(porHora, maxHora, picoHoras) {
  var picoSet = {};
  picoHoras.forEach(function(h) { picoSet[h.hora] = true; });

  var barsHtml = porHora.map(function(h) {
    var pctH    = Math.round(h.total / maxHora * 100);
    var finPct  = h.total > 0 ? Math.round(h.finalizadas / h.total * 100) : 0;
    var isPico  = picoSet[h.hora];
    var bgBar   = isPico ? 'rgba(245,168,0,.25)' : 'rgba(255,255,255,.08)';
    var bgFin   = isPico ? 'var(--amarelo)' : 'rgba(39,174,96,.65)';
    var lblCor  = isPico ? 'var(--amarelo)' : 'var(--cinza3)';
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;" ' +
      'title="' + h.hora + 'h: ' + h.total + ' total · ' + h.finalizadas + ' fin. · ' + h.canceladas + ' can.">' +
      '<div style="height:64px;width:100%;display:flex;align-items:flex-end;">' +
        '<div style="width:100%;height:' + pctH + '%;background:' + bgBar + ';border-radius:3px 3px 0 0;position:relative;min-height:' + (h.total > 0 ? '2' : '0') + 'px;">' +
          '<div style="position:absolute;bottom:0;left:0;right:0;height:' + finPct + '%;background:' + bgFin + ';border-radius:3px 3px 0 0;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:7px;color:' + lblCor + ';font-weight:' + (isPico ? '700' : '400') + ';">' + h.hora + '</div>' +
    '</div>';
  }).join('');

  var picoStr = picoHoras.map(function(h) { return h.hora + 'h (' + h.total + ')'; }).join(' · ');

  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">🕐 Corridas por Hora</div>' +
    (picoStr ? '<div class="card-sub">Picos: ' + picoStr + '</div>' : '') +
    '</div><div class="card-body">' +
    '<div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px;">' + barsHtml + '</div>' +
    '<div style="display:flex;gap:14px;margin-top:10px;">' +
      '<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;background:rgba(39,174,96,.65);border-radius:2px;"></div><span style="font-size:10px;color:var(--cinza4);">Finalizadas</span></div>' +
      '<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;background:var(--amarelo);border-radius:2px;"></div><span style="font-size:10px;color:var(--cinza4);">Pico (top 5)</span></div>' +
    '</div>' +
    '</div></div>';
}

function _opRenderPorDia(porDia) {
  if (!porDia.length) return '';
  var rows = porDia.map(function(d) {
    var cor = d.taxaFin >= 90 ? 'var(--verde)' : d.taxaFin >= 80 ? 'var(--amarelo)' : 'var(--vm)';
    return '<tr style="border-bottom:1px solid var(--cinza2);">' +
      '<td style="padding:7px 6px;font-size:12px;color:var(--branco);">' + _opFmt(d.data) + '</td>' +
      '<td style="padding:7px 6px;font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:900;color:var(--branco);text-align:right;">' + d.total + '</td>' +
      '<td style="padding:7px 6px;font-size:12px;color:var(--verde);text-align:right;">' + d.finalizadas + '</td>' +
      '<td style="padding:7px 6px;font-size:12px;color:var(--vm);text-align:right;">' + d.canceladas + '</td>' +
      '<td style="padding:7px 6px;text-align:right;"><span style="font-size:11px;font-weight:700;color:' + cor + ';">' + _opFmtPct(d.taxaFin) + '</span></td>' +
    '</tr>';
  }).join('');

  var th = function(label, align) {
    return '<th style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cinza4);padding:8px 6px;text-align:' + (align||'left') + ';">' + label + '</th>';
  };
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">📅 Corridas por Dia</div>' +
    '<div class="card-sub">' + porDia.length + ' dia(s) com dados</div>' +
    '</div><div class="card-body" style="padding:4px 24px 20px;max-height:400px;overflow-y:auto;">' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<thead><tr>' + th('Data') + th('Total','right') + th('Fin.','right') + th('Can.','right') + th('Taxa','right') + '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div></div>';
}

function _opRenderCrescimento(porMes, crescimento) {
  var maxTotal = Math.max.apply(null, porMes.map(function(x) { return x.total; })) || 1;
  var barsHtml = porMes.map(function(m, idx) {
    var pct    = Math.round(m.total / maxTotal * 100);
    var finPct = m.total > 0 ? Math.round(m.finalizadas / m.total * 100) : 0;
    var isUlt  = idx === porMes.length - 1;
    return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
      '<div style="font-size:10px;font-weight:700;color:' + (isUlt ? 'var(--amarelo)' : 'var(--cinza4)') + ';">' + m.total + '</div>' +
      '<div style="width:100%;height:70px;display:flex;align-items:flex-end;">' +
        '<div style="width:100%;height:' + pct + '%;background:' + (isUlt ? 'rgba(245,168,0,.2)' : 'rgba(255,255,255,.08)') + ';border-radius:4px 4px 0 0;position:relative;">' +
          '<div style="position:absolute;bottom:0;left:0;right:0;height:' + finPct + '%;background:' + (isUlt ? 'var(--amarelo)' : 'rgba(39,174,96,.5)') + ';border-radius:4px 4px 0 0;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:9px;color:var(--cinza4);text-align:center;white-space:nowrap;">' + m.label + '</div>' +
    '</div>';
  }).join('');

  var crescHtml = crescimento !== null
    ? '<div style="text-align:center;margin-top:14px;">' +
      '<span style="font-family:\'Barlow Condensed\',sans-serif;font-size:28px;font-weight:900;color:' + (crescimento >= 0 ? 'var(--verde)' : 'var(--vm)') + ';">' + (crescimento >= 0 ? '+' : '') + crescimento + '%</span>' +
      '<span style="font-size:12px;color:var(--cinza4);margin-left:8px;">vs mês anterior</span></div>'
    : '';

  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">📈 Crescimento Mensal</div>' +
    '</div><div class="card-body">' +
    '<div style="display:flex;gap:6px;align-items:flex-end;">' + barsHtml + '</div>' + crescHtml +
    '</div></div>';
}

function _opRenderMotoristas(motoristas) {
  if (!motoristas.length) return '';
  var medalhas = ['🥇','🥈','🥉'];
  var rows = motoristas.slice(0, 25).map(function(m, i) {
    var corCan = m.taxaCancelamento > 30 ? 'var(--vm)' : m.taxaCancelamento > 15 ? 'var(--amarelo)' : 'var(--cinza4)';
    return '<tr style="border-bottom:1px solid var(--cinza2);">' +
      '<td style="padding:8px 6px;font-size:14px;">' + (i < 3 ? medalhas[i] : '<span style="font-size:11px;color:var(--cinza4);">' + (i+1) + '</span>') + '</td>' +
      '<td style="padding:8px 6px;font-size:12px;font-weight:600;color:var(--branco);">' + m.nome + '</td>' +
      '<td style="padding:8px 6px;font-family:\'Barlow Condensed\',sans-serif;font-size:18px;font-weight:900;color:var(--verde);text-align:right;">' + m.finalizadas + '</td>' +
      '<td style="padding:8px 6px;font-size:12px;color:var(--vm);text-align:right;">' + m.cancelamentos + '</td>' +
      '<td style="padding:8px 6px;font-size:11px;font-weight:700;color:' + corCan + ';text-align:right;">' + _opFmtPct(m.taxaCancelamento) + '</td>' +
      '<td style="padding:8px 6px;font-size:11px;color:var(--cinza4);text-align:right;">' + m.km + ' km</td>' +
    '</tr>';
  }).join('');

  var th = function(label, align) {
    return '<th style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cinza4);padding:8px 6px;text-align:' + (align||'left') + ';">' + label + '</th>';
  };
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">👨‍💼 Motoristas</div>' +
    '<div class="card-sub">' + motoristas.length + ' motorista(s) ativo(s) — top ' + Math.min(motoristas.length, 25) + ' por corridas finalizadas</div>' +
    '</div><div class="card-body" style="padding:4px 24px 20px;max-height:460px;overflow-y:auto;">' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<thead><tr>' + th('#') + th('Nome') + th('Fin.','right') + th('Can.','right') + th('% Can.','right') + th('KM','right') + '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div></div>';
}

function _opRenderTopMotivos(topMotivos) {
  if (!topMotivos.length) return '';
  var maxQtd = topMotivos[0].qtd || 1;
  var rows = topMotivos.map(function(m, i) {
    var barW = Math.round(m.qtd / maxQtd * 100);
    return '<div style="padding:9px 0;border-bottom:1px solid var(--cinza2);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">' +
        '<span style="font-size:12px;color:var(--branco);">' + (i+1) + '. ' + m.motivo + '</span>' +
        '<span style="font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:900;color:var(--amarelo);margin-left:8px;flex-shrink:0;">' + m.qtd + '</span>' +
      '</div>' +
      '<div style="height:4px;background:var(--cinza2);border-radius:2px;">' +
        '<div style="height:100%;width:' + barW + '%;background:var(--amarelo);border-radius:2px;"></div>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">❌ Motivos de Cancelamento</div>' +
    '</div><div class="card-body">' + rows + '</div></div>';
}

function _opRenderMacaneta(mac) {
  var tipoLabel = mac.tipo === 'cancelada_com_motorista'
    ? 'Canceladas com motorista atribuído (aceitou e cancelou)'
    : 'Finalizadas com menos de 0,5 km';
  var body;
  if (!mac.total) {
    body = '<div style="color:var(--cinza4);font-size:13px;">Nenhuma corrida maçaneta detectada.</div>';
  } else {
    var listHtml = mac.rankMot.map(function(e) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--cinza2);">' +
        '<span style="font-size:12px;color:var(--branco);">' + e[0] + '</span>' +
        '<span style="font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:900;color:var(--vm);">' + e[1] + '</span>' +
      '</div>';
    }).join('');
    body = (mac.rankMot.length ? '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--amarelo);margin-bottom:6px;">Por motorista</div>' + listHtml : '');
  }
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">🚪 Corridas Maçaneta</div>' +
    '<div class="card-sub">' + tipoLabel + (mac.total ? ' — ' + mac.total + ' ocorrências' : '') + '</div>' +
    '</div><div class="card-body">' + body + '</div></div>';
}

function _opRenderResumo(resumo) {
  function secao(titulo, arr, cor, icon) {
    if (!arr.length) return '';
    var items = arr.map(function(s) {
      return '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);">' +
        '<span style="font-size:13px;flex-shrink:0;margin-top:1px;">' + icon + '</span>' +
        '<span style="font-size:12px;color:' + cor + ';line-height:1.55;">' + s + '</span>' +
      '</div>';
    }).join('');
    return '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--amarelo);margin-top:14px;margin-bottom:4px;">' + titulo + '</div>' + items;
  }
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">📋 Resumo Executivo</div>' +
    '</div><div class="card-body">' +
    secao('Destaques',       resumo.destaques, '#7edbac', '✅') +
    secao('Alertas',         resumo.alertas,   'var(--amarelo)', '⚠️') +
    secao('Pontos Críticos', resumo.criticos,  'var(--vm)', '🔴') +
    '</div></div>';
}

function _opRenderPayload(payloadIA) {
  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">🤖 Payload para IA</div>' +
    '<div class="card-sub">Copie e cole numa conversa com a IA para análise aprofundada</div>' +
    '</div><div class="card-body">' +
    '<textarea id="op-payload-ia" readonly style="font-family:monospace;font-size:11px;line-height:1.65;height:150px;resize:vertical;">' + payloadIA.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea>' +
    '<div class="btns-row" style="margin-top:8px;">' +
      '<button class="btn btn-secondary btn-sm" onclick="copiarPayloadIA()">📋 Copiar payload</button>' +
    '</div>' +
    '</div></div>';
}

// ── Helpers de formatação ─────────────────────────────────────
function _opFmt(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
function _opFmtPct(n) {
  return n.toFixed(1).replace('.', ',') + '%';
}

// ── Copiar payload ────────────────────────────────────────────
function copiarPayloadIA() {
  var el = document.getElementById('op-payload-ia');
  if (!el) return;
  navigator.clipboard.writeText(el.value).then(function() {
    mostrarToast('✅ Payload copiado!', 'sucesso');
  }).catch(function() {
    el.select();
    document.execCommand('copy');
    mostrarToast('✅ Payload copiado!', 'sucesso');
  });
}

// ── Exports ───────────────────────────────────────────────────
window.processarCSVsOperacao = processarCSVsOperacao;
window.analisarOperacao      = analisarOperacao;
window.calcularOperacao      = calcularOperacao;
window.copiarPayloadIA       = copiarPayloadIA;
