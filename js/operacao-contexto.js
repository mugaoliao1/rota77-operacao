// ── Fase 4: Memória Contextual — Conversa Encadeada ─────────────────
// Requer window._qe (operacao-query-engine.js carregado antes)

(function () {
  // Aguarda Phase 3
  if (typeof window._qe === 'undefined') {
    console.warn('[Fase4] window._qe não encontrado — certifique-se de carregar operacao-query-engine.js antes.');
    return;
  }

  const { dispatch, bloco, tabela, norm, MESES_MAP, MESES_NOME, exibirResposta, detectarIntencao } = window._qe;

  // ── ConversationState — memória da sessão ────────────────────────
  const ctx = {
    historico: [],        // últimas 10 interações { pergunta, intent, filtros, ts }
    filtrosAtivos: {},    // filtros acumulados da conversa
    ultimaIntent: null,   // última intent executada
    topicoAtivo: null,    // 'cancelamentos' | 'finalizadas' | etc.
  };

  // ── Intents que representam apenas um filtro (sem tópico próprio) ─
  const INTENTS_APENAS_FILTRO = new Set([
    'PERIODO_DIA', 'HORA_ESPECIFICA', 'RESUMO_GERAL', 'SEM_DADOS_BAIRRO'
  ]);

  // ── Label legível para cada intent ──────────────────────────────
  const INTENT_LABEL = {
    RANK_CANCELAMENTOS:      'Cancelamentos',
    TAXA_CANCELAMENTO:       'Taxa cancelamento',
    CANCELAMENTO_POR_HORARIO:'Cancel. por hora',
    TENDENCIA_CORRIDAS:      'Tendência corridas',
    TENDENCIA_CANCELAMENTOS: 'Tendência cancel.',
    PICO_HORARIO:            'Pico horário',
    MADRUGADA:               'Madrugada',
    RANK_MACANETA:           'Maçaneta',
    ANALISE_MACANETA:        'Análise maçaneta',
    RANK_FINALIZADAS:        'Finalizadas',
    PERIODO_DIA:             'Período',
    HORA_ESPECIFICA:         'Hora',
    COMPARAR_PERIODOS:       'Comparação',
    TEMPO_ESPERA:            'Duração',
    RESUMO_GERAL:            'Resumo',
  };

  // ── Normaliza mantendo acento removido ───────────────────────────

  // ── Extrai todos os sinais de uma pergunta ───────────────────────
  function extrairSinais(q) {
    const n = norm(q);
    const sinais = { filtros:{}, limite:null, ordem:null, ehCont:false };

    // Marcadores de continuação
    sinais.ehCont =
      /^(e |mas |agora |so |tambem |incluindo |filtr|desses|disso|nesse|nessa|nesses|no mesmo|do mesmo)/.test(n) ||
      /^(e$|so$|mas$|e ai|e o|e a |e os |e as )/.test(n) ||
      (n.length < 32 && !!ctx.ultimaIntent);

    // Meses
    const mesesEnc = Object.keys(MESES_MAP).filter(m => n.includes(m));
    if (mesesEnc.length) sinais.filtros.meses = mesesEnc.map(m => MESES_MAP[m]);

    // Período do dia
    if (/\bmanha\b/.test(n))    { sinais.filtros.horas = [6,7,8,9,10,11];  sinais.filtros.labelPeriodo = 'manhã (6h–11h)'; }
    else if (/\btarde\b/.test(n))    { sinais.filtros.horas = [12,13,14,15,16,17]; sinais.filtros.labelPeriodo = 'tarde (12h–17h)'; }
    else if (/\bnoite\b/.test(n))    { sinais.filtros.horas = [18,19,20,21,22,23]; sinais.filtros.labelPeriodo = 'noite (18h–23h)'; }
    else if (/madrugada/.test(n))    { sinais.filtros.horas = [0,1,2,3,4,5];       sinais.filtros.labelPeriodo = 'madrugada (0h–5h)'; }

    // Hora específica
    const mHora = n.match(/\b(\d{1,2})\s*h\b/);
    if (mHora) { const h=parseInt(mHora[1]); if(h>=0&&h<=23) sinais.filtros.hora=h; }

    // Top N / limite
    const mLim = n.match(/\btop\s+(\d+)\b|\bos\s+(\d+)\b|\b(\d+)\s+(primeiros?|piores?|melhores?|motoristas?)\b/);
    if (mLim) sinais.limite = parseInt(mLim[1]||mLim[2]||mLim[3]);

    // Ordem inversa
    if (/\b(menos|menor|piores?|pior|ultimo|ultimos|menos.*cancel|menos.*corrid|quem.*menos)\b/.test(n)) {
      sinais.ordem = 'asc';
    }

    return sinais;
  }

  // ── Detecta motorista mencionado por nome ────────────────────────
  function detectarMotorista(q, corridas) {
    if (!corridas || !corridas.length) return null;
    const n = norm(q);
    const nomes = [...new Set(corridas.map(c=>c.nomeMotorista).filter(Boolean))];
    // Tenta primeiro nome (pelo menos 3 letras) para evitar falsos positivos
    return nomes.find(nome => {
      const primeiro = norm(nome).split(' ')[0];
      return primeiro.length >= 3 && n.includes(primeiro);
    }) || null;
  }

  // ── Resolve intent + filtros considerando contexto ───────────────
  function resolverComContexto(pergunta, dadosRaw) {
    const sinais   = extrairSinais(pergunta);
    const intentBruta = detectarIntencao(pergunta);

    // Motorista mencionado por nome
    const motoristaNome = detectarMotorista(pergunta, dadosRaw.todasCorridas);
    if (motoristaNome) sinais.filtros.motorista = motoristaNome;

    let intentFinal;
    let filtrosFinal;

    if (!sinais.ehCont || !ctx.ultimaIntent) {
      // ── Pergunta nova ──────────────────────────────────────────
      intentFinal  = intentBruta;
      filtrosFinal = { ...sinais.filtros };

    } else {
      // ── Continuação — herda contexto ──────────────────────────
      const prev = ctx.ultimaIntent;

      // A nova intent tem tópico próprio (não é só um filtro)?
      const temTopicoProprio = !INTENTS_APENAS_FILTRO.has(intentBruta.tipo);

      if (intentBruta.tipo === 'COMPARAR_PERIODOS') {
        // Comparação: constrói lista de meses mesclando contexto + novo mês
        intentFinal = { ...intentBruta };
        if (ctx.filtrosAtivos.meses && intentBruta.meses) {
          const mesesCtx  = ctx.filtrosAtivos.meses.map(n => MESES_NOME[n]).filter(Boolean);
          const mesesNovos = intentBruta.meses;
          intentFinal.meses = [...new Set([...mesesCtx, ...mesesNovos])];
        }
        // Comparação não herda filtro de meses (seria redundante)
        const { meses: _, ...semMeses } = sinais.filtros;
        filtrosFinal = { ...ctx.filtrosAtivos, ...semMeses };
        delete filtrosFinal.meses;

      } else if (temTopicoProprio) {
        // Novo tópico explícito (ex: "e a taxa?") — substitui tópico, herda filtros
        intentFinal  = intentBruta;
        filtrosFinal = { ...ctx.filtrosAtivos, ...sinais.filtros };

      } else {
        // Apenas filtro novo (ex: "e de manhã?", "e só em maio?") — herda tópico anterior
        intentFinal = { ...prev };

        // Se o período é o sinal principal, atualiza intent quando era PERIODO_DIA
        if (sinais.filtros.horas) {
          if (prev.tipo === 'PERIODO_DIA' || INTENTS_APENAS_FILTRO.has(prev.tipo)) {
            intentFinal = {
              tipo: 'PERIODO_DIA',
              horas: sinais.filtros.horas,
              label: sinais.filtros.labelPeriodo || 'período',
            };
          }
        }

        filtrosFinal = { ...ctx.filtrosAtivos, ...sinais.filtros };
      }
    }

    // Aplica modificadores à intent
    if (sinais.limite) intentFinal = { ...intentFinal, limite: sinais.limite };
    if (sinais.ordem)  intentFinal = { ...intentFinal, ordem:  sinais.ordem  };

    return { intentFinal, filtrosFinal, sinais };
  }

  // ── Aplica filtros ao dataset ────────────────────────────────────
  function aplicarFiltros(corridas, metricas, filtros) {
    let c = corridas;
    let m = metricas;

    // Filtro de mês — afeta corridas E metricas
    if (filtros.meses && filtros.meses.length) {
      c = c.filter(r => filtros.meses.includes(parseInt(r.data.split('-')[1])));
      m = Object.fromEntries(
        Object.entries(metricas).filter(([d]) => filtros.meses.includes(parseInt(d.split('-')[1])))
      );
    }

    // Filtro de período (horas do dia) — afeta só corridas
    if (filtros.horas) {
      c = c.filter(r => filtros.horas.includes(r.hora));
    }

    // Filtro de motorista específico
    if (filtros.motorista) {
      c = c.filter(r => norm(r.nomeMotorista||'') === norm(filtros.motorista));
    }

    // Filtro de data início/fim
    if (filtros.dataInicio) c = c.filter(r => r.data >= filtros.dataInicio);
    if (filtros.dataFim)    c = c.filter(r => r.data <= filtros.dataFim);

    return { corridas: c, metricas: m };
  }

  // ── Gera tags legíveis para os filtros ativos ────────────────────
  function tagsDosFiltros(filtros) {
    const tags = [];
    if (filtros.meses && filtros.meses.length) {
      filtros.meses.forEach(m => tags.push({ texto: MESES_NOME[m]||`Mês ${m}`, tipo:'mes' }));
    }
    if (filtros.labelPeriodo) tags.push({ texto: filtros.labelPeriodo, tipo:'periodo' });
    if (filtros.motorista)    tags.push({ texto: filtros.motorista,    tipo:'motorista' });
    if (filtros.dataInicio || filtros.dataFim) {
      tags.push({ texto:`${filtros.dataInicio||'…'} → ${filtros.dataFim||'…'}`, tipo:'data' });
    }
    return tags;
  }

  // ── Atualiza painel visual de contexto ───────────────────────────
  function atualizarPainel() {
    const painel = document.getElementById('qe-ctx-painel');
    if (!painel) return;

    const tags  = tagsDosFiltros(ctx.filtrosAtivos);
    const label = INTENT_LABEL[ctx.ultimaIntent && ctx.ultimaIntent.tipo] || null;
    const temCtx = label || tags.length > 0;

    if (!temCtx) {
      painel.style.display = 'none';
      return;
    }

    painel.style.display = 'flex';
    painel.innerHTML =
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;min-width:0;">
        <span style="font-size:10px;color:var(--cinza4);font-weight:700;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">Contexto ativo:</span>
        ${label ? `<span class="qe-ctx-tag" style="border-color:rgba(215,40,43,.4);color:var(--vm);">${label}</span>` : ''}
        ${tags.map(t => `<span class="qe-ctx-tag">${t.texto}</span>`).join('')}
       </div>
       <button onclick="qeLimparContexto()"
         style="font-size:10px;color:var(--cinza4);background:none;border:1px solid var(--cinza2);border-radius:6px;cursor:pointer;padding:3px 8px;white-space:nowrap;flex-shrink:0;"
         onmouseover="this.style.color='var(--branco)';this.style.borderColor='var(--cinza4)'"
         onmouseout="this.style.color='var(--cinza4)';this.style.borderColor='var(--cinza2)'">
         ✕ Limpar
       </button>`;
  }

  // ── Badge de contexto inline nas respostas ───────────────────────
  function badgeContexto(filtros, ehCont) {
    const tags = tagsDosFiltros(filtros);
    if (!ehCont || !tags.length) return '';
    return `<div style="font-size:10px;color:var(--cinza4);margin-bottom:8px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
      <span style="opacity:.6;">↳ filtros aplicados:</span>
      ${tags.map(t=>`<span class="qe-ctx-tag">${t.texto}</span>`).join('')}
    </div>`;
  }

  // ── Persiste interação na memória ────────────────────────────────
  function salvarHistorico(pergunta, intent, filtros) {
    ctx.historico.unshift({ pergunta, intent, filtros, ts: Date.now() });
    if (ctx.historico.length > 10) ctx.historico.pop();
    ctx.ultimaIntent  = intent;
    ctx.filtrosAtivos = { ...filtros };
    ctx.topicoAtivo   = intent.tipo;
  }

  // ── Override de qePerguntar — versão contextual ──────────────────
  window.qePerguntar = function () {
    const input    = document.getElementById('qe-input');
    const pergunta = (input ? input.value : '').trim();
    if (!pergunta) return;

    // Comandos especiais de texto
    const pn = norm(pergunta);
    if (pn === 'limpar' || pn === 'reset' || pn === 'limpar contexto' || pn === 'novo') {
      window.qeLimparContexto();   // referência explícita — funciona em browser e em testes
      if (input) input.value = '';
      return;
    }

    if (!dadosImportados || !dadosImportados.todasCorridas) {
      exibirResposta(pergunta, bloco('Sem dados carregados', 'Carregue um arquivo CSV primeiro.'));
      return;
    }

    const { todasCorridas, metricas, motoristas } = dadosImportados;
    const { intentFinal, filtrosFinal, sinais } = resolverComContexto(pergunta, dadosImportados);

    // Filtros para aplicar: comparações não filtram por mês (os meses estão na intent)
    const filtrosParaQuery = intentFinal.tipo === 'COMPARAR_PERIODOS'
      ? (({ meses, ...resto }) => resto)(filtrosFinal)
      : filtrosFinal;

    // Aplica filtros ao dataset
    let corridas = todasCorridas;
    let met      = metricas;
    if (Object.keys(filtrosParaQuery).some(k => filtrosParaQuery[k] !== undefined)) {
      const f = aplicarFiltros(todasCorridas, metricas, filtrosParaQuery);
      corridas = f.corridas;
      met      = f.metricas;
    }

    // Dataset vazio após filtro
    if (!corridas.length) {
      const tagsTxt = tagsDosFiltros(filtrosFinal).map(t=>t.texto).join(', ') || '—';
      exibirResposta(pergunta,
        bloco('Sem resultados para esses filtros',
          `Nenhuma corrida encontrada com: <strong>${tagsTxt}</strong>.<br>
           Tente ampliar o período ou remover algum filtro (digite "limpar" para resetar).`)
      );
      salvarHistorico(pergunta, intentFinal, filtrosFinal);
      atualizarPainel();
      if (input) input.value = '';
      return;
    }

    // Executa query via dispatch da Fase 3
    const htmlResp = dispatch(intentFinal, corridas, met, motoristas);

    // Monta resposta com badge de contexto
    exibirResposta(pergunta, badgeContexto(filtrosFinal, sinais.ehCont) + htmlResp);

    salvarHistorico(pergunta, intentFinal, filtrosFinal);
    atualizarPainel();
    if (input) input.value = '';
  };

  // ── Limpar contexto ──────────────────────────────────────────────
  window.qeLimparContexto = function () {
    ctx.historico     = [];
    ctx.filtrosAtivos = {};
    ctx.ultimaIntent  = null;
    ctx.topicoAtivo   = null;
    atualizarPainel();

    const hist = document.getElementById('qe-historico');
    if (hist) {
      hist.innerHTML =
        `<div id="qe-placeholder" style="text-align:center;padding:24px 0;color:var(--cinza4);font-size:12px;">
          Contexto limpo. Faça sua próxima pergunta.
         </div>`;
    }
    const input = document.getElementById('qe-input');
    if (input) { input.value = ''; input.focus(); }
  };

  // ── Expõe estado para debug ──────────────────────────────────────
  window._qeCtx = ctx;

})();
