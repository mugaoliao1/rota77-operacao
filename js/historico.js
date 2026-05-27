// ── Módulo Histórico ─────────────────────────────────────────

// ── Upload e processamento de múltiplos CSVs ──────────────────
function processarArquivosHistorico(files) {
  var arr = Array.from(files);
  if (!arr.length) return;

  _histSetUI({ progresso: true, pct: 0, msg: 'Lendo ' + arr.length + ' arquivo(s)...' });
  document.getElementById('hist-resumo').style.display = 'none';

  var corridasPorData = {};
  var lidos = 0;
  var erros = 0;

  arr.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var resultado = parsearCSV(e.target.result);
        resultado.todasCorridas.forEach(function(c) {
          if (!corridasPorData[c.data]) corridasPorData[c.data] = [];
          corridasPorData[c.data].push(c);
        });
      } catch(err) {
        console.warn('[historico] Erro em ' + file.name, err);
        erros++;
      }
      lidos++;
      _histSetUI({ pct: Math.round(lidos / arr.length * 50), msg: 'Lendo (' + lidos + '/' + arr.length + ')...' });
      if (lidos === arr.length) _salvarHistoricoFirebase(corridasPorData, arr.length, erros);
    };
    reader.onerror = function() {
      lidos++; erros++;
      if (lidos === arr.length) _salvarHistoricoFirebase(corridasPorData, arr.length, erros);
    };
    reader.readAsText(file, 'latin1');
  });
}

async function _salvarHistoricoFirebase(corridasPorData, numArquivos, numErros) {
  var datas = Object.keys(corridasPorData).sort();
  if (!datas.length) {
    mostrarToast('⚠️ Nenhuma corrida encontrada.', 'erro');
    _histSetUI({ pct: 0, msg: 'Nenhuma corrida encontrada.' });
    return;
  }

  try {
    // Verifica quais datas já existem para não duplicar no agg
    var metaSnap = await db.ref('rotaads/historico_meta').once('value');
    var metaExist = metaSnap.val() || {};

    var totalProcessadas = 0;
    var aggUpdates = {};

    for (var i = 0; i < datas.length; i++) {
      var data     = datas[i];
      var corridas = corridasPorData[data];
      var jaExiste = !!metaExist[data];

      // Estrutura: hora → idx → {motorista, status, motivo, km}
      var porHora = {};
      corridas.forEach(function(c, idx) {
        var h = String(c.hora);
        if (!porHora[h]) porHora[h] = {};
        porHora[h][idx] = {
          motorista: c.nomeMotorista || '',
          status:    c.statusNorm    || '',
          motivo:    c.motivo        || '',
          km:        Math.round((c.km || 0) * 10) / 10
        };
      });

      var fin   = corridas.filter(function(c){ return c.statusNorm === 'finalizada'; }).length;
      var can   = corridas.filter(function(c){ return c.statusNorm.includes('cancelad'); }).length;
      var totKm = corridas.reduce(function(s,c){ return s + (c.km||0); }, 0);

      await db.ref('rotaads/historico/' + data).set(porHora);
      await db.ref('rotaads/historico_meta/' + data).set({
        corridas:    corridas.length,
        finalizadas: fin,
        canceladas:  can,
        km:          Math.round(totKm * 10) / 10
      });

      // Acumula agg somente para datas novas (evita dupla contagem em reimports)
      if (!jaExiste) {
        var partes = data.split('-');
        var dow    = new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2])).getDay();

        var horaStats = {};
        corridas.forEach(function(c) {
          var h = c.hora;
          if (!horaStats[h]) horaStats[h] = { t:0, f:0, can:0 };
          horaStats[h].t++;
          if (c.statusNorm === 'finalizada')       horaStats[h].f++;
          if (c.statusNorm.includes('cancelad'))   horaStats[h].can++;
        });

        Object.entries(horaStats).forEach(function(entry) {
          var hora  = entry[0];
          var stats = entry[1];
          var base  = 'rotaads/historico_agg/' + dow + '/' + hora + '/';
          aggUpdates[base + 'total']      = (aggUpdates[base + 'total']      || 0) + stats.t;
          aggUpdates[base + 'finalizadas']= (aggUpdates[base + 'finalizadas']|| 0) + stats.f;
          aggUpdates[base + 'canceladas'] = (aggUpdates[base + 'canceladas'] || 0) + stats.can;
          aggUpdates[base + 'dias']       = (aggUpdates[base + 'dias']       || 0) + 1;
        });
      }

      totalProcessadas++;
      var pct = 50 + Math.round(totalProcessadas / datas.length * 45);
      _histSetUI({ pct: pct, msg: 'Salvando (' + totalProcessadas + '/' + datas.length + ' dias)...' });
    }

    // Aplica agg em lote usando ServerValue.increment para atomic updates
    if (Object.keys(aggUpdates).length > 0) {
      var incrementUpdates = {};
      Object.entries(aggUpdates).forEach(function(entry) {
        incrementUpdates[entry[0]] = firebase.database.ServerValue.increment(entry[1]);
      });
      await db.ref().update(incrementUpdates);
    }

    _histSetUI({ pct: 100, msg: '✅ Importação concluída!' });

    // Monta resumo
    var todasCorridas  = Object.values(corridasPorData).reduce(function(a,b){ return a.concat(b); }, []);
    var totalFin       = todasCorridas.filter(function(c){ return c.statusNorm === 'finalizada'; }).length;
    var resumoEl       = document.getElementById('hist-resumo');

    document.getElementById('hist-r-arquivos').textContent   = numArquivos + (numErros ? ' (' + numErros + ' com erro)' : '');
    document.getElementById('hist-r-dias').textContent        = datas.length;
    document.getElementById('hist-r-periodo').textContent     = _fmtData(datas[0]) + ' → ' + _fmtData(datas[datas.length-1]);
    document.getElementById('hist-r-corridas').textContent    = todasCorridas.length.toLocaleString('pt-BR');
    document.getElementById('hist-r-finalizadas').textContent = totalFin.toLocaleString('pt-BR');
    resumoEl.style.display = 'block';

    mostrarToast('✅ ' + datas.length + ' dias salvos no histórico!', 'sucesso');
    carregarCoberturaHistorico();

  } catch(e) {
    console.error('[historico/salvar]', e);
    mostrarToast('❌ Erro ao salvar: ' + e.message, 'erro');
    _histSetUI({ pct: 0, msg: '❌ Erro: ' + e.message });
  }
}

// ── Painel de cobertura ────────────────────────────────────────
async function carregarCoberturaHistorico() {
  var el = document.getElementById('hist-cobertura');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--cinza4);font-size:13px;padding:8px 0;">Carregando...</div>';

  try {
    var snap = await db.ref('rotaads/historico_meta').once('value');
    var meta = snap.val();

    if (!meta) {
      el.innerHTML = '<div style="color:var(--cinza4);font-size:13px;padding:8px 0;">Nenhum dado histórico importado ainda.</div>';
      return;
    }

    var datas    = Object.keys(meta).sort();
    var totalCor = datas.reduce(function(s,d){ return s + meta[d].corridas; }, 0);
    var totalFin = datas.reduce(function(s,d){ return s + meta[d].finalizadas; }, 0);

    // Cabeçalho de resumo geral
    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">' +
      _kpiMini(datas.length, 'Dias com dados', '#F5A800') +
      _kpiMini(totalCor.toLocaleString('pt-BR'), 'Corridas totais', '') +
      _kpiMini(Math.round(totalFin/totalCor*100) + '%', 'Taxa finalização', '#27ae60') +
    '</div>';

    // Calendário por mês
    var MESES_PT = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    var porMes   = {};
    datas.forEach(function(data) {
      var mes = data.substring(0,7);
      if (!porMes[mes]) porMes[mes] = {};
      porMes[mes][data] = meta[data];
    });

    Object.keys(porMes).sort().reverse().forEach(function(mes) {
      var diasDoMes = porMes[mes];
      var parts     = mes.split('-');
      var ano       = parts[0], mesNum = parts[1];
      var label     = MESES_PT[parseInt(mesNum)-1] + ' ' + ano;
      var diasMes   = new Date(parseInt(ano), parseInt(mesNum), 0).getDate();
      var totMes    = Object.values(diasDoMes).reduce(function(s,d){ return s+d.corridas; }, 0);

      html += '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-size:10px;font-weight:700;color:var(--cinza4);letter-spacing:1.5px;">' + label + '</span>' +
          '<span style="font-size:10px;color:var(--cinza4);">' + Object.keys(diasDoMes).length + ' dias · ' + totMes.toLocaleString('pt-BR') + ' corridas</span>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:3px;">';

      for (var d = 1; d <= diasMes; d++) {
        var ds   = ano + '-' + mesNum + '-' + String(d).padStart(2,'0');
        var info = diasDoMes[ds];
        if (info) {
          var finPct = Math.round(info.finalizadas / info.corridas * 100);
          var bg = finPct >= 90 ? '#27ae60' : finPct >= 80 ? '#F5A800' : '#e74c3c';
          html += '<div title="' + ds + '\n' + info.corridas + ' corridas\n' + info.finalizadas + ' finalizadas (' + finPct + '%)" ' +
            'style="width:26px;height:26px;border-radius:5px;background:' + bg + ';display:flex;align-items:center;justify-content:center;' +
            'font-size:9px;font-weight:700;color:#fff;cursor:default;">' + d + '</div>';
        } else {
          html += '<div title="' + ds + ': sem dados" ' +
            'style="width:26px;height:26px;border-radius:5px;background:var(--cinza2);display:flex;align-items:center;justify-content:center;' +
            'font-size:9px;color:var(--cinza4);">' + d + '</div>';
        }
      }
      html += '</div></div>';
    });

    // Legenda
    html += '<div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;">' +
      _legenda('#27ae60', '≥90% finalizadas') +
      _legenda('#F5A800', '80–89%') +
      _legenda('#e74c3c', '<80%') +
      _legenda('var(--cinza2)', 'Sem dados') +
    '</div>';

    el.innerHTML = html;

  } catch(e) {
    el.innerHTML = '<div style="color:var(--vm);font-size:12px;">Erro: ' + e.message + '</div>';
  }
}

function _kpiMini(val, label, cor) {
  return '<div style="background:var(--azul-esc);border-radius:8px;padding:10px;text-align:center;">' +
    '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:20px;font-weight:900;color:' + (cor||'var(--branco)') + ';">' + val + '</div>' +
    '<div style="font-size:9px;color:var(--cinza4);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">' + label + '</div>' +
  '</div>';
}

function _legenda(cor, txt) {
  return '<div style="display:flex;align-items:center;gap:4px;">' +
    '<div style="width:12px;height:12px;border-radius:3px;background:' + cor + ';flex-shrink:0;"></div>' +
    '<span style="font-size:10px;color:var(--cinza4);">' + txt + '</span>' +
  '</div>';
}

// ── Limpar histórico ──────────────────────────────────────────
async function limparHistorico() {
  var snap  = await db.ref('rotaads/historico_meta').once('value');
  var meta  = snap.val() || {};
  var ndias = Object.keys(meta).length;

  if (!confirm('⚠️ Isso vai apagar TODOS os dados históricos (' + ndias + ' dias de corridas).\nEssa ação não pode ser desfeita.\n\nConfirmar?')) return;

  try {
    await db.ref('rotaads/historico').remove();
    await db.ref('rotaads/historico_meta').remove();
    await db.ref('rotaads/historico_agg').remove();

    document.getElementById('hist-resumo').style.display = 'none';
    _histSetUI({ progresso: false });
    document.getElementById('hist-cobertura').innerHTML =
      '<div style="color:var(--cinza4);font-size:13px;padding:8px 0;">Nenhum dado histórico importado ainda.</div>';
    mostrarToast('🗑 Histórico apagado (' + ndias + ' dias removidos).', '');
  } catch(e) {
    mostrarToast('❌ Erro: ' + e.message, 'erro');
  }
}

// ── Helpers ───────────────────────────────────────────────────
function _histSetUI(opts) {
  var wrap = document.getElementById('hist-progress-wrap');
  var bar  = document.getElementById('hist-progress-bar');
  var txt  = document.getElementById('hist-progress-txt');
  if (opts.progresso === false) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = 'block';
  if (bar)  bar.style.width   = (opts.pct || 0) + '%';
  if (txt)  txt.textContent   = opts.msg  || '';
}

function _fmtData(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

// ── Auto-fill com dados do histórico (usado pelo frota.js) ─────
// Exportado como helper global para ser chamado por autoPreencherFrota
async function lerHistoricoAgg() {
  var snap = await db.ref('rotaads/historico_agg').once('value');
  return snap.val();
}

async function lerHistoricoMeta() {
  var snap = await db.ref('rotaads/historico_meta').once('value');
  return snap.val();
}

async function lerHistoricoUltimosNDias(n) {
  var hoje    = new Date();
  var corridas = {};
  var promises = [];
  for (var i = 1; i <= n; i++) {
    var dt  = new Date(hoje);
    dt.setDate(dt.getDate() - i);
    var mm  = String(dt.getMonth()+1).padStart(2,'0');
    var dd  = String(dt.getDate()).padStart(2,'0');
    var iso = dt.getFullYear() + '-' + mm + '-' + dd;
    promises.push((function(data) {
      return db.ref('rotaads/historico/' + data).once('value').then(function(s) {
        corridas[data] = s.val() || {};
      });
    })(iso));
  }
  await Promise.all(promises);
  return corridas;
}

window.processarArquivosHistorico = processarArquivosHistorico;
window.carregarCoberturaHistorico  = carregarCoberturaHistorico;
window.limparHistorico             = limparHistorico;
window.lerHistoricoAgg             = lerHistoricoAgg;
window.lerHistoricoMeta            = lerHistoricoMeta;
window.lerHistoricoUltimosNDias    = lerHistoricoUltimosNDias;
