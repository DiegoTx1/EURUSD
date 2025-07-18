// =============================================
// ROBÔ TURBO EUR/USD - SINAIS REAIS (API TWELVE DATA)
// =============================================

// CONFIGURAÇÕES GLOBAIS

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
  tendenciaDetectada: "NEUTRA",
  forcaTendencia: 0,
  rsiCache: { avgGain: 0, avgLoss: 0, initialized: false },
  macdCache: { emaRapida: null, emaLenta: null, macdLine: [], signalLine: [] },
  cooldown: 0
};

const CONFIG = {
  API_KEY: "0105e6681b894e0185704171c53f5075",
  PAIR: "EUR/USD",
  INTERVAL: "1min",
  RSI_PERIOD: 14,
  EMA9: 9,
  EMA21: 21,
  EMA50: 50,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  BOLLINGER_PERIOD: 20,
  SCORE_MINIMO: 70
};

// =============================================
// INDICADORES

const calcularMedia = {
  simples: (dados, periodo) => dados.length >= periodo ? dados.slice(-periodo).reduce((a, b) => a + b, 0) / periodo : 0,
  exponencial: (dados, periodo) => {
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

function calcularRSI(closes, periodo = CONFIG.RSI_PERIOD) {
  if (closes.length < periodo + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= periodo; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / periodo;
  const avgLoss = losses / periodo;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularMACD(closes) {
  const emaRapida = calcularMedia.exponencial(closes, CONFIG.MACD_FAST);
  const emaLenta = calcularMedia.exponencial(closes, CONFIG.MACD_SLOW);
  const macdLine = emaRapida.slice(-emaLenta.length).map((v, i) => v - emaLenta[i]);
  const signalLine = calcularMedia.exponencial(macdLine, CONFIG.MACD_SIGNAL);
  const histograma = macdLine.at(-1) - signalLine.at(-1);
  return { histograma, macd: macdLine.at(-1), sinal: signalLine.at(-1) };
}

function calcularTripleEMA(closes) {
  const ema9 = calcularMedia.exponencial(closes, CONFIG.EMA9).at(-1);
  const ema21 = calcularMedia.exponencial(closes, CONFIG.EMA21).at(-1);
  const ema50 = calcularMedia.exponencial(closes, CONFIG.EMA50).at(-1);
  return { ema9, ema21, ema50 };
}

function calcularBollinger(closes) {
  const periodo = CONFIG.BOLLINGER_PERIOD;
  const slice = closes.slice(-periodo);
  const media = calcularMedia.simples(slice, periodo);
  const desvio = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - media, 2), 0) / periodo);
  return {
    upper: media + 2 * desvio,
    lower: media - 2 * desvio,
    media
  };
}

// =============================================
// GERADOR DE SINAL

function gerarSinal(ind) {
  const { rsi, macd, close, tripleEMA, bollinger } = ind;
  if (rsi < 30 && macd.histograma > 0 && tripleEMA.ema9 > tripleEMA.ema21 && close < bollinger.lower)
    return "CALL";
  if (rsi > 70 && macd.histograma < 0 && tripleEMA.ema9 < tripleEMA.ema21 && close > bollinger.upper)
    return "PUT";
  return "ESPERAR";
}

function calcularScore(sinal, ind) {
  let score = 60;
  if (sinal === "CALL") {
    if (ind.tripleEMA.ema9 > ind.tripleEMA.ema21 && ind.tripleEMA.ema21 > ind.tripleEMA.ema50) score += 15;
    if (ind.macd.histograma > 0) score += 10;
    if (ind.rsi < 30) score += 10;
    if (ind.close < ind.bollinger.lower) score += 5;
  }
  if (sinal === "PUT") {
    if (ind.tripleEMA.ema9 < ind.tripleEMA.ema21 && ind.tripleEMA.ema21 < ind.tripleEMA.ema50) score += 15;
    if (ind.macd.histograma < 0) score += 10;
    if (ind.rsi > 70) score += 10;
    if (ind.close > ind.bollinger.upper) score += 5;
  }
  return Math.min(100, score);
}

// =============================================
// API DE DADOS

async function obterDados() {
  const url = `https://api.twelvedata.com/time_series?symbol=${CONFIG.PAIR}&interval=${CONFIG.INTERVAL}&outputsize=100&apikey=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.values.reverse().map(i => ({
    open: parseFloat(i.open),
    high: parseFloat(i.high),
    low: parseFloat(i.low),
    close: parseFloat(i.close),
    time: i.datetime
  }));
}

// =============================================
// CICLO PRINCIPAL

async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  try {
    const dados = await obterDados();
    const closes = dados.map(v => v.close);
    const close = closes.at(-1);
    const rsi = calcularRSI(closes);
    const macd = calcularMACD(closes);
    const tripleEMA = calcularTripleEMA(closes);
    const bollinger = calcularBollinger(closes);
    const indicadores = { close, rsi, macd, tripleEMA, bollinger };
    const sinal = gerarSinal(indicadores);
    const score = calcularScore(sinal, indicadores);
    if (score >= CONFIG.SCORE_MINIMO && state.cooldown === 0) {
      state.ultimoSinal = sinal;
      state.ultimoScore = score;
      state.ultimos.unshift(`${new Date().toLocaleTimeString()} - ${sinal} (${score}%)`);
      if (state.ultimos.length > 8) state.ultimos.pop();
      state.cooldown = 3;
    } else {
      state.ultimoSinal = "ESPERAR";
      state.ultimoScore = score;
      if (state.cooldown > 0) state.cooldown--;
    }
    atualizarInterface();
  } catch (e) {
    console.error("Erro:", e);
  }
  state.leituraEmAndamento = false;
}

// =============================================
// INTERFACE HTML

function atualizarInterface() {
  const comando = document.getElementById("comando");
  const score = document.getElementById("score");
  const ultimos = document.getElementById("ultimos");
  comando.textContent = state.ultimoSinal;
  score.textContent = `Confiança: ${state.ultimoScore}%`;
  ultimos.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");
}

// =============================================
// TIMER E INICIALIZAÇÃO

function iniciarTimer() {
  const timerElem = document.getElementById("timer");
  const relogio = setInterval(() => {
    state.timer--;
    timerElem.textContent = `0:${state.timer.toString().padStart(2, "0")}`;
    if (state.timer <= 0) {
      clearInterval(relogio);
      analisarMercado();
      state.timer = 60;
      iniciarTimer();
    }
  }, 1000);
}

function iniciarAplicativo() {
  document.body.innerHTML = `
    <div style="max-width:600px;margin:20px auto;padding:20px;background:#1e1f29;border-radius:10px;">
      <h2 style="text-align:center;color:#6c5ce7;">Robô EUR/USD TURBO</h2>
      <div id="comando" style="font-size:28px;text-align:center;margin:20px 0;">--</div>
      <div id="score" style="text-align:center;font-size:18px;">Confiança: --</div>
      <div style="text-align:center;margin-top:10px;">Próxima análise em <span id="timer">0:60</span></div>
      <ul id="ultimos" style="margin-top:20px;list-style:none;padding:0;"></ul>
    </div>
  `;
  iniciarTimer();
  analisarMercado();
}

if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
