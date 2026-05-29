// ── Fase 3: Motor de Consulta Local — Conversa com os Dados ─────────
// Parser de intenção + queries reais sobre dadosImportados (sem API)

(function () {
  const MESES_MAP = {
    janeiro:1, fevereiro:2, marco:3, abril:4, maio:5, junho:6,
    julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12
  };
  const MESES_NOME = Object.fromEntries(Object.entries(MESES_MAP).map(([k,v])=>[v,k]));

  function norm(s) {
    return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  // ── Detecta intenção da pergunta ─────────────────────────────────
  function detectarIntencao(q) {
    const n = norm(q);

    // Hora específica
    const mHora = n.match(/\b(\d{1,2})\s*h\b|\bhoras?\s+(\d{1,2})\b|\b(\d{1,2})\s+hora/);
    if (mHora) {
      const h = parseInt(mHora[1]||mHora[2]||mHora[3]);
      if (h >= 0 && h <= 23) return { tipo:'HORA_ESPECIFICA', hora:h };
    }

    // Comparação de meses
    const mesesFound = Object.keys(MESES_MAP).filter(m => n.includes(m));
    if (mesesFound.length >= 2 || (n.includes('compar') && mesesFound.length >= 1)) {
      return { tipo:'COMPARAR_PERIODOS', meses: mesesFound };
    }
    if (n.includes('compar') && !mesesFound.length) {
      return { tipo:'COMPARAR_PERIODOS', meses:[] };
    }

    // Maçaneta / não atendida
    if (/(macaneta|nao.*atendid|passageiro.*nao|nao comparec|porta.*abriu|driver.*chegou)/.test(n)) {
      return { tipo: /rank|top|quem|motor|mais/.test(n) ? 'RANK_MACANETA' : 'ANALISE_MACANETA' };
    }

    // Madrugada
    if (/madrugada/.test(n)) return { tipo:'MADRUGADA' };

    // Pico operacional
    if (/(pico|horario.*mais|mais.*horario|qual.*hora.*mais|hora.*mais.*corrid|qual.*horario|hora.*pico|horario.*pico|hora.*cresce)/.test(n)) {
      return { tipo:'PICO_HORARIO' };
    }

    // Tendência
    if (/(tendencia|crescendo|crescimento|aumento|queda|aumentando|caindo|variacao|variando|evoluind)/.test(n)) {
      if (/cancel/.test(n)) return { tipo:'TENDENCIA_CANCELAMENTOS' };
      return { tipo:'TENDENCIA_CORRIDAS' };
    }

    // Cancelamentos
    if (/cancel/.test(n)) {
      if (/(taxa|percent|proporcao|indice|rate)/.test(n)) return { tipo:'TAXA_CANCELAMENTO' };
      if (/(horario|hora|periodo|turno|manha|tarde|noite|quando)/.test(n)) return { tipo:'CANCELAMENTO_POR_HORARIO' };
      return { tipo:'RANK_CANCELAMENTOS' };
    }

    // Períodos do dia
    if (/\bmanha\b/.test(n)) return { tipo:'PERIODO_DIA', horas:[6,7,8,9,10,11], label:'manhã (6h–11h)' };
    if (/\btarde\b/.test(n)) return { tipo:'PERIODO_DIA', horas:[12,13,14,15,16,17], label:'tarde (12h–17h)' };
    if (/\bnoite\b/.test(n)) return { tipo:'PERIODO_DIA', horas:[18,19,20,21,22,23], label:'noite (18h–23h)' };

    // Bairro / endereço
    if (/(bairro|local|regiao|zona|origem|destino|enderec|cidade|rua)/.test(n)) return { tipo:'SEM_DADOS_BAIRRO' };

    // Tempo / duração
    if (/(espera|demora|aguard|tempo.*espera|duracao|quanto.*tempo|tempo.*corrid)/.test(n)) return { tipo:'TEMPO_ESPERA' };

    // Finalizadas / ranking geral
    if (/(finaliz|conclu|produtiv|melhor|top|rank|lider|destaque|mais.*corrid|corrid.*mais|quem.*mais.*corr)/.test(n)) {
      return { tipo:'RANK_FINALIZADAS' };
    }

    // Quem mais cancela
    if (/(quem|motor)/.test(n) && /cancel/.test(n)) return { tipo:'RANK_CANCELAMENTOS' };

    return { tipo:'RESUMO_GERAL' };
  }

  // ── Gera tabela HTML ─────────────────────────────────────────────
  function tabela(headers, rows) {
    if (!rows.length) return '';
    return `<div style="overflow-x:auto;margin-top:12px;">
      <table class="tabela" style="font-size:11px;width:100%;">
        <thead><tr>${headers.map(h=>`<th style="white-space:nowrap;">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  // ── Gera bloco de resposta ───────────────────────────────────────
  function bloco(titulo, texto, html='') {
    return `<div style="background:var(--preto3);border:1px solid var(--cinza1);border-radius:10px;padding:16px;">
      <div style="font-size:10px;color:var(--vm);font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">${titulo}</div>
      <div style="font-size:13px;color:var(--branco);line-height:1.7;">${texto}</div>
      ${html}
    </div>`;
  }

  // ── QUERY: Ranking de cancelamentos ──────────────────────────────
  function qRankCancelamentos(corridas, limite=10, ordem='desc') {
    const porMotorista = {};
    corridas.forEach(c => {
      if (!c.nomeMotorista) return;
      if (!porMotorista[c.nomeMotorista]) porMotorista[c.nomeMotorista] = { total:0, can:0 };
      porMotorista[c.nomeMotorista].total++;
      if (c.statusNorm === 'cancelada') porMotorista[c.nomeMotorista].can++;
    });

    const ranking = Object.entries(porMotorista)
      .filter(([,v]) => v.can > 0)
      .sort((a,b) => ordem==='desc' ? b[1].can-a[1].can : a[1].can-b[1].can)
      .slice(0, limite);

    if (!ranking.length) return bloco('Cancelamentos', 'Nenhum cancelamento encontrado nos dados.');

    const [top] = ranking;
    const taxaTop = Math.round(top[1].can / top[1].total * 100);
    const totalCan = corridas.filter(c=>c.statusNorm==='cancelada').length;
    const tituloSufixo = ordem==='asc' ? ' — Menos Cancelamentos' : '';

    const rows = ranking.map(([nome,v],i) => {
      const taxa = Math.round(v.can/v.total*100);
      return [i+1, nome, `<strong>${v.can}</strong>`, v.total, `${taxa}%`];
    });

    return bloco(`Ranking de Cancelamentos${tituloSufixo}`,
      `<strong>${top[0]}</strong> ${ordem==='asc'?'tem o menor número':'lidera'} com <strong>${top[1].can}</strong> cancelamentos (${taxaTop}% das corridas). Total no período: <strong>${totalCan.toLocaleString('pt-BR')}</strong>.`,
      tabela(['#','Motorista','Cancelamentos','Total corridas','Taxa'], rows)
    );
  }

  // ── QUERY: Taxa de cancelamento ──────────────────────────────────
  function qTaxaCancelamento(corridas, limite=10) {
    const porMotorista = {};
    corridas.forEach(c => {
      if (!c.nomeMotorista) return;
      if (!porMotorista[c.nomeMotorista]) porMotorista[c.nomeMotorista] = { total:0, can:0, fin:0 };
      porMotorista[c.nomeMotorista].total++;
      if (c.statusNorm==='cancelada') porMotorista[c.nomeMotorista].can++;
      if (c.statusNorm==='finalizada') porMotorista[c.nomeMotorista].fin++;
    });

    const ranking = Object.entries(porMotorista)
      .filter(([,v]) => v.total >= 5)
      .map(([nome,v]) => ({ nome, ...v, taxa: Math.round(v.can/v.total*100) }))
      .sort((a,b) => b.taxa-a.taxa)
      .slice(0, limite);

    if (!ranking.length) return bloco('Taxa de Cancelamento', 'Dados insuficientes (mínimo 5 corridas por motorista).');

    const top = ranking[0];
    const rows = ranking.map((r,i) => [i+1, r.nome, r.total, r.can, r.fin, `<strong>${r.taxa}%</strong>`]);

    return bloco('Taxa de Cancelamento por Motorista',
      `<strong>${top.nome}</strong> tem a maior taxa: <strong>${top.taxa}%</strong> de ${top.total} corridas. Filtro: mín. 5 corridas.`,
      tabela(['#','Motorista','Total','Canceladas','Finalizadas','Taxa'], rows)
    );
  }

  // ── QUERY: Cancelamentos por horário ────────────────────────────
  function qCancelamentoPorHorario(corridas) {
    const porHora = new Array(24).fill(0);
    const totalPorHora = new Array(24).fill(0);

    corridas.forEach(c => {
      if (c.hora < 0 || c.hora > 23) return;
      totalPorHora[c.hora]++;
      if (c.statusNorm==='cancelada') porHora[c.hora]++;
    });

    const totalCan = porHora.reduce((a,b)=>a+b,0);
    if (!totalCan) return bloco('Cancelamentos por Horário', 'Nenhum cancelamento encontrado.');

    const horaPico = porHora.indexOf(Math.max(...porHora));
    const taxaPico = totalPorHora[horaPico] ? Math.round(porHora[horaPico]/totalPorHora[horaPico]*100) : 0;
    const periodo = horaPico<6?'madrugada':horaPico<12?'manhã':horaPico<18?'tarde':'noite';

    const rows = [];
    for (let h=0; h<24; h++) {
      if (!porHora[h]) continue;
      const taxa = totalPorHora[h] ? Math.round(porHora[h]/totalPorHora[h]*100) : 0;
      const label = h<6?'Madrugada':h<12?'Manhã':h<18?'Tarde':'Noite';
      rows.push([`${h}h`, label, h===horaPico?`<strong>${porHora[h]}</strong>`:porHora[h], totalPorHora[h], `${taxa}%`]);
    }

    return bloco('Cancelamentos por Horário',
      `Pico às <strong>${horaPico}h</strong> (${periodo}) com <strong>${porHora[horaPico]}</strong> ocorrências (${taxaPico}% das solicitações desse horário).`,
      tabela(['Hora','Período','Cancelamentos','Solicitações','Taxa'], rows)
    );
  }

  // ── QUERY: Tendência de corridas ─────────────────────────────────
  function qTendenciaCorridas(metricas) {
    const datas = Object.keys(metricas).sort();
    if (datas.length < 2) return bloco('Tendência', 'São necessários ao menos 2 dias de dados.');

    const vals = datas.map(d => metricas[d].corridas);
    const primeiro = vals[0], ultimo = vals[vals.length-1];
    const variacao = Math.round(((ultimo-primeiro)/primeiro)*100);
    const media = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const maximo = Math.max(...vals);
    const dataPico = datas[vals.indexOf(maximo)];
    const sinal = variacao > 5 ? '📈 alta' : variacao < -5 ? '📉 queda' : '➡️ estável';

    const rows = datas.map((d,i) => {
      const varStr = i===0 ? '—' : (()=>{
        const v = Math.round(((vals[i]-vals[i-1])/vals[i-1])*100);
        return `${v>0?'+':''}${v}%`;
      })();
      return [d, vals[i]===maximo?`<strong>${vals[i]}</strong>`:vals[i], varStr];
    });

    return bloco('Tendência de Corridas Finalizadas',
      `Tendência <strong>${sinal}</strong> entre ${datas[0]} e ${datas[datas.length-1]}.
       De ${primeiro} para ${ultimo}/dia (${variacao>0?'+':''}${variacao}%).
       Média: <strong>${media}/dia</strong> · Pico: <strong>${maximo}</strong> em ${dataPico}.`,
      tabela(['Data','Finalizadas','Variação dia anterior'], rows)
    );
  }

  // ── QUERY: Tendência de cancelamentos ───────────────────────────
  function qTendenciaCancelamentos(corridas, metricas) {
    const datas = Object.keys(metricas).sort();
    if (!datas.length) return bloco('Tendência', 'Sem dados.');

    const porDia = {}, totalPorDia = {};
    corridas.forEach(c => {
      if (!porDia[c.data]) { porDia[c.data]=0; totalPorDia[c.data]=0; }
      totalPorDia[c.data]++;
      if (c.statusNorm==='cancelada') porDia[c.data]++;
    });

    const dias = datas.filter(d => totalPorDia[d] > 0);
    if (dias.length < 2) return bloco('Tendência de Cancelamentos', 'São necessários ao menos 2 dias.');

    const taxas = dias.map(d => ({
      data:d, can:porDia[d]||0, total:totalPorDia[d]||0,
      taxa: totalPorDia[d] ? Math.round((porDia[d]||0)/totalPorDia[d]*100) : 0
    }));

    const diff = taxas[taxas.length-1].taxa - taxas[0].taxa;
    const sinal = diff > 2 ? '📈 aumentando' : diff < -2 ? '📉 caindo' : '➡️ estável';

    return bloco('Tendência de Cancelamentos',
      `Taxa <strong>${sinal}</strong>. Início: <strong>${taxas[0].taxa}%</strong> → Fim: <strong>${taxas[taxas.length-1].taxa}%</strong> (${diff>0?'+':''}${diff}pp).`,
      tabela(['Data','Total','Canceladas','Taxa'], taxas.map(t=>[t.data,t.total,t.can,`${t.taxa}%`]))
    );
  }

  // ── QUERY: Pico operacional ──────────────────────────────────────
  function qPicoHorario(corridas) {
    const porHora = new Array(24).fill(0);
    corridas.forEach(c => { if (c.hora>=0&&c.hora<=23) porHora[c.hora]++; });
    const total = corridas.length;
    if (!total) return bloco('Pico Operacional', 'Sem dados.');

    const maximo = Math.max(...porHora);
    const horaPico = porHora.indexOf(maximo);
    const pct = Math.round(maximo/total*100);
    const periodo = horaPico<6?'madrugada':horaPico<12?'manhã':horaPico<18?'tarde':'noite';

    const top8 = porHora.map((c,h)=>({h,c})).sort((a,b)=>b.c-a.c).slice(0,8);
    const rows = top8.map(({h,c},i) => {
      const p = Math.round(c/total*100);
      const label = h<6?'Madrugada':h<12?'Manhã':h<18?'Tarde':'Noite';
      const bar = '█'.repeat(Math.round(p/2))||'░';
      return [i+1, `${h}h`, label, h===horaPico?`<strong>${c}</strong>`:c, `${p}% ${bar}`];
    });

    return bloco('Pico Operacional por Horário',
      `Maior volume às <strong>${horaPico}h</strong> (${periodo}) — <strong>${maximo.toLocaleString('pt-BR')} solicitações</strong> (${pct}% do total).`,
      tabela(['#','Hora','Período','Solicitações','% do total'], rows)
    );
  }

  // ── QUERY: Madrugada ─────────────────────────────────────────────
  function qMadrugada(corridas) {
    const totalMotorista = {};
    corridas.forEach(c => {
      if (!c.nomeMotorista) return;
      if (!totalMotorista[c.nomeMotorista]) totalMotorista[c.nomeMotorista] = 0;
      totalMotorista[c.nomeMotorista]++;
    });

    const porMotorista = {};
    corridas.filter(c=>c.hora>=0&&c.hora<=5&&c.nomeMotorista).forEach(c => {
      if (!porMotorista[c.nomeMotorista]) porMotorista[c.nomeMotorista] = 0;
      porMotorista[c.nomeMotorista]++;
    });

    if (!Object.keys(porMotorista).length) return bloco('Madrugada (0h–5h)', 'Nenhuma corrida na madrugada nos dados.');

    const totalMad = Object.values(porMotorista).reduce((a,b)=>a+b,0);
    const ranking = Object.entries(porMotorista).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const [top] = ranking;
    const pctTop = Math.round(top[1]/(totalMotorista[top[0]]||1)*100);

    const rows = ranking.map(([nome,n],i) => {
      const pct = Math.round(n/(totalMotorista[nome]||1)*100);
      return [i+1, nome, `<strong>${n}</strong>`, totalMotorista[nome]||0, `${pct}%`];
    });

    return bloco('Motoristas na Madrugada (0h–5h)',
      `<strong>${top[0]}</strong> lidera com <strong>${top[1]}</strong> corridas na madrugada (${pctTop}% de toda a operação dele). Total: <strong>${totalMad}</strong>.`,
      tabela(['#','Motorista','Corridas madrugada','Total geral','% da operação'], rows)
    );
  }

  // ── QUERY: Ranking maçaneta ──────────────────────────────────────
  function qRankMacaneta(corridas, limite=10, ordem='desc') {
    const naoAt = corridas.filter(c => c.statusNorm==='não atendida'||c.statusNorm==='nao atendida'||c.statusNorm.includes('nao atendid'));
    if (!naoAt.length) {
      return bloco('Maçaneta', 'Nenhuma corrida "Não Atendida" encontrada.<br><span style="color:var(--cinza4);font-size:11px;">Status esperado: "Não Atendida"</span>');
    }

    const totalMot = {};
    corridas.forEach(c => {
      if (!c.nomeMotorista) return;
      if (!totalMot[c.nomeMotorista]) totalMot[c.nomeMotorista]=0;
      totalMot[c.nomeMotorista]++;
    });

    const porMot = {};
    naoAt.forEach(c => {
      if (!c.nomeMotorista) return;
      if (!porMot[c.nomeMotorista]) porMot[c.nomeMotorista]=0;
      porMot[c.nomeMotorista]++;
    });

    const ranking = Object.entries(porMot)
      .sort((a,b) => ordem==='desc' ? b[1]-a[1] : a[1]-b[1])
      .slice(0,limite);
    const [top] = ranking;
    const taxa = Math.round(top[1]/(totalMot[top[0]]||1)*100);

    const rows = ranking.map(([nome,n],i) => {
      const t = Math.round(n/(totalMot[nome]||1)*100);
      return [i+1, nome, `<strong>${n}</strong>`, totalMot[nome]||0, `${t}%`];
    });

    return bloco('Ranking Maçaneta (Não Atendidas)',
      `<strong>${top[0]}</strong> ${ordem==='asc'?'tem menos':'tem mais'} maçaneta: <strong>${top[1]}</strong> corridas (${taxa}%). Total: <strong>${naoAt.length}</strong>.`,
      tabela(['#','Motorista','Maçaneta','Total corridas','Taxa'], rows)
    );
  }

  // ── QUERY: Análise maçaneta ──────────────────────────────────────
  function qAnaliseMacaneta(corridas) {
    const naoAt = corridas.filter(c => c.statusNorm==='não atendida'||c.statusNorm==='nao atendida'||c.statusNorm.includes('nao atendid'));
    if (!naoAt.length) return bloco('Maçaneta', 'Nenhuma corrida "Não Atendida" encontrada.');

    const pct = Math.round(naoAt.length/corridas.length*100);
    const porHora = new Array(24).fill(0);
    naoAt.forEach(c=>{ if(c.hora>=0&&c.hora<=23) porHora[c.hora]++; });
    const horaPico = porHora.indexOf(Math.max(...porHora));

    const rows = [];
    for (let h=0; h<24; h++) {
      if (!porHora[h]) continue;
      const label = h<6?'Madrugada':h<12?'Manhã':h<18?'Tarde':'Noite';
      rows.push([`${h}h`, label, h===horaPico?`<strong>${porHora[h]}</strong>`:porHora[h], Math.round(porHora[h]/naoAt.length*100)+'%']);
    }

    return bloco('Análise de Maçaneta',
      `<strong>${naoAt.length}</strong> corridas maçaneta — <strong>${pct}%</strong> do total. Horário crítico: <strong>${horaPico}h</strong>.`,
      tabela(['Hora','Período','Maçaneta','% das maçaneta'], rows)
    );
  }

  // ── QUERY: Ranking finalizadas ───────────────────────────────────
  function qRankFinalizadas(corridas, motoristaObj, limite=10, ordem='desc') {
    const porMot = {};
    corridas.filter(c=>c.statusNorm==='finalizada'&&c.nomeMotorista).forEach(c => {
      if (!porMot[c.nomeMotorista]) porMot[c.nomeMotorista]={corridas:0,km:0};
      porMot[c.nomeMotorista].corridas++;
      porMot[c.nomeMotorista].km += c.km||0;
    });

    if (!Object.keys(porMot).length && motoristaObj) {
      Object.entries(motoristaObj).forEach(([nome,v])=>{ porMot[nome]={corridas:v.corridas,km:v.km}; });
    }
    if (!Object.keys(porMot).length) return bloco('Motoristas', 'Nenhuma corrida finalizada encontrada.');

    const ranking = Object.entries(porMot)
      .sort((a,b) => ordem==='desc' ? b[1].corridas-a[1].corridas : a[1].corridas-b[1].corridas)
      .slice(0, limite);
    const [top] = ranking;
    const tituloSufixo = ordem==='asc' ? ' — Menor Volume' : '';

    const rows = ranking.map(([nome,v],i) => [i+1, nome, `<strong>${v.corridas}</strong>`, Math.round(v.km)+' km']);

    return bloco(`Motoristas — Corridas Finalizadas${tituloSufixo}`,
      `<strong>${top[0]}</strong> ${ordem==='asc'?'tem menor volume':'lidera'} com <strong>${top[1].corridas}</strong> corridas e <strong>${Math.round(top[1].km)} km</strong>.`,
      tabela(['#','Motorista','Finalizadas','Km total'], rows)
    );
  }

  // ── QUERY: Período do dia ────────────────────────────────────────
  function qPeriodoDia(corridas, horas, label) {
    const doPeriodo = corridas.filter(c=>horas.includes(c.hora));
    if (!doPeriodo.length) return bloco(`Período: ${label}`, 'Nenhuma corrida encontrada nesse período.');

    const pct = Math.round(doPeriodo.length/corridas.length*100);
    const fin = doPeriodo.filter(c=>c.statusNorm==='finalizada').length;
    const can = doPeriodo.filter(c=>c.statusNorm==='cancelada').length;

    const porMot = {};
    doPeriodo.forEach(c => {
      if (!c.nomeMotorista) return;
      if (!porMot[c.nomeMotorista]) porMot[c.nomeMotorista]={total:0,fin:0,can:0};
      porMot[c.nomeMotorista].total++;
      if (c.statusNorm==='finalizada') porMot[c.nomeMotorista].fin++;
      if (c.statusNorm==='cancelada') porMot[c.nomeMotorista].can++;
    });

    const ranking = Object.entries(porMot).sort((a,b)=>b[1].total-a[1].total).slice(0,10);
    const rows = ranking.map(([nome,v],i) => [i+1, nome, v.total, v.fin, v.can]);

    return bloco(`Operação — ${label}`,
      `<strong>${doPeriodo.length.toLocaleString('pt-BR')}</strong> solicitações (${pct}% do total).
       Finalizadas: <strong>${fin}</strong> · Canceladas: <strong>${can}</strong>.
       ${ranking.length?`Maior volume: <strong>${ranking[0][0]}</strong> (${ranking[0][1].total}).`:''}`,
      tabela(['#','Motorista','Total','Finalizadas','Canceladas'], rows)
    );
  }

  // ── QUERY: Hora específica ───────────────────────────────────────
  function qHoraEspecifica(corridas, hora) {
    const daHora = corridas.filter(c=>c.hora===hora);
    if (!daHora.length) return bloco(`Análise — ${hora}h`, `Nenhuma corrida registrada às ${hora}h.`);

    const total = corridas.length;
    const fin = daHora.filter(c=>c.statusNorm==='finalizada').length;
    const can = daHora.filter(c=>c.statusNorm==='cancelada').length;
    const na = daHora.filter(c=>c.statusNorm.includes('atendid')).length;
    const periodo = hora<6?'madrugada':hora<12?'manhã':hora<18?'tarde':'noite';

    const porMot = {};
    daHora.forEach(c=>{
      if (!c.nomeMotorista) return;
      if (!porMot[c.nomeMotorista]) porMot[c.nomeMotorista]=0;
      porMot[c.nomeMotorista]++;
    });

    const ranking = Object.entries(porMot).sort((a,b)=>b[1]-a[1]).slice(0,8);

    return bloco(`Análise às ${hora}h (${periodo})`,
      `<strong>${daHora.length}</strong> solicitações às ${hora}h (${Math.round(daHora.length/total*100)}% do total).
       Finalizadas: <strong>${fin}</strong> · Canceladas: <strong>${can}</strong>${na?` · Maçaneta: <strong>${na}</strong>`:''}.
       ${ranking.length?`Top: <strong>${ranking[0][0]}</strong> (${ranking[0][1]}).`:''}`,
      ranking.length ? tabela(['#','Motorista','Corridas'], ranking.map(([n,v],i)=>[i+1,n,v])) : ''
    );
  }

  // ── QUERY: Comparar períodos ─────────────────────────────────────
  function qCompararPeriodos(corridas, metricas, meses) {
    let nums = meses.map(m=>MESES_MAP[m]).filter(Boolean).sort();

    if (nums.length < 2) {
      const mSet = new Set(Object.keys(metricas).map(d=>parseInt(d.split('-')[1])));
      nums = [...mSet].sort();
    }
    if (nums.length < 2) return bloco('Comparação', 'São necessários ao menos 2 meses de dados.');

    const [m1, m2] = [nums[0], nums[nums.length-1]];

    const extrair = (mes) => {
      const pad = String(mes).padStart(2,'0');
      const mc = Object.entries(metricas).filter(([d])=>d.includes(`-${pad}-`));
      const fin = mc.reduce((a,[,v])=>a+v.corridas,0);
      const km = mc.reduce((a,[,v])=>a+v.km,0);
      const cc = corridas.filter(c=>parseInt(c.data.split('-')[1])===mes);
      const can = cc.filter(c=>c.statusNorm==='cancelada').length;
      const taxa = cc.length ? Math.round(can/cc.length*100) : 0;
      return { nome:MESES_NOME[mes]||`Mês ${mes}`, fin, km:Math.round(km), dias:mc.length, total:cc.length, can, taxa };
    };

    const d1=extrair(m1), d2=extrair(m2);
    if (!d1.fin && !d2.fin) return bloco('Comparação', `Sem dados para ${d1.nome} ou ${d2.nome}.`);

    const varFin = d1.fin ? Math.round(((d2.fin-d1.fin)/d1.fin)*100) : 0;
    const varTaxa = d2.taxa - d1.taxa;

    const rows = [
      ['Corridas finalizadas', d1.fin, `<strong>${d2.fin}</strong>`, `${varFin>=0?'+':''}${varFin}%`],
      ['Km rodados', d1.km, d2.km, '—'],
      ['Dias com dados', d1.dias, d2.dias, '—'],
      ['Total solicitações', d1.total, d2.total, '—'],
      ['Cancelamentos', d1.can, d2.can, '—'],
      ['Taxa cancelamento', `${d1.taxa}%`, `<strong>${d2.taxa}%</strong>`, `${varTaxa>=0?'+':''}${varTaxa}pp`],
    ];

    const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
    return bloco(`Comparação: ${cap(d1.nome)} × ${cap(d2.nome)}`,
      `Corridas ${varFin>0?'📈 cresceram':'📉 caíram'} <strong>${Math.abs(varFin)}%</strong>. Taxa de cancelamento ${varTaxa>0?'piorou':'melhorou'} ${Math.abs(varTaxa)}pp.`,
      tabela(['Métrica', d1.nome, d2.nome, 'Variação'], rows)
    );
  }

  // ── QUERY: Tempo de corrida ──────────────────────────────────────
  function qTempoEspera(corridas) {
    const comTempo = corridas.filter(c=>c.statusNorm==='finalizada'&&c.tempo>0);
    if (!comTempo.length) return bloco('Duração de Corridas', 'Nenhuma corrida com dado de tempo.');

    const tempos = comTempo.map(c=>c.tempo);
    const media = Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length);

    const porMot = {};
    comTempo.forEach(c=>{
      if (!c.nomeMotorista) return;
      if (!porMot[c.nomeMotorista]) porMot[c.nomeMotorista]={sum:0,n:0};
      porMot[c.nomeMotorista].sum+=c.tempo;
      porMot[c.nomeMotorista].n++;
    });

    const ranking = Object.entries(porMot)
      .filter(([,v])=>v.n>=3)
      .map(([nome,v])=>[nome,Math.round(v.sum/v.n),v.n])
      .sort((a,b)=>a[1]-b[1])
      .slice(0,10);

    return bloco('Duração de Corridas',
      `<em>Campo disponível: duração da corrida (não tempo de espera).</em><br>
       Média: <strong>${media} min</strong>. Min: ${Math.min(...tempos)}min · Max: ${Math.max(...tempos)}min.
       Base: <strong>${comTempo.length.toLocaleString('pt-BR')}</strong> corridas.`,
      ranking.length ? tabela(['Motorista','Média (min)','Corridas'], ranking) : ''
    );
  }

  // ── QUERY: Resumo geral ──────────────────────────────────────────
  function qResumoGeral(corridas, metricas, motoristas) {
    const total = corridas.length;
    const fin = corridas.filter(c=>c.statusNorm==='finalizada').length;
    const can = corridas.filter(c=>c.statusNorm==='cancelada').length;
    const na = corridas.filter(c=>c.statusNorm==='não atendida'||c.statusNorm==='nao atendida').length;
    const datas = Object.keys(metricas).sort();
    const totalKm = Object.values(metricas).reduce((a,m)=>a+m.km,0);
    const totalMot = Object.keys(motoristas||{}).length;
    const top3 = Object.entries(motoristas||{}).sort((a,b)=>b[1].corridas-a[1].corridas).slice(0,3);

    return bloco('Resumo Geral dos Dados',
      `<strong>${total.toLocaleString('pt-BR')}</strong> solicitações em <strong>${datas.length}</strong> dias (${datas[0]||'—'} a ${datas[datas.length-1]||'—'}).<br>
       Finalizadas: <strong>${fin.toLocaleString('pt-BR')}</strong> (${total?Math.round(fin/total*100):0}%) · Canceladas: <strong>${can.toLocaleString('pt-BR')}</strong> (${total?Math.round(can/total*100):0}%)${na?` · Maçaneta: <strong>${na}</strong>`:''}.<br>
       Km rodados: <strong>${Math.round(totalKm).toLocaleString('pt-BR')} km</strong> · Motoristas: <strong>${totalMot}</strong>.
       ${top3.length?`<br>Destaques: ${top3.map(([n,v])=>`<strong>${n}</strong> (${v.corridas})`).join(', ')}.`:''}`
    );
  }

  // ── Dispatch central — ponto de extensão para Fase 4 ─────────────
  function dispatch(intent, corridas, metricas, motoristas) {
    const lim = intent.limite || 10;
    const ord = intent.ordem  || 'desc';
    switch (intent.tipo) {
      case 'RANK_CANCELAMENTOS':       return qRankCancelamentos(corridas, lim, ord);
      case 'TAXA_CANCELAMENTO':        return qTaxaCancelamento(corridas, lim);
      case 'CANCELAMENTO_POR_HORARIO': return qCancelamentoPorHorario(corridas);
      case 'TENDENCIA_CORRIDAS':       return qTendenciaCorridas(metricas);
      case 'TENDENCIA_CANCELAMENTOS':  return qTendenciaCancelamentos(corridas, metricas);
      case 'PICO_HORARIO':             return qPicoHorario(corridas);
      case 'MADRUGADA':                return qMadrugada(corridas);
      case 'RANK_MACANETA':            return qRankMacaneta(corridas, lim, ord);
      case 'ANALISE_MACANETA':         return qAnaliseMacaneta(corridas);
      case 'RANK_FINALIZADAS':         return qRankFinalizadas(corridas, motoristas, lim, ord);
      case 'PERIODO_DIA':              return qPeriodoDia(corridas, intent.horas||[], intent.label||'');
      case 'HORA_ESPECIFICA':          return qHoraEspecifica(corridas, intent.hora);
      case 'COMPARAR_PERIODOS':        return qCompararPeriodos(corridas, metricas, intent.meses||[]);
      case 'TEMPO_ESPERA':             return qTempoEspera(corridas);
      case 'SEM_DADOS_BAIRRO':         return bloco('Dados indisponíveis', 'O CSV do Rota 77 não inclui colunas de bairro/endereço.');
      default:                         return qResumoGeral(corridas, metricas, motoristas);
    }
  }

  // ── Exibe resposta no histórico ──────────────────────────────────
  function exibirResposta(pergunta, htmlResposta) {
    const historico = document.getElementById('qe-historico');
    if (!historico) return;
    const placeholder = document.getElementById('qe-placeholder');
    if (placeholder) placeholder.remove();
    const item = document.createElement('div');
    item.style.cssText = 'margin-bottom:16px;animation:qeFadeIn .2s ease;';
    item.innerHTML = `
      <div style="font-size:11px;color:var(--cinza4);margin-bottom:6px;font-weight:600;display:flex;align-items:center;gap:6px;">
        <span style="color:var(--vm);">›</span> "${pergunta}"
      </div>
      ${htmlResposta}`;
    historico.insertBefore(item, historico.firstChild);
    historico.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  // ── API pública — Fase 3 (standalone) ───────────────────────────
  window.qePerguntar = function () {
    const input = document.getElementById('qe-input');
    const pergunta = (input ? input.value : '').trim();
    if (!pergunta) return;

    if (!dadosImportados || !dadosImportados.todasCorridas) {
      exibirResposta(pergunta, bloco('Sem dados carregados',
        'Carregue um arquivo CSV primeiro.'));
      return;
    }

    const { todasCorridas, metricas, motoristas } = dadosImportados;
    const intent = detectarIntencao(pergunta);
    exibirResposta(pergunta, dispatch(intent, todasCorridas, metricas, motoristas));
    if (input) input.value = '';
  };

  window.qeSugestao = function (texto) {
    const input = document.getElementById('qe-input');
    if (input) { input.value = texto; input.focus(); }
  };

  // ── Extensão para Fase 4 ─────────────────────────────────────────
  window._qe = {
    dispatch,
    bloco,
    tabela,
    norm,
    MESES_MAP,
    MESES_NOME,
    exibirResposta,
    detectarIntencao,
  };

})();
