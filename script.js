// =============================================
// CONFIGURAÇÕES GLOBAIS (OTIMIZADAS PARA SINAIS FREQUENTES)
// =============================================
const state = {
  ultimosSinais: [],
  timer: 60,
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  contadorLaterais: 0,
  dadosHistoricos: [],
  rsiCache: { avgGain: 0, avgLoss: 0, initialized: false },
  emaCache: { ema5: null, ema13: null, ema50: null },
  macdCache: { emaRapida: null, emaLenta: null, macdLine: [], signalLine: [] },
  volumeRelativo: 0,
  obv: 0,
  vwap: 0,
  bandasBollinger: { superior: 0, inferior: 0, medio: 0 },
  iaProbabilidade: 0,
  iaNivelRisco: 0
};

const CONFIG = {
  API_ENDPOINTS: { TWELVE_DATA: "https://api.twelvedata.com" },
  PARES: { CRYPTO_IDX: "BTC/USD" },
  PERIODOS: {
    RSI: 9,
    STOCH_K: 14,
    EMA_CURTA: 5,
    EMA_MEDIA: 13,
    EMA_50: 50,
    MACD_RAPIDA: 6,
    MACD_LENTA: 13,
    ATR: 14,
    BOLLINGER: 20,
    VWAP: 20
  },
  LIMIARES: {
    RSI_OVERBOUGHT: 68,
    RSI_OVERSOLD: 32,
    VOLUME_ALERTA: 1.2,
    VARIACAO_LATERAL: 0.008
  },
  PESOS: {
    TENDENCIA: 2.5,
    VOLUME: 1.8,
    RSI: 1.5,
    MACD: 2.0
  }
};

const API_KEYS = ["0105e6681b894e0185704171c53f5075", "9cf795b2a4f14d43a049ca935d174ebb"];
let currentKeyIndex = 0;

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================
function formatarTimer(segundos) {
  return `0:${segundos.toString().padStart(2, '0')}`;
}

// =============================================
// INDICADORES TÉCNICOS (OTIMIZADOS)
// =============================================
const calcularMedia = {
  simples: (dados, periodo) => {
    if (dados.length < periodo) return null;
    const slice = dados.slice(-periodo);
    return slice.reduce((a, b) => a + b, 0) / periodo;
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

function calcularRSI(closes) {
  const periodo = CONFIG.PERIODOS.RSI;
  if (closes.length < periodo + 1) return 50;
  
  if (!state.rsiCache.initialized) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= periodo; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    state.rsiCache.avgGain = gains / periodo;
    state.rsiCache.avgLoss = losses / periodo;
    state.rsiCache.initialized = true;
  }
  
  const diff = closes[closes.length - 1] - closes[closes.length - 2];
  let currentGain = 0, currentLoss = 0;
  if (diff > 0) currentGain = diff;
  else currentLoss = -diff;
  
  state.rsiCache.avgGain = (state.rsiCache.avgGain * (periodo - 1) + currentGain) / periodo;
  state.rsiCache.avgLoss = (state.rsiCache.avgLoss * (periodo - 1) + currentLoss) / periodo;
  
  const rs = state.rsiCache.avgLoss === 0 ? 100 : state.rsiCache.avgGain / state.rsiCache.avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularMACD(closes) {
  const rapida = CONFIG.PERIODOS.MACD_RAPIDA;
  const lenta = CONFIG.PERIODOS.MACD_LENTA;
  
  try {
    if (state.macdCache.emaRapida === null) {
      state.macdCache.emaRapida = calcularMedia.exponencial(closes, rapida).pop();
      state.macdCache.emaLenta = calcularMedia.exponencial(closes, lenta).pop();
    }
    
    const kRapida = 2 / (rapida + 1);
    const kLenta = 2 / (lenta + 1);
    const novoValor = closes[closes.length - 1];
    
    state.macdCache.emaRapida = novoValor * kRapida + state.macdCache.emaRapida * (1 - kRapida);
    state.macdCache.emaLenta = novoValor * kLenta + state.macdCache.emaLenta * (1 - kLenta);
    
    const novaMacdLinha = state.macdCache.emaRapida - state.macdCache.emaLenta;
    state.macdCache.macdLine.push(novaMacdLinha);
    
    if (state.macdCache.signalLine.length === 0) {
      state.macdCache.signalLine.push(novaMacdLinha);
    } else {
      const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
      const kSinal = 2 / (9 + 1);
      const novoSignal = novaMacdLinha * kSinal + ultimoSinal * (1 - kSinal);
      state.macdCache.signalLine.push(novoSignal);
    }
    
    return {
      histograma: novaMacdLinha - state.macdCache.signalLine[state.macdCache.signalLine.length - 1],
      macdLinha: novaMacdLinha
    };
  } catch (e) {
    return { histograma: 0, macdLinha: 0 };
  }
}

function calcularVolumeRelativo(volumes) {
  const periodo = CONFIG.PERIODOS.VWAP;
  if (volumes.length < periodo) return 0;
  const mediaVolume = calcularMedia.simples(volumes.slice(-periodo), periodo);
  return volumes[volumes.length - 1] / mediaVolume;
}

function calcularVWAP(dados) {
  const periodo = CONFIG.PERIODOS.VWAP;
  if (dados.length < periodo) return 0;
  
  let tpTotal = 0, volumeTotal = 0;
  const slice = dados.slice(-periodo);
  
  slice.forEach(v => {
    const tp = (v.high + v.low + v.close) / 3;
    tpTotal += tp * v.volume;
    volumeTotal += v.volume;
  });
  
  return tpTotal / volumeTotal;
}

// =============================================
// GERADOR DE SINAIS (MAIS SENSÍVEL)
// =============================================
function gerarSinal(indicadores) {
  const { rsi, macd, ema5, ema13, close, volumeRelativo, vwap } = indicadores;

  // 1. Tendência com volume (limiares reduzidos)
  if (volumeRelativo > CONFIG.LIMIARES.VOLUME_ALERTA) {
    if (ema5 > ema13 && close > vwap && macd.histograma > 0) return "CALL";
    if (ema5 < ema13 && close < vwap && macd.histograma < 0) return "PUT";
  }

  // 2. Reversão por RSI
  if (rsi < CONFIG.LIMIARES.RSI_OVERSOLD && macd.histograma > 0) return "CALL";
  if (rsi > CONFIG.LIMIARES.RSI_OVERBOUGHT && macd.histograma < 0) return "PUT";
  
  // 3. Cruzamento rápido de EMAs
  if (ema5 > ema13 && volumeRelativo > 1.1) return "CALL";
  if (ema5 < ema13 && volumeRelativo > 1.1) return "PUT";

  return "ESPERAR";
}

// =============================================
// CORE DO SISTEMA
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    const dados = await obterDadosTwelveData();
    state.dadosHistoricos = dados;
    
    if (dados.length < 20) return;
    
    const velaAtual = dados[dados.length - 1];
    const closes = dados.map(v => v.close);
    const volumes = dados.map(v => v.volume);

    // Calcular indicadores
    const ema5 = calcularMedia.exponencial(closes, CONFIG.PERIODOS.EMA_CURTA).pop();
    const ema13 = calcularMedia.exponencial(closes, CONFIG.PERIODOS.EMA_MEDIA).pop();
    const rsi = calcularRSI(closes);
    const macd = calcularMACD(closes);
    state.volumeRelativo = calcularVolumeRelativo(volumes);
    state.vwap = calcularVWAP(dados);

    const indicadores = {
      rsi,
      macd,
      ema5,
      ema13,
      close: velaAtual.close,
      volumeRelativo: state.volumeRelativo,
      vwap: state.vwap
    };

    const sinal = gerarSinal(indicadores);
    const score = Math.min(90, 70 + (state.volumeRelativo * 10));

    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

    // Atualizar histórico
    state.ultimosSinais.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
    if (state.ultimosSinais.length > 5) state.ultimosSinais.pop();
    
    console.log("Sinal gerado:", sinal);
    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    if (++state.tentativasErro > 3) setTimeout(() => location.reload(), 10000);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// API DE DADOS
// =============================================
async function obterDadosTwelveData() {
  try {
    const apiKey = API_KEYS[currentKeyIndex];
    const url = `${CONFIG.API_ENDPOINTS.TWELVE_DATA}/time_series?symbol=BTC/USD&interval=1min&outputsize=100&apikey=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`Falha na API: ${response.status}`);
    
    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message);
    
    return data.values.reverse().map(item => ({
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume) || 1
    }));
  } catch (e) {
    console.error("Erro ao obter dados:", e);
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    throw e;
  }
}

// =============================================
// CONTROLE DE TEMPO
// =============================================
function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  const agora = new Date();
  state.timer = 60 - agora.getSeconds();
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// INICIALIZAÇÃO
// =============================================
function iniciarAplicativo() {
  sincronizarTimer();
  setTimeout(analisarMercado, 2000);
}

// Iniciar quando o documento estiver pronto
if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
