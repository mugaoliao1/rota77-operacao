// ── Parser CSV compartilhado ──────────────────────────────────
function parsearCSV(texto) {
  const linhas = texto.split('\n');
  if (linhas.length < 2) throw new Error('Arquivo vazio');

  const sep     = linhas[0].includes(';') ? ';' : ',';
  const headers = linhas[0].split(sep).map(h => h.trim().replace(/"/g, ''));

  const idxStatus     = headers.findIndex(h => h.toLowerCase().includes('status'));
  const idxMomento    = headers.findIndex(h => h.toLowerCase().includes('momento da solicita'));
  const idxDistancia  = headers.findIndex(h => h.toLowerCase().includes('distância do início') || h.toLowerCase().includes('distancia do inicio'));
  const idxTempo      = headers.findIndex(h => h.toLowerCase().includes('tempo do início') || h.toLowerCase().includes('tempo do inicio'));
  const idxMotorista  = headers.findIndex(h => h.toLowerCase() === 'motorista');
  const idxPassageiro = headers.findIndex(h => /passageiro|usu[aá]rio|cliente/.test(h.toLowerCase()));
  const idxMotivo     = headers.findIndex(h => h.toLowerCase().includes('motivo'));

  const metricas              = {};
  const motoristas            = {};
  const metricasPorMotorista  = {};
  const todasCorridas         = [];

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    const cols = linha.split(sep);

    const statusRaw  = (cols[idxStatus] || '').trim().replace(/"/g, '');
    const statusNorm = statusRaw.toLowerCase();

    const momentoRaw = idxMomento >= 0 ? (cols[idxMomento] || '').trim().replace(/"/g, '') : '';
    if (!momentoRaw) continue;

    const partesMomento = momentoRaw.split(' ');
    const partes = partesMomento[0].split('/');
    if (partes.length < 3) continue;
    const data = `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`;

    const hora  = parseInt((partesMomento[1] || '0').split(':')[0]) || 0;
    const tsStr = `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}T${partesMomento[1] || '00:00:00'}`;
    const momentoMs = new Date(tsStr).getTime();

    let km    = 0;
    let tempo = 0;
    if (idxDistancia >= 0) km    = parseFloat((cols[idxDistancia] || '0').replace(',', '.').trim()) || 0;
    if (idxTempo     >= 0) tempo = parseFloat((cols[idxTempo]     || '0').replace(',', '.').trim()) || 0;

    const nomeMotorista = idxMotorista  >= 0 ? (cols[idxMotorista]  || '').trim().replace(/"/g, '') : '';
    const passageiro    = idxPassageiro >= 0 ? (cols[idxPassageiro] || '').trim().replace(/"/g, '') : '';
    const motivo        = idxMotivo     >= 0 ? (cols[idxMotivo]     || '').trim().replace(/"/g, '') : '';

    todasCorridas.push({ statusRaw, statusNorm, data, hora, momentoMs, nomeMotorista, passageiro, motivo, km, tempo });

    if (statusNorm !== 'finalizada') continue;

    if (!metricas[data]) metricas[data] = { corridas: 0, km: 0, tempo_min: 0 };
    metricas[data].corridas++;
    metricas[data].km = Math.round((metricas[data].km + km) * 1000) / 1000;
    metricas[data].tempo_min += tempo;

    if (nomeMotorista) {
      if (!motoristas[nomeMotorista]) motoristas[nomeMotorista] = { corridas: 0, km: 0 };
      motoristas[nomeMotorista].corridas++;
      motoristas[nomeMotorista].km = Math.round((motoristas[nomeMotorista].km + km) * 1000) / 1000;

      if (!metricasPorMotorista[data]) metricasPorMotorista[data] = {};
      if (!metricasPorMotorista[data][nomeMotorista]) metricasPorMotorista[data][nomeMotorista] = { corridas: 0, km: 0 };
      metricasPorMotorista[data][nomeMotorista].corridas++;
      metricasPorMotorista[data][nomeMotorista].km = Math.round((metricasPorMotorista[data][nomeMotorista].km + km) * 1000) / 1000;
    }
  }

  Object.keys(metricas).forEach(d => {
    metricas[d].km        = Math.round(metricas[d].km * 10) / 10;
    metricas[d].tempo_min = Math.round(metricas[d].tempo_min);
  });
  Object.keys(motoristas).forEach(nome => {
    motoristas[nome].km = Math.round(motoristas[nome].km * 10) / 10;
  });

  return { metricas, motoristas, metricasPorMotorista, todasCorridas };
}
