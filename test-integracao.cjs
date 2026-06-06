/* eslint-disable */
const fs = require('fs');

// Mock browser
global.window   = {};
const respostas = [];
let lastInput   = '';

global.document = {
  createElement: function(tag) {
    return { tagName:(tag||'div').toUpperCase(), innerHTML:'', style:{}, value:'',
      firstChild:null, children:[], remove:function(){}, scrollIntoView:function(){},
      setAttribute:function(){}, getAttribute:function(){ return null; }, insertBefore:function(){} };
  },
  getElementById: function(id) {
    if (id === 'qe-historico') return {
      insertBefore: function(el) { respostas.push(el.innerHTML || ''); },
      scrollIntoView: function(){}
    };
    if (id === 'qe-input')       return { value: lastInput, focus: function(){} };
    if (id === 'qe-placeholder') return null;
    return { innerHTML:'', style:{}, classList:{ add:function(){}, remove:function(){} } };
  },
};

const BASE_OP = 'C:\\Users\\mugao\\OneDrive\\Desktop\\rota77-operacao\\';
const CSV_PATH = 'C:\\Users\\mugao\\Downloads\\01a22maio.csv';

eval(fs.readFileSync(BASE_OP + 'js\\csv.js', 'utf8'));
eval(fs.readFileSync(BASE_OP + 'js\\operacao-query-engine.js', 'utf8'));
eval(fs.readFileSync(BASE_OP + 'js\\operacao-contexto.js', 'utf8'));

const c = { g:'\x1b[32m', r:'\x1b[31m', b:'\x1b[36m', d:'\x1b[2m', rst:'\x1b[0m' };
let passes=0, fails=0;
function ok(msg)   { console.log('  ' + c.g + String.fromCharCode(9989) + c.rst + ' ' + msg); passes++; }
function fail(msg) { console.log('  ' + c.r + String.fromCharCode(10060) + c.rst + ' ' + msg); fails++; }
function head(msg) { console.log('\n' + c.b + '-- ' + msg + ' ' + c.d + '-'.repeat(Math.max(0,60-msg.length)) + c.rst); }
function stripHtml(h){ return h.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }

// ── Módulos ──────────────────────────────────────────────────────
head('Carregamento dos modulos');
if (typeof window._qe === 'object')              ok('window._qe exposto');
else                                             fail('window._qe ausente');
if (typeof window._qe.dispatch === 'function')   ok('_qe.dispatch disponivel');
else                                             fail('_qe.dispatch ausente');
if (typeof window.qePerguntar === 'function')    ok('window.qePerguntar (Fase 4)');
else                                             fail('window.qePerguntar ausente');
if (typeof window.qeLimparContexto === 'function') ok('window.qeLimparContexto');
else                                             fail('window.qeLimparContexto ausente');
if (typeof parsearCSV === 'function')            ok('parsearCSV (rota77 csv.js)');
else                                             fail('parsearCSV ausente');

// ── CSV ──────────────────────────────────────────────────────────
head('Parsing CSV real');
var resultado;
try {
  resultado = parsearCSV(fs.readFileSync(CSV_PATH, 'latin1'));
  ok('CSV: ' + resultado.todasCorridas.length.toLocaleString('pt-BR') + ' corridas, ' +
     Object.keys(resultado.motoristas).length + ' motoristas, ' +
     Object.keys(resultado.metricas).length + ' dias');
} catch(e) { fail('Erro CSV: ' + e.message); process.exit(1); }

// Simula bridge do operacao.js
global.dadosImportados = {
  todasCorridas: resultado.todasCorridas,
  metricas:      resultado.metricas,
  motoristas:    resultado.motoristas
};

var dispatch = window._qe.dispatch;
var detectarIntencao = window._qe.detectarIntencao;
var todasCorridas = resultado.todasCorridas;
var metricas = resultado.metricas;
var motoristas = resultado.motoristas;

// ── Intents ──────────────────────────────────────────────────────
head('Deteccao de Intent (14 casos)');
var CASOS = [
  ['Quem mais cancelou?',               'RANK_CANCELAMENTOS'],
  ['Qual a taxa de cancelamento?',      'TAXA_CANCELAMENTO'],
  ['Quando ocorre mais cancelamento?',  'CANCELAMENTO_POR_HORARIO'],
  ['Os cancelamentos estao aumentando?','TENDENCIA_CANCELAMENTOS'],
  ['Qual horario tem mais corridas?',   'PICO_HORARIO'],
  ['Qual foi o pico operacional?',      'PICO_HORARIO'],
  ['Quem mais trabalha na madrugada?',  'MADRUGADA'],
  ['Qual motorista tem mais macaneta?', 'RANK_MACANETA'],
  ['Quem mais finalizou corridas?',     'RANK_FINALIZADAS'],
  ['Como foi o periodo da manha?',      'PERIODO_DIA'],
  ['Como foi as 22h?',                  'HORA_ESPECIFICA'],
  ['Compare maio com abril',            'COMPARAR_PERIODOS'],
  ['Qual o tempo medio de corrida?',    'TEMPO_ESPERA'],
  ['Me da um resumo geral',             'RESUMO_GERAL']
];
CASOS.forEach(function(par) {
  var q = par[0], esp = par[1];
  var got = detectarIntencao(q).tipo;
  if (got === esp) ok('"' + q + '"');
  else             fail('"' + q + '" esperado ' + esp + ', obtido ' + got);
});

// ── Queries ──────────────────────────────────────────────────────
head('Queries com dados reais');
function testar(nome, intent, validacoes) {
  try {
    var html  = dispatch(intent, todasCorridas, metricas, motoristas);
    var texto = stripHtml(html);
    validacoes.forEach(function(par) {
      var msg = par[0], fn = par[1];
      if (fn(texto, html)) ok(nome + ': ' + msg);
      else                 fail(nome + ': ' + msg);
    });
  } catch(e) { fail(nome + ' ERRO: ' + e.message); }
}

testar('RANK_CANCELAMENTOS', { tipo:'RANK_CANCELAMENTOS' }, [
  ['retorna HTML', function(t){ return t.length>10; }],
  ['menciona cancel', function(t){ return /cancel/i.test(t); }]
]);
testar('TAXA_CANCELAMENTO', { tipo:'TAXA_CANCELAMENTO' }, [
  ['retorna HTML', function(t){ return t.length>10; }],
  ['tem %', function(t){ return /%/.test(t); }]
]);
testar('PICO_HORARIO', { tipo:'PICO_HORARIO' }, [
  ['retorna HTML', function(t){ return t.length>10; }],
  ['tem Nh', function(t){ return /\d+h/.test(t); }]
]);
testar('MADRUGADA',       { tipo:'MADRUGADA' },       [['retorna HTML', function(t){ return t.length>10; }]]);
testar('RANK_MACANETA',   { tipo:'RANK_MACANETA' },   [['retorna HTML', function(t){ return t.length>10; }]]);
testar('RANK_FINALIZADAS',{ tipo:'RANK_FINALIZADAS' },[
  ['retorna HTML', function(t){ return t.length>10; }],
  ['tem nome', function(t){
    return Object.keys(motoristas).some(function(n){ return t.includes(n.split(' ')[0]); });
  }]
]);
testar('PERIODO_DIA', { tipo:'PERIODO_DIA', horas:[6,7,8,9,10,11], label:'manha (6h-11h)' }, [
  ['retorna HTML', function(t){ return t.length>10; }]
]);
testar('HORA_ESPECIFICA 22h', { tipo:'HORA_ESPECIFICA', hora:22 }, [
  ['menciona 22h', function(t){ return /22h/.test(t); }]
]);
testar('RESUMO_GERAL', { tipo:'RESUMO_GERAL' }, [
  ['retorna HTML', function(t){ return t.length>10; }],
  ['menciona total', function(t){ return /solicit|corrida/i.test(t); }]
]);

// ── Memoria contextual ───────────────────────────────────────────
head('Memoria Contextual (Fase 4)');
function ask(txt) {
  lastInput = txt;
  respostas.length = 0;
  try { window.qePerguntar(); } catch(e) {}
  return respostas[0] || '';
}

var r1 = ask('Quem mais cancelou?');
if (r1.length>10)  ok('1a pergunta retorna resposta');
else               fail('1a pergunta vazia');

if (window._qeCtx && window._qeCtx.ultimaIntent &&
    window._qeCtx.ultimaIntent.tipo === 'RANK_CANCELAMENTOS')
                   ok('ultimaIntent=RANK_CANCELAMENTOS');
else               fail('ultimaIntent nao salva');

var r2 = ask('E de manha?');
if (r2.length>10)  ok('Cont. "E de manha?" retorna resposta');
else               fail('Cont. "E de manha?" vazio');
if (window._qeCtx.filtrosAtivos && window._qeCtx.filtrosAtivos.horas &&
    window._qeCtx.filtrosAtivos.horas.includes(6))
                   ok('Filtro horas manha acumulado');
else               fail('Filtro horas manha nao acumulado');

var r3 = ask('Quem menos cancelou?');
if (window._qeCtx.ultimaIntent && window._qeCtx.ultimaIntent.ordem === 'asc')
                   ok('Ordem ASC detectada');
else               fail('Ordem ASC nao detectada');

var r4 = ask('Os top 3');
if (window._qeCtx.ultimaIntent && window._qeCtx.ultimaIntent.limite === 3)
                   ok('Limite 3 aplicado');
else               fail('Limite 3 nao aplicado');

ask('limpar');
if (!window._qeCtx.ultimaIntent && Object.keys(window._qeCtx.filtrosAtivos).length===0)
                   ok('Contexto limpo apos "limpar"');
else               fail('Contexto nao limpo');

global.dadosImportados = null;
var rSem = ask('Quem cancelou?');
if (rSem.includes('dados') || rSem.includes('CSV'))
                   ok('Sem dados: resposta adequada');
else               fail('Sem dados: resposta inadequada');
global.dadosImportados = { todasCorridas: todasCorridas, metricas: metricas, motoristas: motoristas };
window.qeLimparContexto();

// ── Regressao: estrutura index.html ─────────────────────────────
head('Regressao: index.html intacto');
var idx = fs.readFileSync(BASE_OP + 'index.html', 'utf8');
['page-escala','page-boletim','page-radar','page-operacao',
 'page-op-historico','page-frota','page-historico','page-config'].forEach(function(id) {
  if (idx.includes('id="' + id + '"')) ok('#' + id + ' presente');
  else                                 fail('#' + id + ' ausente');
});
['card-conversa-dados','qe-input','qe-historico','qe-ctx-painel'].forEach(function(id) {
  if (idx.includes(id)) ok('QE element #' + id);
  else                  fail('QE element #' + id + ' ausente');
});
if (idx.includes('operacao-query-engine.js')) ok('script: operacao-query-engine.js');
else                                          fail('script: operacao-query-engine.js ausente');
if (idx.includes('operacao-contexto.js'))     ok('script: operacao-contexto.js');
else                                          fail('script: operacao-contexto.js ausente');
if (idx.includes('--preto3'))                 ok('CSS alias --preto3');
else                                          fail('CSS alias --preto3 ausente');

// ── MidiaCar comercial intacto ───────────────────────────────────
head('MidiaCar comercial nao alterado');
var diffOut = require('child_process').execSync(
  'git -C "C:\\Users\\mugao\\OneDrive\\Desktop\\MidiaCar" diff --name-only HEAD 2>nul || git -C "C:\\\\Users\\\\mugao\\\\OneDrive\\\\Desktop\\\\MídiaCar" diff --name-only HEAD',
  { encoding:'utf8', stdio:['pipe','pipe','pipe'] }
);
if (!diffOut.includes('painel.html')) ok('dist/painel.html nao alterado');
else                                  fail('dist/painel.html foi alterado!');

// ── Resultado ────────────────────────────────────────────────────
var total = passes + fails;
head('RESULTADO');
console.log('\n  Testes executados: ' + total);
console.log('  ' + c.g + 'Passou: ' + passes + c.rst);
console.log('  ' + (fails>0?c.r:c.g) + 'Falhou: ' + fails + c.rst);
console.log('  Taxa: ' + Math.round(passes/total*100) + '%\n');
if (fails === 0) {
  console.log('  ' + c.g + 'PASS -- integracao validada com dados reais do Rota 77' + c.rst + '\n');
} else {
  console.log('  ' + c.r + 'FAIL' + c.rst + '\n');
  process.exit(1);
}
