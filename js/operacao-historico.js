// ── Histórico Operacional ─────────────────────────────────────
var _OP_HIST_KEY = 'r77_op_snapshots';

// ── Storage helpers ───────────────────────────────────────────
function _opHistLer() {
  try { return JSON.parse(localStorage.getItem(_OP_HIST_KEY) || '[]'); }
  catch(e) { return []; }
}

function _opHistSalvar(lista) {
  try {
    localStorage.setItem(_OP_HIST_KEY, JSON.stringify(lista));
    _opHistAlertarTamanho();
  } catch(e) {
    if (e.name === 'QuotaExceededError')
      mostrarToast('⚠️ Armazenamento cheio. Exporte e apague snapshots antigos.', 'erro');
    else throw e;
  }
}

function _opHistAlertarTamanho() {
  try {
    var bytes = (localStorage.getItem(_OP_HIST_KEY) || '').length * 2;
    if (bytes > 4 * 1024 * 1024) mostrarToast('⚠️ Histórico >4 MB. Considere exportar e limpar.', '');
  } catch(e) {}
}

// ── CRUD ──────────────────────────────────────────────────────
function salvarSnapshotOp() {
  if (!_opAnalise) { mostrarToast('⚠️ Nenhuma análise carregada.', 'erro'); return; }

  var a = _opAnalise;
  var snapshot = {
    id:               Date.now(),
    savedAt:          new Date().toISOString(),
    numArquivos:      (typeof _opCSVs !== 'undefined' ? _opCSVs.length : 0),
    periodo:          a.periodo,
    kpis:             a.kpis,
    picoHoras:        a.picoHoras,
    porMes:           a.porMes,
    crescimentoMensal: a.crescimentoMensal,
    topMotivos:       a.topMotivos.slice(0, 5),
    macaneta:         { total: a.macaneta.total, tipo: a.macaneta.tipo },
    motoristas:       a.motoristas.slice(0, 10),
    resumo:           a.resumo,
    payloadIA:        a.payloadIA
  };

  var lista = _opHistLer();
  lista.push(snapshot);
  _opHistSalvar(lista);
  mostrarToast('✅ Snapshot salvo! (' + lista.length + ' no histórico)', 'sucesso');

  var btnSalvar = document.getElementById('op-btn-salvar');
  if (btnSalvar) btnSalvar.textContent = '✅ Salvo (' + lista.length + ')';
}

function excluirSnapshotOp(id) {
  if (!confirm('Apagar este snapshot? Ação não pode ser desfeita.')) return;
  var lista = _opHistLer().filter(function(s) { return s.id !== id; });
  _opHistSalvar(lista);
  mostrarToast('🗑 Snapshot removido.', '');
  carregarPaginaHistoricoOp();
}

function exportarBackupOp() {
  var lista = _opHistLer();
  if (!lista.length) { mostrarToast('⚠️ Nenhum snapshot para exportar.', 'erro'); return; }
  var json = JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), snapshots: lista }, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'rota77-historico-op-' + new Date().toISOString().substring(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast('✅ Backup exportado (' + lista.length + ' snapshots)', 'sucesso');
}

function importarBackupOp(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var parsed = JSON.parse(e.target.result);
      var novos  = parsed.snapshots || parsed;
      if (!Array.isArray(novos)) throw new Error('Formato inválido');

      var existentes = _opHistLer();
      var idsExist   = existentes.map(function(s) { return s.id; });
      var merged     = existentes.concat(novos.filter(function(s) { return idsExist.indexOf(s.id) === -1; }));
      merged.sort(function(a, b) { return a.id - b.id; });
      _opHistSalvar(merged);
      mostrarToast('✅ ' + novos.length + ' snapshots importados.', 'sucesso');
      carregarPaginaHistoricoOp();
    } catch(err) {
      mostrarToast('❌ Erro ao importar: ' + err.message, 'erro');
    }
  };
  reader.readAsText(file);
}

// ── Página principal do histórico ─────────────────────────────
function carregarPaginaHistoricoOp() {
  var corpo = document.getElementById('op-hist-corpo');
  if (!corpo) return;

  var lista = _opHistLer();

  if (!lista.length) {
    corpo.innerHTML = '<div class="card"><div class="card-body" style="color:var(--cinza4);font-size:13px;padding:20px 0;">' +
      'Nenhum snapshot salvo ainda.<br><br>' +
      'Faça uma análise na aba <strong>Operação Rota 77</strong> e clique em <strong>💾 Salvar snapshot</strong>.' +
      '</div></div>';
    return;
  }

  corpo.innerHTML =
    _opHistRenderLista(lista) +
    (lista.length >= 2 ? _opHistRenderEvolucao(lista) : '') +
    '<div id="op-hist-comparacao"></div>';
}

// ── Lista de snapshots ────────────────────────────────────────
function _opHistRenderLista(lista) {
  var cards = lista.slice().reverse().map(function(s) {
    var dt     = new Date(s.savedAt);
    var dtStr  = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var taxa   = s.kpis && s.kpis.taxaFinalizacao != null ? s.kpis.taxaFinalizacao : null;
    var taxaStr = taxa != null ? taxa.toFixed(1).replace('.', ',') + '%' : '—';
    var corTaxa = taxa == null ? 'var(--cinza4)' : taxa >= 90 ? 'var(--verde)' : taxa >= 80 ? 'var(--amarelo)' : 'var(--vm)';

    return '<div style="background:var(--azul-esc);border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<input type="checkbox" class="op-hist-chk" data-id="' + s.id + '" onchange="atualizarBotaoCompararOp()" style="width:16px;height:16px;flex-shrink:0;cursor:pointer;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:600;color:var(--branco);">' + _opHistFmtPeriodo(s.periodo) + '</div>' +
        '<div style="font-size:10px;color:var(--cinza4);margin-top:2px;">' + dtStr + ' · ' + s.numArquivos + ' arquivo(s)</div>' +
      '</div>' +
      '<div style="display:flex;gap:16px;flex-shrink:0;">' +
        '<div style="text-align:center;">' +
          '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:20px;font-weight:900;color:var(--branco);">' + ((s.kpis && s.kpis.totalCorridas) || 0).toLocaleString('pt-BR') + '</div>' +
          '<div style="font-size:9px;color:var(--cinza4);text-transform:uppercase;letter-spacing:.5px;">Corridas</div>' +
        '</div>' +
        '<div style="text-align:center;">' +
          '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:20px;font-weight:900;color:' + corTaxa + ';">' + taxaStr + '</div>' +
          '<div style="font-size:9px;color:var(--cinza4);text-transform:uppercase;letter-spacing:.5px;">Taxa fin.</div>' +
        '</div>' +
      '</div>' +
      '<button onclick="excluirSnapshotOp(' + s.id + ')" style="background:none;border:1px solid var(--cinza2);border-radius:6px;color:var(--cinza4);font-size:12px;padding:5px 8px;cursor:pointer;flex-shrink:0;" title="Apagar snapshot">🗑</button>' +
    '</div>';
  }).join('');

  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">📜 Snapshots Salvos</div>' +
    '<div class="card-sub">' + lista.length + ' snapshot(s) — marque 2 para comparar</div>' +
    '</div><div class="card-body">' +
    cards +
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button id="op-hist-btn-comparar" class="btn btn-secondary btn-sm" onclick="compararSnapshotsOp()" disabled style="opacity:.4;">🔀 Comparar selecionados</button>' +
    '</div>' +
    '</div></div>';
}

function atualizarBotaoCompararOp() {
  var chks = document.querySelectorAll('.op-hist-chk:checked');
  var btn  = document.getElementById('op-hist-btn-comparar');
  if (!btn) return;
  if (chks.length === 2) {
    btn.disabled    = false;
    btn.style.opacity = '1';
  } else {
    btn.disabled    = true;
    btn.style.opacity = '.4';
  }
}

// ── Tabela de evolução ────────────────────────────────────────
function _opHistRenderEvolucao(lista) {
  var ordenada = lista.slice().sort(function(a, b) { return a.id - b.id; });
  var cols     = ['totalCorridas', 'taxaFinalizacao', 'taxaCancelamentoReal', 'kmMedio', 'macaneta'];
  var melhores = {};
  var piores   = {};

  cols.forEach(function(c) {
    var vals = ordenada.map(function(s) {
      return c === 'macaneta' ? (s.macaneta ? s.macaneta.total : null) : (s.kpis ? s.kpis[c] : null);
    }).filter(function(v) { return v != null; });
    var positiveIsBetter = c !== 'taxaCancelamentoReal' && c !== 'macaneta';
    if (vals.length) {
      melhores[c] = positiveIsBetter ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
      piores[c]   = positiveIsBetter ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
    }
  });

  var thStyle = 'font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cinza4);padding:8px 6px;';
  var header =
    '<tr>' +
    '<th style="' + thStyle + 'text-align:left;">Período</th>' +
    '<th style="' + thStyle + 'text-align:right;">Corridas</th>' +
    '<th style="' + thStyle + 'text-align:right;">Taxa Fin.</th>' +
    '<th style="' + thStyle + 'text-align:right;">% Can. Real</th>' +
    '<th style="' + thStyle + 'text-align:right;">KM Médio</th>' +
    '<th style="' + thStyle + 'text-align:right;">Maçaneta</th>' +
    '</tr>';

  var rows = ordenada.map(function(s, i) {
    var prev = i > 0 ? ordenada[i - 1] : null;
    var kpis = s.kpis || {};
    var mac  = s.macaneta ? s.macaneta.total : 0;

    function cell(val, col, fmt, positiveIsBetter) {
      var isMelhor = val != null && val === melhores[col];
      var isPior   = val != null && val === piores[col];
      var prefix   = isMelhor ? '<span title="Melhor" style="color:var(--verde);">★</span> ' :
                     isPior   ? '<span title="Pior" style="color:var(--vm);">▼</span> ' : '';
      var delta = '';
      if (prev) {
        var pVal = col === 'macaneta' ? (prev.macaneta ? prev.macaneta.total : 0) : (prev.kpis ? prev.kpis[col] : null);
        if (pVal != null && val != null) {
          if (col === 'taxaFinalizacao' || col === 'taxaCancelamentoReal')
            delta = ' ' + _opHistDeltaPpHtml(_opHistDeltaPp(pVal, val), positiveIsBetter);
          else
            delta = ' ' + _opHistDeltaHtml(_opHistDelta(pVal, val), positiveIsBetter);
        }
      }
      return '<td style="padding:8px 6px;text-align:right;font-size:12px;">' + prefix + fmt(val) + delta + '</td>';
    }

    return '<tr style="border-bottom:1px solid var(--cinza2);">' +
      '<td style="padding:8px 6px;font-size:12px;color:var(--branco);">' + _opHistFmtPeriodo(s.periodo) + '</td>' +
      cell(kpis.totalCorridas,        'totalCorridas',        function(v) { return v != null ? v.toLocaleString('pt-BR') : '—'; }, true) +
      cell(kpis.taxaFinalizacao,      'taxaFinalizacao',      function(v) { return v != null ? v.toFixed(1).replace('.', ',') + '%' : '—'; }, true) +
      cell(kpis.taxaCancelamentoReal, 'taxaCancelamentoReal', function(v) { return v != null ? v.toFixed(1).replace('.', ',') + '%' : '—'; }, false) +
      cell(kpis.kmMedio,              'kmMedio',              function(v) { return v != null ? v.toFixed(1).replace('.', ',') + ' km' : '—'; }, true) +
      cell(mac,                       'macaneta',             function(v) { return v != null ? v.toString() : '—'; }, false) +
    '</tr>';
  }).join('');

  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">📈 Evolução Histórica</div>' +
    '<div class="card-sub">★ melhor valor · ▼ pior valor · Δ variação vs. snapshot anterior</div>' +
    '</div><div class="card-body" style="padding:4px 24px 20px;overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;min-width:580px;">' +
    '<thead>' + header + '</thead><tbody>' + rows + '</tbody></table>' +
    '</div></div>';
}

// ── Comparação ────────────────────────────────────────────────
function compararSnapshotsOp() {
  var chks = Array.from(document.querySelectorAll('.op-hist-chk:checked'));
  if (chks.length !== 2) { mostrarToast('⚠️ Selecione exatamente 2 snapshots.', 'erro'); return; }

  var lista = _opHistLer();
  var id1   = parseInt(chks[0].dataset.id);
  var id2   = parseInt(chks[1].dataset.id);
  var s1    = lista.find(function(s) { return s.id === id1; });
  var s2    = lista.find(function(s) { return s.id === id2; });
  if (!s1 || !s2) return;

  if (s1.id > s2.id) { var tmp = s1; s1 = s2; s2 = tmp; }

  var el = document.getElementById('op-hist-comparacao');
  if (el) el.innerHTML = _opHistRenderComparacao(s1, s2);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _opHistRenderComparacao(s1, s2) {
  var p1 = _opHistFmtPeriodo(s1.periodo);
  var p2 = _opHistFmtPeriodo(s2.periodo);
  var k1 = s1.kpis || {};
  var k2 = s2.kpis || {};

  var thStyle = 'font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cinza4);padding:8px 6px;';

  function kpiRow(label, v1, v2, fmt, positiveIsBetter) {
    var delta = _opHistDeltaHtml(_opHistDelta(v1, v2), positiveIsBetter);
    return '<tr style="border-bottom:1px solid var(--cinza2);">' +
      '<td style="padding:9px 6px;font-size:12px;color:var(--cinza4);">' + label + '</td>' +
      '<td style="padding:9px 6px;font-size:13px;font-weight:600;color:var(--branco);text-align:right;">' + fmt(v1) + '</td>' +
      '<td style="padding:9px 6px;font-size:13px;font-weight:600;color:var(--branco);text-align:right;">' + fmt(v2) + '</td>' +
      '<td style="padding:9px 6px;text-align:right;">' + delta + '</td>' +
    '</tr>';
  }

  function ppRow(label, v1, v2, positiveIsBetter) {
    var delta = _opHistDeltaPpHtml(_opHistDeltaPp(v1, v2), positiveIsBetter);
    var fmt   = function(v) { return v != null ? v.toFixed(1).replace('.', ',') + '%' : '—'; };
    return '<tr style="border-bottom:1px solid var(--cinza2);">' +
      '<td style="padding:9px 6px;font-size:12px;color:var(--cinza4);">' + label + '</td>' +
      '<td style="padding:9px 6px;font-size:13px;font-weight:600;color:var(--branco);text-align:right;">' + fmt(v1) + '</td>' +
      '<td style="padding:9px 6px;font-size:13px;font-weight:600;color:var(--branco);text-align:right;">' + fmt(v2) + '</td>' +
      '<td style="padding:9px 6px;text-align:right;">' + delta + '</td>' +
    '</tr>';
  }

  var mac1 = s1.macaneta ? s1.macaneta.total : 0;
  var mac2 = s2.macaneta ? s2.macaneta.total : 0;

  var tabela =
    '<table style="width:100%;border-collapse:collapse;">' +
    '<thead><tr>' +
      '<th style="' + thStyle + 'text-align:left;">Indicador</th>' +
      '<th style="' + thStyle + 'text-align:right;">' + p1 + '</th>' +
      '<th style="' + thStyle + 'text-align:right;">' + p2 + '</th>' +
      '<th style="' + thStyle + 'text-align:right;">Δ</th>' +
    '</tr></thead><tbody>' +
    kpiRow('Total de corridas',  k1.totalCorridas || 0,    k2.totalCorridas || 0,    function(v) { return v.toLocaleString('pt-BR'); }, true) +
    kpiRow('Finalizadas',        k1.totalFinalizadas || 0, k2.totalFinalizadas || 0, function(v) { return v.toLocaleString('pt-BR'); }, true) +
    ppRow( 'Taxa finalização',   k1.taxaFinalizacao,       k2.taxaFinalizacao,       true) +
    kpiRow('Cancel. reais',      k1.cancelamentosReais || 0, k2.cancelamentosReais || 0, function(v) { return v.toString(); }, false) +
    ppRow( 'Taxa cancel. real',  k1.taxaCancelamentoReal,  k2.taxaCancelamentoReal,  false) +
    kpiRow('KM total',           k1.kmTotal || 0,          k2.kmTotal || 0,          function(v) { return v.toFixed(1).replace('.', ',') + ' km'; }, true) +
    kpiRow('KM médio',           k1.kmMedio || 0,          k2.kmMedio || 0,          function(v) { return v.toFixed(1).replace('.', ',') + ' km'; }, true) +
    kpiRow('Corridas maçaneta',  mac1,                     mac2,                     function(v) { return v.toString(); }, false) +
    '</tbody></table>';

  var payload = _gerarPayloadComparativo(s1, s2);

  return '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">🔀 Comparação: ' + p1 + ' vs ' + p2 + '</div>' +
    '</div><div class="card-body" style="padding:4px 24px 20px;overflow-x:auto;">' +
    tabela +
    '</div></div>' +
    '<div class="card"><div class="card-header">' +
    '<div class="card-titulo" style="font-size:17px;">🤖 Payload Comparativo</div>' +
    '<div class="card-sub">Copie e cole numa conversa com a IA</div>' +
    '</div><div class="card-body">' +
    '<textarea id="op-payload-comp" readonly style="font-family:monospace;font-size:11px;line-height:1.65;height:180px;resize:vertical;">' + payload.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>' +
    '<div class="btns-row" style="margin-top:8px;">' +
      '<button class="btn btn-secondary btn-sm" onclick="copiarPayloadComp()">📋 Copiar payload comparativo</button>' +
    '</div></div></div>';
}

function _gerarPayloadComparativo(s1, s2) {
  var p1 = _opHistFmtPeriodo(s1.periodo);
  var p2 = _opHistFmtPeriodo(s2.periodo);
  var k1 = s1.kpis || {};
  var k2 = s2.kpis || {};

  function pct(v1, v2) {
    if (!v1) return 'n/a';
    var d = (v2 - v1) / v1 * 100;
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
  }
  function pp(v1, v2) {
    var d = v2 - v1;
    return (d >= 0 ? '+' : '') + d.toFixed(1) + 'pp';
  }

  var mac1 = s1.macaneta ? s1.macaneta.total : 0;
  var mac2 = s2.macaneta ? s2.macaneta.total : 0;

  return [
    'Comparativo Rota 77: ' + p1 + ' → ' + p2,
    '',
    'KPIs:',
    '  Corridas: '    + (k1.totalCorridas || 0)    + ' → ' + (k2.totalCorridas || 0)    + ' (' + pct(k1.totalCorridas || 0, k2.totalCorridas || 0) + ')',
    '  Taxa fin.: '   + (k1.taxaFinalizacao || 0).toFixed(1)    + '% → ' + (k2.taxaFinalizacao || 0).toFixed(1)    + '% (' + pp(k1.taxaFinalizacao || 0, k2.taxaFinalizacao || 0) + ')',
    '  Can. real: '   + (k1.taxaCancelamentoReal || 0).toFixed(1) + '% → ' + (k2.taxaCancelamentoReal || 0).toFixed(1) + '% (' + pp(k1.taxaCancelamentoReal || 0, k2.taxaCancelamentoReal || 0) + ')',
    '  KM médio: '    + (k1.kmMedio || 0).toFixed(1) + ' → ' + (k2.kmMedio || 0).toFixed(1) + ' km (' + pct(k1.kmMedio || 0, k2.kmMedio || 0) + ')',
    '  Maçaneta: '    + mac1 + ' → ' + mac2,
    '',
    'Picos (período 2): ' + (s2.picoHoras || []).map(function(h) { return h.hora + 'h'; }).join(', '),
    '',
    'Top motivos cancel. (p2): ' + (s2.topMotivos || []).slice(0, 3).map(function(m) { return m.motivo + ' (' + m.qtd + ')'; }).join('; '),
    '',
    'Alertas (p2): ' + (s2.resumo && s2.resumo.alertas && s2.resumo.alertas.length ? s2.resumo.alertas.join('; ') : 'nenhum'),
  ].join('\n');
}

function copiarPayloadComp() {
  var el = document.getElementById('op-payload-comp');
  if (!el) return;
  navigator.clipboard.writeText(el.value).then(function() {
    mostrarToast('✅ Payload comparativo copiado!', 'sucesso');
  }).catch(function() {
    el.select();
    document.execCommand('copy');
    mostrarToast('✅ Payload comparativo copiado!', 'sucesso');
  });
}

// ── Helpers ───────────────────────────────────────────────────
function _opHistFmtPeriodo(periodo) {
  if (!periodo) return '—';
  if (periodo.ini === periodo.fim) return _opHistFmtIso(periodo.ini);
  return _opHistFmtIso(periodo.ini) + ' – ' + _opHistFmtIso(periodo.fim);
}

function _opHistFmtIso(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function _opHistDelta(v1, v2) {
  return { delta: v2 - v1, pct: v1 > 0 ? Math.round((v2 - v1) / v1 * 1000) / 10 : null };
}

function _opHistDeltaPp(v1, v2) {
  return { delta: Math.round((v2 - v1) * 10) / 10 };
}

function _opHistDeltaHtml(d, positiveIsBetter) {
  if (!d || d.delta == null) return '';
  var isPos  = d.delta > 0;
  var isGood = positiveIsBetter ? isPos : !isPos;
  var cor    = d.delta === 0 ? 'var(--cinza4)' : (isGood ? 'var(--verde)' : 'var(--vm)');
  var seta   = d.delta === 0 ? '' : (isPos ? ' ↑' : ' ↓');
  var pctStr = d.pct != null ? ' (' + (d.pct >= 0 ? '+' : '') + d.pct.toFixed(1).replace('.', ',') + '%)' : '';
  var sinal  = d.delta >= 0 ? '+' : '';
  return '<span style="font-size:11px;color:' + cor + ';">' + sinal + d.delta.toLocaleString('pt-BR') + pctStr + seta + '</span>';
}

function _opHistDeltaPpHtml(d, positiveIsBetter) {
  if (!d || d.delta == null) return '';
  var isGood = positiveIsBetter ? d.delta > 0 : d.delta < 0;
  var cor    = d.delta === 0 ? 'var(--cinza4)' : (isGood ? 'var(--verde)' : 'var(--vm)');
  var seta   = d.delta === 0 ? '' : (d.delta > 0 ? ' ↑' : ' ↓');
  var sinal  = d.delta >= 0 ? '+' : '';
  return '<span style="font-size:11px;color:' + cor + ';">' + sinal + d.delta.toFixed(1).replace('.', ',') + 'pp' + seta + '</span>';
}

// ── Hook: botão salvar (injected into operacao.js results) ────
function _opRenderBotaoSalvar() {
  return '<div class="card"><div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:14px;font-weight:600;color:var(--branco);">💾 Salvar análise no histórico</div>' +
      '<div style="font-size:11px;color:var(--cinza4);margin-top:3px;">Salva um snapshot desta análise para consultar e comparar depois.</div>' +
    '</div>' +
    '<button id="op-btn-salvar" class="btn btn-secondary btn-sm" onclick="salvarSnapshotOp()">💾 Salvar snapshot</button>' +
  '</div></div>';
}

// ── Exports ───────────────────────────────────────────────────
window.salvarSnapshotOp          = salvarSnapshotOp;
window.excluirSnapshotOp         = excluirSnapshotOp;
window.exportarBackupOp          = exportarBackupOp;
window.importarBackupOp          = importarBackupOp;
window.carregarPaginaHistoricoOp = carregarPaginaHistoricoOp;
window.compararSnapshotsOp       = compararSnapshotsOp;
window.atualizarBotaoCompararOp  = atualizarBotaoCompararOp;
window.copiarPayloadComp         = copiarPayloadComp;
window._opRenderBotaoSalvar      = _opRenderBotaoSalvar;
