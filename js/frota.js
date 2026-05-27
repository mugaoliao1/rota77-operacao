// ── Boletim da Frota ─────────────────────────────────────────
let _frotaDados = null;

const _F_HORAS   = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
const _F_DIAS_N  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const _F_DIAS_S  = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
const _F_MESES   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const _F_TIPO_COR = { normal: '#1a2f5e', atencao: '#b87800', forte: '#e74c3c', realizado: '#27ae60' };
const _F_TIPO_LAB = { normal: 'Normal', atencao: 'Atenção', forte: 'Forte', realizado: 'Realizado' };
const _F_PICO_COR = { verde: '#27ae60', amarelo: '#F5A800', vermelho: '#e74c3c' };
const _F_PICO_BG  = { verde: '#eafaf1', amarelo: '#fff8e6', vermelho: '#fdf0ef' };
const _F_PICO_LAB = { verde: 'Leve', amarelo: 'Moderado', vermelho: 'Pico' };

// ── Monta formulário de dias ao selecionar datas ───────────────
function gerarDiasFrota() {
  var ini = document.getElementById('frota-data-inicio').value;
  var fim = document.getElementById('frota-data-fim').value;
  if (!ini || !fim) return;

  var start = new Date(ini + 'T00:00:00');
  var end   = new Date(fim + 'T00:00:00');
  if (end < start) { mostrarToast('Data fim deve ser ≥ data início.', 'erro'); return; }

  var container = document.getElementById('frota-dias-container');
  var html = '';
  var cur  = new Date(start);
  var idx  = 0;

  while (cur <= end) {
    var dow   = cur.getDay();
    var dd    = String(cur.getDate()).padStart(2,'0');
    var mm    = String(cur.getMonth()+1).padStart(2,'0');
    var dataV = cur.getFullYear() + '-' + mm + '-' + dd;

    var horasHtml = _F_HORAS.map(function(h) {
      return '<div style="display:flex;align-items:center;gap:4px;background:var(--azul-esc);border-radius:6px;padding:5px 8px;">' +
        '<input type="checkbox" id="frota-h' + h + '-' + idx + '" style="margin:0;width:13px;height:13px;cursor:pointer;accent-color:var(--amarelo);">' +
        '<label for="frota-h' + h + '-' + idx + '" style="font-size:11px;font-weight:700;color:var(--branco);margin:0;cursor:pointer;text-transform:none;letter-spacing:0;">' + h + 'h</label>' +
        '<select id="frota-hcor' + h + '-' + idx + '" style="width:30px;padding:1px 0;font-size:12px;background:transparent;border:none;color:var(--branco);cursor:pointer;">' +
          '<option value="verde">🟢</option>' +
          '<option value="amarelo">🟡</option>' +
          '<option value="vermelho">🔴</option>' +
        '</select>' +
      '</div>';
    }).join('');

    html += '<div class="card" style="margin-bottom:10px;">' +
      '<div class="card-header" style="padding:12px 18px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div id="frota-circulo-' + idx + '" style="width:42px;height:42px;border-radius:50%;background:#1a2f5e;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:11px;font-weight:900;color:#fff;line-height:1;">' + _F_DIAS_S[dow] + '</div>' +
            '<div style="font-size:9px;font-weight:600;color:rgba(255,255,255,.7);margin-top:2px;">' + dd + '/' + mm + '</div>' +
          '</div>' +
          '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:900;color:var(--branco);">' + _F_DIAS_N[dow] + ' <span style="font-size:13px;font-weight:600;color:var(--cinza4);">' + dd + '/' + mm + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="card-body" style="padding:12px 18px;">' +
        '<input type="hidden" id="frota-data-' + idx + '" value="' + dataV + '">' +
        '<input type="hidden" id="frota-nome-' + idx + '" value="' + _F_DIAS_N[dow] + '">' +
        '<input type="hidden" id="frota-sigla-' + idx + '" value="' + _F_DIAS_S[dow] + '">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
          '<div>' +
            '<label>Tipo do dia</label>' +
            '<select id="frota-tipo-' + idx + '" onchange="atualizarCirculoFrota(' + idx + ')">' +
              '<option value="normal">Normal</option>' +
              '<option value="atencao">Atenção</option>' +
              '<option value="forte">Forte</option>' +
              '<option value="realizado">Realizado</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label>Descrição curta</label>' +
            '<input type="text" id="frota-desc-' + idx + '" placeholder="ex: Dia de jogo, feriado...">' +
          '</div>' +
        '</div>' +
        '<label style="margin-bottom:8px;display:block;">Horários de pico</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;">' + horasHtml + '</div>' +
      '</div>' +
    '</div>';

    cur.setDate(cur.getDate() + 1);
    idx++;
  }

  container.innerHTML = html || '<p style="color:var(--cinza4);font-size:13px;">Selecione as datas acima.</p>';
  container.dataset.numDias = idx;
  if (idx > 0) {
    document.getElementById('btn-gerar-frota').disabled  = false;
    var btnAuto = document.getElementById('btn-auto-frota');
    if (btnAuto) btnAuto.disabled = false;
  }
}

function atualizarCirculoFrota(idx) {
  var tipo = document.getElementById('frota-tipo-' + idx).value;
  var circ = document.getElementById('frota-circulo-' + idx);
  if (circ) circ.style.background = _F_TIPO_COR[tipo] || '#1a2f5e';
}

// ── Coleta dados e abre modal ──────────────────────────────────
function gerarFrota() {
  var ini = document.getElementById('frota-data-inicio').value;
  var fim = document.getElementById('frota-data-fim').value;
  if (!ini || !fim) { mostrarToast('❌ Selecione o período.', 'erro'); return; }

  var numDias = parseInt(document.getElementById('frota-dias-container').dataset.numDias || 0);
  if (!numDias) { mostrarToast('❌ Clique em "Montar dias" antes.', 'erro'); return; }

  var dias = [];
  for (var i = 0; i < numDias; i++) {
    var picos = [];
    _F_HORAS.forEach(function(h) {
      var cb = document.getElementById('frota-h' + h + '-' + i);
      if (cb && cb.checked) {
        var cor = document.getElementById('frota-hcor' + h + '-' + i).value;
        picos.push({ hora: h, cor: cor });
      }
    });
    dias.push({
      nome:  document.getElementById('frota-nome-' + i).value,
      sigla: document.getElementById('frota-sigla-' + i).value,
      data:  document.getElementById('frota-data-' + i).value,
      tipo:  document.getElementById('frota-tipo-' + i).value,
      desc:  document.getElementById('frota-desc-' + i).value.trim(),
      picos: picos
    });
  }

  var iniP = ini.split('-'), fimP = fim.split('-');
  var periodo = iniP[2] + ' a ' + fimP[2] + ' de ' + _F_MESES[parseInt(fimP[1])-1] + ' de ' + fimP[0];

  _frotaDados = {
    periodo: periodo,
    dias:    dias,
    comunicado: {
      titulo: document.getElementById('frota-comunicado-titulo').value.trim(),
      texto:  document.getElementById('frota-comunicado-texto').value.trim()
    },
    dica: {
      titulo: document.getElementById('frota-dica-titulo').value.trim(),
      texto:  document.getElementById('frota-dica-texto').value.trim()
    },
    destaques: [1,2,3].map(function(n) {
      return {
        emoji: document.getElementById('frota-dest-emoji' + n).value.trim() || '⭐',
        nome:  document.getElementById('frota-dest-nome' + n).value.trim(),
        desc:  document.getElementById('frota-dest-desc' + n).value.trim()
      };
    }).filter(function(d) { return d.nome; }),
    fechamento: document.getElementById('frota-fechamento').value.trim() || 'Bom trabalho, equipe! 🚗✅'
  };

  var html    = _construirHtmlFrota(_frotaDados);
  var blob    = new Blob([html], { type: 'text/html;charset=utf-8' });
  var oldUrl  = document.getElementById('frota-iframe').src;
  document.getElementById('frota-iframe').src = URL.createObjectURL(blob);
  if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
  abrirModal('modal-frota');
}

// ── Publicar ──────────────────────────────────────────────────
async function publicarFrota() {
  if (!_frotaDados) return;
  var html = _construirHtmlFrota(_frotaDados);
  var btn  = document.getElementById('btn-publicar-frota');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }
  try {
    await publicarArquivo('boletim-frota-atual.html', html, 'frota: ' + _frotaDados.periodo);
    mostrarToast('✅ Boletim da Frota publicado! Deploy em ~1 min', 'sucesso');
    fecharModal('modal-frota');
  } catch(e) {
    console.error('[frota/publicar]', e);
    mostrarToast('❌ ' + e.message, 'erro');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Publicar Boletim da Frota'; }
  }
}

// ── Construtor HTML ───────────────────────────────────────────
function _construirHtmlFrota(d) {
  var css = `:root{--azul:#1a2f5e;--azul-esc:#111f3e;--amarelo:#F5A800;--verde:#27ae60;--vm:#e74c3c;--cinza:#f4f6f9;--cinza-txt:#666;--branco:#fff;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Barlow',sans-serif;background:var(--azul-esc);min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:20px 16px;}
.card{width:100%;max-width:440px;background:var(--branco);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);}
/* header */
.header{background:var(--azul);padding:26px 24px 22px;position:relative;overflow:hidden;}
.header::before{content:'';position:absolute;top:-60px;right:-60px;width:220px;height:220px;background:rgba(245,168,0,.08);border-radius:50%;}
.header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;position:relative;}
.logo-box{background:var(--amarelo);border-radius:8px;padding:6px 10px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:var(--azul);line-height:1.1;}
.semana-badge{display:inline-block;background:rgba(245,168,0,.15);border:1px solid rgba(245,168,0,.3);color:var(--amarelo);font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;}
.header-eyebrow{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--amarelo);margin-bottom:6px;position:relative;}
.header-titulo{font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:900;color:var(--branco);line-height:1.05;position:relative;}
.header-titulo span{color:var(--amarelo);}
.header-saudacao{font-size:13px;color:rgba(255,255,255,.65);margin-top:10px;position:relative;}
/* secoes */
.secao{padding:18px 20px;border-bottom:1px solid #eee;}
.secao:last-child{border-bottom:none;}
.secao-label{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--amarelo);margin-bottom:14px;}
/* dia bloco */
.dia-bloco{padding:14px 0;border-bottom:1px solid #f0f0f0;}
.dia-bloco:last-child{border-bottom:none;}
.dia-header{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
.dia-circulo{width:44px;height:44px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;}
.dia-circulo-sigla{font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:900;color:#fff;line-height:1;}
.dia-circulo-data{font-size:9px;font-weight:600;color:rgba(255,255,255,.75);margin-top:2px;}
.dia-info{flex:1;}
.dia-nome{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;color:var(--azul);line-height:1;}
.dia-desc{font-size:11px;color:var(--cinza-txt);margin-top:2px;}
.dia-tag{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;align-self:flex-start;}
.picos-wrap{display:flex;flex-wrap:wrap;gap:5px;}
.pico-tag{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;}
/* comunicado */
.comunicado-box{border-left:4px solid var(--amarelo);background:#fffdf0;border-radius:0 10px 10px 0;padding:14px 16px;}
.comunicado-titulo{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:900;color:var(--azul);margin-bottom:6px;}
.comunicado-texto{font-size:12px;color:#444;line-height:1.65;}
/* dica */
.dica-box{background:var(--azul);border-radius:12px;padding:16px 18px;}
.dica-eyebrow{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--amarelo);margin-bottom:6px;}
.dica-titulo{font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:900;color:#fff;margin-bottom:8px;}
.dica-texto{font-size:12px;color:rgba(255,255,255,.75);line-height:1.65;}
/* destaques */
.dest-item{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;}
.dest-item:last-child{border-bottom:none;}
.dest-emoji{font-size:22px;flex-shrink:0;margin-top:1px;}
.dest-nome{font-size:13px;font-weight:700;color:var(--azul);margin-bottom:2px;}
.dest-desc{font-size:11px;color:var(--cinza-txt);line-height:1.5;}
/* fechamento */
.fechamento{background:var(--azul);padding:20px 24px;position:relative;overflow:hidden;}
.fechamento::before{content:'';position:absolute;top:-30px;right:-30px;width:140px;height:140px;background:rgba(245,168,0,.07);border-radius:50%;}
.fechamento-frase{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;color:#fff;line-height:1.2;position:relative;}
.fechamento-frase span{color:var(--amarelo);}`;

  // ── Dias ──
  var diasHtml = d.dias.map(function(dia) {
    var tipoCor = _F_TIPO_COR[dia.tipo] || '#1a2f5e';
    var tipoBg  = dia.tipo === 'atencao' ? '#fff8e6' : dia.tipo === 'forte' ? '#fdf0ef' : dia.tipo === 'realizado' ? '#eafaf1' : '#f0f4ff';
    var tipoCorTag = dia.tipo === 'atencao' ? '#b87800' : dia.tipo === 'forte' ? '#e74c3c' : dia.tipo === 'realizado' ? '#27ae60' : '#1a2f5e';
    var tipoLab = _F_TIPO_LAB[dia.tipo] || 'Normal';
    var parts   = dia.data.split('-');
    var ddmm    = parts[2] + '/' + parts[1];

    var picosHtml = dia.picos.length
      ? '<div class="picos-wrap" style="margin-top:8px;">' +
          dia.picos.map(function(p) {
            return '<span class="pico-tag" style="background:' + _F_PICO_BG[p.cor] + ';color:' + _F_PICO_COR[p.cor] + ';">' + p.hora + 'h — ' + _F_PICO_LAB[p.cor] + '</span>';
          }).join('') +
        '</div>'
      : '';

    return '<div class="dia-bloco">' +
      '<div class="dia-header">' +
        '<div class="dia-circulo" style="background:' + tipoCor + ';">' +
          '<div class="dia-circulo-sigla">' + dia.sigla + '</div>' +
          '<div class="dia-circulo-data">' + ddmm + '</div>' +
        '</div>' +
        '<div class="dia-info">' +
          '<div class="dia-nome">' + dia.nome.replace('-feira','') + '</div>' +
          (dia.desc ? '<div class="dia-desc">' + dia.desc + '</div>' : '') +
        '</div>' +
        '<div class="dia-tag" style="background:' + tipoBg + ';color:' + tipoCorTag + ';">' + tipoLab + '</div>' +
      '</div>' +
      picosHtml +
    '</div>';
  }).join('');

  // ── Destaques ──
  var destHtml = d.destaques.length
    ? d.destaques.map(function(dest) {
        return '<div class="dest-item">' +
          '<div class="dest-emoji">' + dest.emoji + '</div>' +
          '<div><div class="dest-nome">' + dest.nome + '</div>' +
          '<div class="dest-desc">' + dest.desc + '</div></div>' +
        '</div>';
      }).join('')
    : '';

  // ── Fechamento split (quebra na última palavra) ──
  var fWords  = d.fechamento.split(' ');
  var fLast   = fWords.pop();
  var fMain   = fWords.join(' ');

  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Boletim da Frota — Rota 77</title>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
    '<style>\n' + css + '\n</style>\n</head>\n<body>\n<div class="card">\n' +

    '<div class="header">\n' +
    '  <div class="header-top">' +
    '<div class="logo-box">ROTA<br>77</div>' +
    '<div class="semana-badge">📅 ' + d.periodo + '</div>' +
    '</div>\n' +
    '  <div class="header-eyebrow">📋 Planejamento semanal</div>\n' +
    '  <div class="header-titulo">Boletim da<br><span>Frota.</span></div>\n' +
    '  <div class="header-saudacao">Equipe Rota 77 🚗</div>\n' +
    '</div>\n' +

    '<div class="secao">\n' +
    '  <div class="secao-label">Agenda da Semana</div>\n' +
    diasHtml +
    '</div>\n' +

    (d.comunicado.texto
      ? '<div class="secao">\n' +
        '  <div class="secao-label">Comunicado</div>\n' +
        '  <div class="comunicado-box">' +
        (d.comunicado.titulo ? '<div class="comunicado-titulo">' + d.comunicado.titulo + '</div>' : '') +
        '<div class="comunicado-texto">' + d.comunicado.texto.replace(/\n/g,'<br>') + '</div>' +
        '</div>\n</div>\n'
      : '') +

    (d.dica.texto
      ? '<div class="secao">\n' +
        '  <div class="dica-box">' +
        '<div class="dica-eyebrow">💡 Dica da Semana</div>' +
        (d.dica.titulo ? '<div class="dica-titulo">' + d.dica.titulo + '</div>' : '') +
        '<div class="dica-texto">' + d.dica.texto.replace(/\n/g,'<br>') + '</div>' +
        '</div>\n</div>\n'
      : '') +

    (destHtml
      ? '<div class="secao">\n' +
        '  <div class="secao-label">Destaques da Semana</div>\n' +
        destHtml +
        '</div>\n'
      : '') +

    '<div class="fechamento">\n' +
    '  <div class="fechamento-frase">' + fMain + '<br><span>' + fLast + '</span></div>\n' +
    '</div>\n' +

    '</div>\n</body>\n</html>';
}

// ── Auto-preenchimento com dados históricos do Firebase ────────
function _dowDeData(isoDate) {
  var p = isoDate.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])).getDay();
}

function _picosPorDowETipo(dow, tipo) {
  // Padrões base de pico — ajustados por tipo do dia
  var picos = [];
  var manha = tipo === 'forte' ? 'vermelho' : 'amarelo';
  var tarde  = tipo === 'forte' ? 'vermelho' : 'amarelo';
  var leve   = tipo === 'forte' ? 'amarelo'  : 'verde';

  // Manhã (rush)
  picos.push({ hora: 7, cor: leve }, { hora: 8, cor: manha }, { hora: 9, cor: leve });
  // Almoço
  picos.push({ hora: 12, cor: leve });
  // Tarde/noite (rush)
  picos.push({ hora: 17, cor: leve }, { hora: 18, cor: tarde }, { hora: 19, cor: leve });

  // Sexta e Sábado: adiciona noite
  if (dow === 5 || dow === 6) {
    picos.push({ hora: 20, cor: leve }, { hora: 21, cor: manha }, { hora: 22, cor: tarde }, { hora: 23, cor: leve });
  }

  // Dia de atenção: reforça horários críticos
  if (tipo === 'atencao') {
    picos.forEach(function(p) { if (p.cor === 'verde') p.cor = 'amarelo'; });
  }

  return picos;
}

async function autoPreencherFrota() {
  var btn = document.getElementById('btn-auto-frota');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Lendo histórico...'; }

  try {
    if (!window.db) throw new Error('Firebase não conectado.');

    // 1. Lê todas as métricas históricas
    var metricasSnap = await window.db.ref('rotaads/metricas').once('value');
    var metricas     = metricasSnap.val() || {};

    // 2. Calcula média de corridas por dia da semana (0=Dom … 6=Sáb)
    var dowSum   = [0,0,0,0,0,0,0];
    var dowCount = [0,0,0,0,0,0,0];
    Object.entries(metricas).forEach(function(entry) {
      var dow = _dowDeData(entry[0]);
      dowSum[dow]   += entry[1].corridas || 0;
      dowCount[dow] += 1;
    });
    var dowAvg = dowSum.map(function(s, i) { return dowCount[i] > 0 ? s / dowCount[i] : 0; });
    var totalDias   = dowCount.reduce(function(a,b){return a+b;}, 0);
    var overallAvg  = totalDias > 0
      ? dowSum.reduce(function(a,b){return a+b;},0) / totalDias
      : 0;

    // 3. Lê metricasMotoristas dos últimos 7 dias para destaques
    var hoje = new Date();
    var ultimas7 = [];
    for (var d = 1; d <= 7; d++) {
      var dt = new Date(hoje);
      dt.setDate(dt.getDate() - d);
      var mm = String(dt.getMonth()+1).padStart(2,'0');
      var dd = String(dt.getDate()).padStart(2,'0');
      ultimas7.push(dt.getFullYear() + '-' + mm + '-' + dd);
    }

    var motSnaps = await Promise.all(
      ultimas7.map(function(data) {
        return window.db.ref('rotaads/metricasMotoristas/' + data).once('value');
      })
    );

    // Agrega corridas e dias ativos por motorista
    var motTotais = {};
    motSnaps.forEach(function(snap) {
      var val = snap.val();
      if (!val) return;
      Object.values(val).forEach(function(m) {
        if (!m || !m.nome) return;
        if (!motTotais[m.nome]) motTotais[m.nome] = { corridas: 0, dias: 0 };
        motTotais[m.nome].corridas += m.corridas || 0;
        motTotais[m.nome].dias     += 1;
      });
    });

    var top3 = Object.entries(motTotais)
      .sort(function(a,b){ return b[1].corridas - a[1].corridas; })
      .slice(0, 3);

    // Motorista mais constante (mais dias ativos, desempate por corridas)
    var constancia = Object.entries(motTotais)
      .sort(function(a,b){ return b[1].dias - a[1].dias || b[1].corridas - a[1].corridas; });

    // 4. Preenche tipo e horários de pico de cada dia
    var numDias = parseInt(document.getElementById('frota-dias-container').dataset.numDias || 0);
    for (var i = 0; i < numDias; i++) {
      var dataVal = document.getElementById('frota-data-' + i).value;
      var dow     = _dowDeData(dataVal);
      var avg     = dowAvg[dow];
      var tipo;
      if (overallAvg === 0 || avg === 0) {
        tipo = 'normal';
      } else if (avg >= overallAvg * 1.25) {
        tipo = 'forte';
      } else if (avg >= overallAvg * 1.05) {
        tipo = 'atencao';
      } else {
        tipo = 'normal';
      }

      var tipoEl = document.getElementById('frota-tipo-' + i);
      if (tipoEl) { tipoEl.value = tipo; atualizarCirculoFrota(i); }

      // Limpa checkboxes existentes e marca os novos picos
      _F_HORAS.forEach(function(h) {
        var cb = document.getElementById('frota-h' + h + '-' + i);
        if (cb) cb.checked = false;
      });

      _picosPorDowETipo(dow, tipo).forEach(function(p) {
        var cb  = document.getElementById('frota-h' + p.hora + '-' + i);
        var sel = document.getElementById('frota-hcor' + p.hora + '-' + i);
        if (cb)  cb.checked   = true;
        if (sel) sel.value    = p.cor;
      });
    }

    // 5. Preenche destaques (só se campo estiver vazio)
    var emojis = ['🏆','🌟','👏'];
    top3.forEach(function(entry, idx) {
      var n = idx + 1;
      var nomeEl  = document.getElementById('frota-dest-nome' + n);
      var emojiEl = document.getElementById('frota-dest-emoji' + n);
      var descEl  = document.getElementById('frota-dest-desc' + n);
      if (nomeEl && !nomeEl.value) {
        nomeEl.value  = entry[0];
        if (emojiEl) emojiEl.value = emojis[idx];
        if (descEl)  descEl.value  = entry[1].corridas + ' corridas em ' + entry[1].dias + ' dia(s) — top ' + n + ' da semana';
      }
    });

    // Destaque de constância (se ainda há slot livre)
    if (constancia.length && constancia[0][0] !== (top3[0] && top3[0][0])) {
      for (var slot = 1; slot <= 3; slot++) {
        var nomeEl2 = document.getElementById('frota-dest-nome' + slot);
        if (nomeEl2 && !nomeEl2.value) {
          nomeEl2.value = constancia[0][0];
          var emojiEl2 = document.getElementById('frota-dest-emoji' + slot);
          var descEl2  = document.getElementById('frota-dest-desc' + slot);
          if (emojiEl2) emojiEl2.value = '🕐';
          if (descEl2)  descEl2.value  = constancia[0][1].dias + ' dias ativo — constância na semana';
          break;
        }
      }
    }

    // 6. Comunicado: identifica dia da semana com maior volume histórico
    var DOW_PT = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    var busiestDow = dowAvg.reduce(function(best, avg, i) {
      return avg > dowAvg[best] ? i : best;
    }, 1); // começa em Segunda por padrão

    var comunicadoTitulo = document.getElementById('frota-comunicado-titulo');
    var comunicadoTexto  = document.getElementById('frota-comunicado-texto');
    if (comunicadoTitulo && !comunicadoTitulo.value) {
      comunicadoTitulo.value = 'Atenção: ' + DOW_PT[busiestDow] + '-feira é o dia mais movimentado';
    }
    if (comunicadoTexto && !comunicadoTexto.value) {
      var mediaDia = Math.round(dowAvg[busiestDow]);
      comunicadoTexto.value =
        'Com base no histórico de corridas, a ' + DOW_PT[busiestDow] + '-feira concentra o maior volume ' +
        'da semana (média de ' + mediaDia + ' corridas/dia). Fique atento ao app nos horários de pico ' +
        'e mantenha-se disponível para maximizar seus atendimentos.';
    }

    var totalDadosHist = Object.keys(metricas).length;
    mostrarToast('✅ Preenchido com base em ' + totalDadosHist + ' dias de histórico.', 'sucesso');

  } catch(e) {
    console.error('[auto-preencher]', e);
    mostrarToast('❌ ' + e.message, 'erro');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Auto-preencher com histórico'; }
  }
}

window.gerarDiasFrota        = gerarDiasFrota;
window.atualizarCirculoFrota = atualizarCirculoFrota;
window.gerarFrota            = gerarFrota;
window.publicarFrota         = publicarFrota;
window.autoPreencherFrota    = autoPreencherFrota;
