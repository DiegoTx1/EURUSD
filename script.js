// =============================================
// CONFIGURAÇÕES GLOBAIS (AJUSTADAS PARA EUR/USD M1)
// =============================================

const state = {
  ultimos: [],
  timer: 60,
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  dadosHistoricos: [],
  resistenciaKey: 0,
  suporteKey: 0,
  rsiCache: { avgGain: 0, avgLoss: 0, initialized: false },
  macdCache: { emaRapida: null, emaLenta: null, macdLine: [], signalLine: [] },
  superTrendCache: [],
  atrGlobal: 0,
  rsiHistory: [],
  cooldown: 0
};

const CONFIG = {
  API_ENDPOINTS: {
    TWELVE_DATA: "https://api.twelvedata.com"
  },
  PARES: {
    CRYPTO_IDX: "EUR/USD"           // mudou para EUR/USD
  },
  PERIODOS: {
    RSI: 14,                        // passou de 9 para 14
    EMA_CURTA: 9,                   // EMA rápida
    EMA_MEDIA: 21,                  // EMA média
    EMA_LONGA: 50,                  // EMA longa
    MACD_RAPIDA: 12,                // MACD rápido
    MACD_LENTA: 26,                 // MACD lento
    MACD_SINAL: 9,                  // MACD sinal
    BOLLINGER: 20,                  // período BB
    ATR: 14,                        // ATR
    SUPERTREND: 7,
    VELAS_CONFIRMACAO: 3,
    ANALISE_LATERAL: 20,
    DIVERGENCIA_LOOKBACK: 8,
    EXTREME_LOOKBACK: 2
  },
  LIMIARES: {
    SCORE_ALTO: 85,
    SCORE_MEDIO: 70,
    RSI_OVERBOUGHT: 70,             // ajustados 70/30
    RSI_OVERSOLD: 30,
    VARIACAO_LATERAL: 0.001,         // menor volatilidade Forex
    ATR_LIMIAR: 0.0015,
    LATERALIDADE_LIMIAR: 0.001
  },
  PESOS: {
    RSI: 1.5,
    MACD: 2.0,
    TENDENCIA: 2.5,
    BOLLINGER: 1.2,
    SUPERTREND: 1.8,
    DIVERGENCIA: 1.8,
    VOLUME: 1.0
  }
};

// =============================================
// CHAVES API
// =============================================

const API_KEYS = [
  "0105e6681b894e0185704171c53f5075"
];
let currentKeyIndex = 0;
let errorCount = 0;

// =============================================
// UTILITÁRIOS DE CÁLCULO
// =============================================

const calcularMedia = {
  simples: (dados, periodo) => {
    if (dados.length < periodo) return 0;
    return dados.slice(-periodo).reduce((a, b) => a + b, 0) / periodo;
  },
  exponencial: (dados, periodo) => {
    if (dados.length < periodo) return [];
    const k = 2 / (periodo + 1);
    let ema = calcularMedia.simples(dados.slice(0, periodo), periodo);
    const emaArray = [ema];
    for (let i = periodo; i < dados.length; i++) {
      ema = dados[i] * k + ema * (1 - k);
      emaArray.push(ema);
    }
    return emaArray;
  }
};

function calcularRSI(closes, periodo = CONFIG.PERIODOS.RSI) {
  if (closes.length < periodo + 1) return 50;
  if (!state.rsiCache.initialized) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= periodo; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    state.rsiCache.avgGain = gains / periodo;
    state.rsiCache.avgLoss = losses / periodo;
    state.rsiCache.initialized = true;
  } else {
    const d = closes.at(-1) - closes.at(-2);
    state.rsiCache.avgGain = ((state.rsiCache.avgGain * (periodo - 1)) + Math.max(d,0)) / periodo;
    state.rsiCache.avgLoss = ((state.rsiCache.avgLoss * (periodo - 1)) + Math.max(-d,0)) / periodo;
  }
  const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularMACD(closes) {
  const rapida = CONFIG.PERIODOS.MACD_RAPIDA, lenta = CONFIG.PERIODOS.MACD_LENTA, sinal = CONFIG.PERIODOS.MACD_SINAL;
  const emaR = calcularMedia.exponencial(closes, rapida);
  const emaL = calcularMedia.exponencial(closes, lenta);
  const start = emaL.length > emaR.length ? emaL.length - emaR.length : 0;
  const macdLine = emaR.slice(start).map((v,i) => v - emaL[i]);
  const signalLine = calcularMedia.exponencial(macdLine, sinal);
  const hist = macdLine.at(-1) - (signalLine.at(-1)||0);
  return { histograma: hist, macd: macdLine.at(-1)||0, signal: signalLine.at(-1)||0 };
}

function calcularBollinger(closes, periodo = CONFIG.PERIODOS.BOLLINGER) {
  if (closes.length < periodo) return { upper:0, lower:0, media:0 };
  const slice = closes.slice(-periodo);
  const m = calcularMedia.simples(slice, periodo);
  const sd = Math.sqrt(slice.reduce((s,v)=>s+Math.pow(v-m,2),0)/periodo);
  return { upper: m + 2*sd, lower: m - 2*sd, media: m };
}

function calcularATR(dados, periodo = CONFIG.PERIODOS.ATR) {
  if (dados.length < periodo+1) return 0;
  const trs = [];
  for (let i = 1; i < dados.length; i++) {
    const cur = dados[i], prev = dados[i-1];
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  return calcularMedia.simples(trs.slice(-periodo), periodo);
}

function calcularVolumeRatio(volumes, periodo=20) {
  if (volumes.length < periodo) return 1;
  const m = calcularMedia.simples(volumes, periodo);
  return m>0 ? volumes.at(-1)/m : 1;
}

// =============================================
// SUPERTREND e DIVERGÊNCIA mantidos do original
// =============================================

function calcularSuperTrend(dados, periodo = CONFIG.PERIODOS.SUPERTREND, mult = 3) {
  if (dados.length < periodo) return { direcao:0, valor:0 };
  if (state.atrGlobal === 0) state.atrGlobal = calcularATR(dados, periodo);
  const { high, low, close } = dados.at(-1);
  const hl2 = (high + low)/2;
  const atr = state.atrGlobal;
  const up = hl2 + mult*atr, dn = hl2 - mult*atr;
  const prev = state.superTrendCache.at(-1);
  let direcao = 1, valor = up;
  if (prev) {
    direcao = prev.valor < dados.at(-2).close ? 1 : -1;
    valor = direcao>0 ? Math.max(dn, prev.valor) : Math.min(up, prev.valor);
  }
  state.superTrendCache.push({ direcao, valor });
  return { direcao, valor };
}

function detectarDivergencias(closes, rsis, highs, lows) {
  const lb = CONFIG.PERIODOS.DIVERGENCIA_LOOKBACK, elb = CONFIG.PERIODOS.EXTREME_LOOKBACK;
  const find = (arr, high=true) => {
    const ex = [];
    for (let i = elb; i < arr.length-elb; i++) {
      let ok = true;
      for (let j=1; j<=elb; j++){
        if (high ? (arr[i]<=arr[i-j]||arr[i]<=arr[i+j]) : (arr[i]>=arr[i-j]||arr[i]>=arr[i+j])) { ok=false; break; }
      }
      if (ok) ex.push({i,val:arr[i]});
    }
    return ex;
  };
  const ph = find(highs,true), pl = find(lows,false), rh = find(rsis,true), rl = find(rsis,false);
  let div=false, tipo="NENHUMA";
  if (ph.length>=2 && rh.length>=2) {
    const [p1,p0]=ph.slice(-2), [r1,r0]=rh.slice(-2);
    if (p0.val< p1.val && r0.val>r1.val) { div=true; tipo="BAIXA"; }
  }
  if (pl.length>=2 && rl.length>=2) {
    const [p1,p0]=pl.slice(-2), [r1,r0]=rl.slice(-2);
    if (p0.val>p1.val && r0.val<r1.val) { div=true; tipo="ALTA"; }
  }
  return { divergenciaRSI: div, tipoDivergencia: tipo };
}

// =============================================
// GERAÇÃO DE SINAL E SCORE
// =============================================

function gerarSinal(ind) {
  const { rsi, macd, tripleEMA, bollinger, close, superTrend, divergencias, volumeRatio } = ind;
  // tendência EMA
  if      (tripleEMA.ema9 > tripleEMA.ema21 && tripleEMA.ema21 > tripleEMA.ema50) ind.tendencia="ALTA";
  else if (tripleEMA.ema9 < tripleEMA.ema21 && tripleEMA.ema21 < tripleEMA.ema50) ind.tendencia="BAIXA";
  else ind.tendencia="NEUTRA";
  // sinal principal
  if (ind.tendencia==="ALTA" && close > bollinger.media && rsi<30) return "CALL";
  if (ind.tendencia==="BAIXA" && close < bollinger.media && rsi>70) return "PUT";
  // divergência
  if (divergencias.divergenciaRSI) {
    if (divergencias.tipoDivergencia==="ALTA") return "CALL";
    if (divergencias.tipoDivergencia==="BAIXA")return "PUT";
  }
  return "ESPERAR";
}

function calcularScore(sinal, ind) {
  let score = 65;
  const { rsi, macd, tripleEMA, bollinger, superTrend, divergencias, volumeRatio } = ind;
  // alinhamento de EMA
  if (sinal==="CALL" && tripleEMA.ema9>tripleEMA.ema21&&tripleEMA.ema21>tripleEMA.ema50) score+=CONFIG.PESOS.TENDENCIA*10;
  if (sinal==="PUT"  && tripleEMA.ema9<tripleEMA.ema21&&tripleEMA.ema21<tripleEMA.ema50) score+=CONFIG.PESOS.TENDENCIA*10;
  // MACD
  if (sinal==="CALL" && macd.histograma>0) score+=CONFIG.PESOS.MACD*10;
  if (sinal==="PUT"  && macd.histograma<0) score+=CONFIG.PESOS.MACD*10;
  // RSI
  if (sinal==="CALL" && rsi<30) score+=CONFIG.PESOS.RSI*10;
  if (sinal==="PUT"  && rsi>70) score+=CONFIG.PESOS.RSI*10;
  // Bollinger
  if (sinal==="CALL" && close< bollinger.lower) score+=CONFIG.PESOS.BOLLINGER*5;
  if (sinal==="PUT"  && close> bollinger.upper) score+=CONFIG.PESOS.BOLLINGER*5;
  // SuperTrend
  if (sinal==="CALL" && close> superTrend.valor && superTrend.direcao>0) score+=CONFIG.PESOS.SUPERTREND*5;
  if (sinal==="PUT"  && close< superTrend.valor && superTrend.direcao<0) score+=CONFIG.PESOS.SUPERTREND*5;
  // Divergência
  if (divergencias.divergenciaRSI) score+=CONFIG.PESOS.DIVERGENCIA*10;
  // Volume
  if (volumeRatio>1.5) score+=CONFIG.PESOS.VOLUME*5;
  return Math.min(100, Math.max(0, score));
}

// =============================================
// OBTENÇÃO DE DADOS
// =============================================

async function obterDadosTwelveData() {
  const key = API_KEYS[currentKeyIndex];
  const url = `${CONFIG.API_ENDPOINTS.TWELVE_DATA}/time_series?symbol=${CONFIG.PARES.CRYPTO_IDX}&interval=1min&outputsize=100&apikey=${key}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`API erro ${resp.status}`);
  const d = await resp.json();
  if (d.status==="error") throw new Error(d.message);
  return d.values.reverse().map(v=>({
    time: v.datetime,
    open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +v.volume||1
  }));
}

// =============================================
// ANÁLISE PRINCIPAL
// =============================================

async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  try {
    const dados = await obterDadosTwelveData();
    state.dadosHistoricos = dados;
    const closes = dados.map(o=>o.close),
          highs  = dados.map(o=>o.high),
          lows   = dados.map(o=>o.low),
          volumes= dados.map(o=>o.volume);
    const rsi = calcularRSI(closes),
          macd= calcularMACD(closes),
          tripleEMA = {
            ema9: calcularMedia.exponencial(closes,CONFIG.PERIODOS.EMA_CURTA).at(-1),
            ema21:calcularMedia.exponencial(closes,CONFIG.PERIODOS.EMA_MEDIA).at(-1),
            ema50:calcularMedia.exponencial(closes,CONFIG.PERIODOS.EMA_LONGA).at(-1)
          },
          boll = calcularBollinger(closes),
          atr  = calcularATR(dados),
          superTrend = calcularSuperTrend(dados),
          divergencias= detectarDivergencias(closes,state.rsiHistory,highs,lows),
          volumeRatio = calcularVolumeRatio(volumes);
    state.rsiHistory = closes.map((_,i)=> calcularRSI(closes.slice(0,i+1), CONFIG.PERIODOS.RSI));
    const indicadores = { close: closes.at(-1), rsi, macd, tripleEMA, bollinger: boll, atr, superTrend, divergencias, volumeRatio };
    let sinal = gerarSinal(indicadores);
    if (sinal!=="ESPERAR" && state.cooldown<=0) state.cooldown=3;
      else if(state.cooldown>0){ state.cooldown--; sinal="ESPERAR"; }
    const score = calcularScore(sinal, indicadores);
    state.ultimoSinal = sinal; state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    atualizarInterface(sinal, score, indicadores);
    state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
    if(state.ultimos.length>8) state.ultimos.pop();
    state.tentativasErro=0;
  } catch(e){
    console.error(e);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// ATUALIZAÇÃO DA INTERFACE (idéntica ao original)
// =============================================

function atualizarInterface(sinal, score, ind){
  const cmd = document.getElementById("comando"),
        scr = document.getElementById("score"),
        ult = document.getElementById("ultimos"),
        cri = document.getElementById("criterios"),
        hor = document.getElementById("hora"),
        tit = document.getElementById("ultima-atualizacao");
  cmd.textContent = sinal + (sinal==="CALL"?" 📈":sinal==="PUT"?" 📉":" ✋");
  cmd.className = sinal.toLowerCase();
  scr.textContent = `Confiança: ${score}%`;
  hor.textContent = state.ultimaAtualizacao;
  tit.textContent = state.ultimaAtualizacao;
  ult.innerHTML = state.ultimos.map(i=>`<li>${i}</li>`).join("");
  cri.innerHTML = `
    <li>📊 RSI: ${ind.rsi.toFixed(2)}</li>
    <li>📉 EMA9:${ind.tripleEMA.ema9.toFixed(5)} EMA21:${ind.tripleEMA.ema21.toFixed(5)} EMA50:${ind.tripleEMA.ema50.toFixed(5)}</li>
    <li>📈 Bollinger:${ind.bollinger.lower.toFixed(5)}~${ind.bollinger.upper.toFixed(5)}</li>
    <li>⚡ ATR:${ind.atr.toFixed(5)}</li>
    <li>🔄 Divergência:${ind.divergencias.tipoDivergencia}</li>
    <li>💹 VolumeR:${ind.volumeRatio.toFixed(2)}</li>
  `;
}

// =============================================
// TIMER E INICIALIZAÇÃO (idênticos ao original)
// =============================================

function sincronizarTimer(){
  clearInterval(state.intervaloAtual);
  const seg = 60 - new Date().getSeconds();
  state.timer = seg;
  const el = document.getElementById("timer");
  el.textContent = `0:${seg.toString().padStart(2,'0')}`;
  el.style.color = seg<=5?'red':'';
  state.intervaloAtual = setInterval(()=>{
    state.timer--;
    el.textContent = `0:${state.timer.toString().padStart(2,'0')}`;
    el.style.color = state.timer<=5?'red':'';
    if(state.timer<=0){ clearInterval(state.intervaloAtual); analisarMercado(); sincronizarTimer();}
  },1000);
}

function atualizarRelogio(){
  const el = document.getElementById("hora");
  state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
  el.textContent = state.ultimaAtualizacao;
}

function iniciarAplicativo(){
  // (Aqui assume-se que seu HTML já existe conforme versão original)
  setInterval(atualizarRelogio,1000);
  sincronizarTimer();
  setTimeout(analisarMercado,1000);
}

if(document.readyState==="complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
