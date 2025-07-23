// =============================================
// CONFIGURAÇÕES GLOBAIS (OTIMIZADAS PARA FOREX)
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
  contadorLaterais: 0,
  marketOpen: true,
  tendenciaDetectada: "NEUTRA",
  forcaTendencia: 0,
  dadosHistoricos: [],
  resistenciaKey: 0,
  suporteKey: 0,
  rsiCache: { avgGain: 0, avgLoss: 0, lastPrice: null, initialized: false },
  emaCache: {
    ema5: null,
    ema13: null,
    ema50: null,
    ema200: null
  },
  macdCache: {
    emaRapida: null,
    emaLenta: null,
    macdLine: [],
    signalLine: []
  },
  superTrendCache: [],
  atrGlobal: 0,
  rsiHistory: [],
  cooldown: 0,
  volumeRelativo: 0,
  obv: 0,
  vwap: 0,
  bandasBollinger: {
    superior: 0,
    inferior: 0,
    medio: 0
  },
  volumeProfile: {},
  imbalance: 0,
  noticias: []
};

const CONFIG = {
  API_ENDPOINTS: {
    TWELVE_DATA: "https://api.twelvedata.com",
    NEWS: "https://newsapi.org/v2/everything"
  },
  PARES: {
    FOREX: "CHF/JPY"  // Par alterado para Franco Suíço/Iene Japonês
  },
  PERIODOS: {
    RSI: 9,
    STOCH_K: 14,
    STOCH_D: 3,
    EMA_CURTA: 5,
    EMA_MEDIA: 13,
    EMA_50: 50,
    EMA_LONGA: 200,
    MACD_RAPIDA: 6,
    MACD_LENTA: 13,
    MACD_SINAL: 9,
    VELAS_CONFIRMACAO: 3,
    ANALISE_LATERAL: 20,
    ATR: 14,
    SUPERTREND: 7,
    DIVERGENCIA_LOOKBACK: 8,
    EXTREME_LOOKBACK: 2,
    BOLLINGER: 20,
    VOLUME_LOOKBACK: 10,
    VWAP: 20,
    VOLUME_PROFILE_BINS: 20,
    IMBALANCE_PERIOD: 5
  },
  LIMIARES: {
    SCORE_ALTO: 85,
    SCORE_MEDIO: 70,
    RSI_OVERBOUGHT: 78,
    RSI_OVERSOLD: 22,
    STOCH_OVERBOUGHT: 85,
    STOCH_OVERSOLD: 15,
    VARIACAO_LATERAL: 0.004,       // Reduzido para 0.4% (FOREX)
    ATR_LIMIAR: 0.015,             // Reduzido para 1.5% (FOREX)
    LATERALIDADE_LIMIAR: 0.004,    // Reduzido para 0.4% (FOREX)
    VOLUME_ALERTA: 1.8,            // Aumentado para compensar menor volume
    IMBALANCE_THRESHOLD: 0.7
  },
  PESOS: {
    RSI: 1.7,
    MACD: 2.2,
    TENDENCIA: 2.8,
    STOCH: 1.2,
    SUPERTREND: 1.9,
    DIVERGENCIA: 2.0,
    VOLUME: 1.5,
    VWAP: 1.3,
    BOLLINGER: 1.4,
    VOLUME_PROFILE: 1.6,
    IMBALANCE: 1.8,
    NEWS_SENTIMENT: 1.2
  }
};

// =============================================
// GERENCIADOR DE CHAVES API
// =============================================
const API_KEYS = {
  TWELVE_DATA: [
    "0105e6681b894e0185704171c53f5075",
    "9cf795b2a4f14d43a049ca935d174ebb"
  ],
  NEWS: ["a5a6e7d6a5d84c2d8d0d0d0d0d0d0d0d"]
};
let currentKeyIndex = 0;
let errorCount = 0;

// =============================================
// SISTEMA DE TENDÊNCIA OTIMIZADO (COM EMA50)
// =============================================
function avaliarTendencia(ema5, ema13, ema50) {
  const diffCurta = ema5 - ema13;
  const diffLonga = ema13 - ema50;
  const forca = Math.min(100, (Math.abs(diffCurta) * 6000 + Math.abs(diffLonga) * 4000));
  
  if (forca > 80) {
    return diffCurta > 0 && diffLonga > 0 
      ? { tendencia: "FORTE_ALTA", forca }
      : diffCurta < 0 && diffLonga < 0 
        ? { tendencia: "FORTE_BAIXA", forca }
        : { tendencia: "NEUTRA", forca: 0 };
  }
  
  if (forca > 45) {
    return diffCurta > 0 
      ? { tendencia: "ALTA", forca } 
      : { tendencia: "BAIXA", forca };
  }
  
  return { tendencia: "NEUTRA", forca: 0 };
}

// =============================================
// DETECÇÃO DE LATERALIDADE (OTIMIZADA PARA FOREX)
// =============================================
function detectarLateralidade(closes, periodo = CONFIG.PERIODOS.ANALISE_LATERAL, limiar = CONFIG.LIMIARES.LATERALIDADE_LIMIAR) {
  if (closes.length < periodo) return false;
  
  let countLaterais = 0;
  for (let i = closes.length - 1; i > closes.length - periodo; i--) {
    if (i <= 0) break;
    const variacao = Math.abs((closes[i] - closes[i-1]) / closes[i-1]);
    if (variacao < limiar) countLaterais++;
  }
  
  state.contadorLaterais = countLaterais;
  return countLaterais > periodo * 0.7;
}

// =============================================
// CÁLCULO DE SUPORTE/RESISTÊNCIA COM VOLUME PROFILE
// =============================================
function calcularZonasPreco(dados, periodo = 50) {
  if (dados.length < periodo) periodo = dados.length;
  const slice = dados.slice(-periodo);
  
  // Cálculo tradicional de S/R
  const highs = slice.map(v => v.high);
  const lows = slice.map(v => v.low);
  const resistencia = Math.max(...highs);
  const suporte = Math.min(...lows);
  
  // Volume Profile
  const volumeProfile = {};
  const priceRange = resistencia - suporte;
  const binSize = priceRange / CONFIG.PERIODOS.VOLUME_PROFILE_BINS;
  
  for (let i = 0; i < slice.length; i++) {
    const v = slice[i];
    const bin = Math.floor((v.close - suporte) / binSize);
    
    if (!volumeProfile[bin]) volumeProfile[bin] = 0;
    volumeProfile[bin] += v.volume;
  }
  
  // Encontrar POC (Point of Control)
  let maxVolume = 0;
  let poc = suporte + binSize/2;
  for (const [bin, vol] of Object.entries(volumeProfile)) {
    if (vol > maxVolume) {
      maxVolume = vol;
      poc = suporte + (parseInt(bin) * binSize) + binSize/2;
    }
  }
  
  state.volumeProfile = volumeProfile;
  
  return {
    resistencia,
    suporte,
    pivot: (resistencia + suporte + dados[dados.length-1].close) / 3,
    poc
  };
}

// =============================================
// INDICADORES PARA FOREX
// =============================================

// Volume Relativo (com limite para Forex)
function calcularVolumeRelativo(volumes, periodo = CONFIG.PERIODOS.VOLUME_LOOKBACK) {
  if (volumes.length < periodo) return 0;
  
  const slice = volumes.slice(-periodo);
  const mediaVolume = calcularMedia.simples(slice, periodo);
  const ultimoVolume = volumes[volumes.length - 1];
  
  return Math.min(3.0, ultimoVolume / mediaVolume); // Limitar a 300%
}

// On-Balance Volume (OBV)
function calcularOBV(closes, volumes) {
  if (closes.length < 2 || volumes.length < closes.length) return 0;
  
  let obv = state.obv || 0;
  const startIndex = Math.max(1, closes.length - 20);
  
  for (let i = startIndex; i < closes.length; i++) {
    if (closes[i] > closes[i-1]) {
      obv += volumes[i];
    } else if (closes[i] < closes[i-1]) {
      obv -= volumes[i];
    }
  }
  
  return obv;
}

// Volume Weighted Average Price (VWAP)
function calcularVWAP(dados, periodo = CONFIG.PERIODOS.VWAP) {
  if (dados.length < periodo) return 0;
  
  let tpTotal = 0;
  let volumeTotal = 0;
  
  const slice = dados.slice(-periodo);
  slice.forEach(v => {
    const tp = (v.high + v.low + v.close) / 3;
    tpTotal += tp * v.volume;
    volumeTotal += v.volume;
  });
  
  return tpTotal / volumeTotal;
}

// Bandas de Bollinger
function calcularBandasBollinger(closes, periodo = CONFIG.PERIODOS.BOLLINGER, desvios = 2) {
  if (closes.length < periodo) return { superior: 0, inferior: 0, medio: 0 };
  
  const slice = closes.slice(-periodo);
  const media = calcularMedia.simples(slice, periodo);
  
  let somaQuadrados = 0;
  slice.forEach(valor => {
    somaQuadrados += Math.pow(valor - media, 2);
  });
  
  const desvioPadrao = Math.sqrt(somaQuadrados / periodo);
  
  return {
    superior: media + (desvioPadrao * desvios),
    inferior: media - (desvioPadrao * desvios),
    medio: media
  };
}

// Cálculo de Imbalance
function calcularImbalance(dados) {
  if (dados.length < CONFIG.PERIODOS.IMBALANCE_PERIOD) return 0;
  
  let buyVolume = 0;
  let sellVolume = 0;
  
  const slice = dados.slice(-CONFIG.PERIODOS.IMBALANCE_PERIOD);
  
  slice.forEach(v => {
    if (v.close > v.open) {
      buyVolume += v.volume;
    } else if (v.close < v.open) {
      sellVolume += v.volume;
    }
  });
  
  const totalVolume = buyVolume + sellVolume;
  if (totalVolume === 0) return 0;
  
  return (buyVolume - sellVolume) / totalVolume;
}

// =============================================
// GERADOR DE SINAIS OTIMIZADO PARA FOREX
// =============================================
function gerarSinal(indicadores, divergencias, lateral) {
  const {
    rsi,
    stoch,
    macd,
    close,
    emaCurta,
    emaMedia,
    ema50,
    superTrend,
    tendencia,
    volumeRelativo,
    vwap,
    bandasBollinger,
    imbalance
  } = indicadores;

  // 1. Breakout com volume e imbalance
  const limiteBreakout = (bandasBollinger.superior - bandasBollinger.inferior) * 0.03;
  
  if (close > (bandasBollinger.superior - limiteBreakout) && 
      volumeRelativo > 1.8 && 
      imbalance > CONFIG.LIMIARES.IMBALANCE_THRESHOLD) {
    return "CALL";
  }
  
  if (close < (bandasBollinger.inferior + limiteBreakout) && 
      volumeRelativo > 1.8 && 
      imbalance < -CONFIG.LIMIARES.IMBALANCE_THRESHOLD) {
    return "PUT";
  }

  // 2. Tendência forte com confirmação de volume
  if (tendencia.forca > 80) {
    if (tendencia.tendencia === "FORTE_ALTA" && 
        close > vwap && 
        close > bandasBollinger.medio &&
        imbalance > 0.5) {
      return "CALL";
    }
    if (tendencia.tendencia === "FORTE_BAIXA" && 
        close < vwap && 
        close < bandasBollinger.medio &&
        imbalance < -0.5) {
      return "PUT";
    }
  }

  // 3. Divergências com confirmação de perfil de volume
  if (divergencias.divergenciaRSI) {
    const poc = state.poc;
    
    if (divergencias.tipoDivergencia === "ALTA" && 
        state.obv > 0 && 
        close > poc) {
      return "CALL";
    }
    
    if (divergencias.tipoDivergencia === "BAIXA" && 
        state.obv < 0 && 
        close < poc) {
      return "PUT";
    }
  }

  // 4. Reversão com múltiplos indicadores
  if (rsi < CONFIG.LIMIARES.RSI_OVERSOLD && 
      stoch.k < CONFIG.LIMIARES.STOCH_OVERSOLD && 
      close > vwap && 
      macd.histograma > 0 &&
      imbalance > 0.6) {
    return "CALL";
  }
  
  if (rsi > CONFIG.LIMIARES.RSI_OVERBOUGHT && 
      stoch.k > CONFIG.LIMIARES.STOCH_OVERBOUGHT && 
      close < vwap && 
      macd.histograma < 0 &&
      imbalance < -0.6) {
    return "PUT";
  }
  
  return "ESPERAR";
}

// =============================================
// CALCULADOR DE CONFIANÇA OTIMIZADO
// =============================================
function calcularScore(sinal, indicadores, divergencias) {
  let score = 65;

  const fatores = {
    alinhamentoTendencia: sinal === "CALL" && indicadores.tendencia.tendencia.includes("ALTA") ||
                          sinal === "PUT" && indicadores.tendencia.tendencia.includes("BAIXA") ? 25 : 0,
    divergencia: divergencias.divergenciaRSI ? 20 : 0,
    volume: indicadores.volumeRelativo > CONFIG.LIMIARES.VOLUME_ALERTA ? 15 : 0,
    vwap: sinal === "CALL" && indicadores.close > indicadores.vwap ? 10 : 
           sinal === "PUT" && indicadores.close < indicadores.vwap ? 10 : 0,
    bollinger: sinal === "CALL" && indicadores.close > indicadores.bandasBollinger.medio ? 8 :
               sinal === "PUT" && indicadores.close < indicadores.bandasBollinger.medio ? 8 : 0,
    obv: (sinal === "CALL" && state.obv > 0) || (sinal === "PUT" && state.obv < 0) ? 7 : 0,
    volumeProfile: (sinal === "CALL" && indicadores.close > state.poc) || 
                  (sinal === "PUT" && indicadores.close < state.poc) ? 8 : 0,
    imbalance: Math.abs(indicadores.imbalance) > CONFIG.LIMIARES.IMBALANCE_THRESHOLD ? 10 : 0,
    news: state.noticias.length > 0 ? 5 : 0
  };
  
  score += Object.values(fatores).reduce((sum, val) => sum + val, 0);
  
  // Penalizar lateralidade prolongada
  if (state.contadorLaterais > 5) score = Math.max(0, score - 15);
  
  return Math.min(100, Math.max(0, score));
}

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================
function formatarTimer(segundos) {
  return `0:${segundos.toString().padStart(2, '0')}`;
}

function atualizarRelogio() {
  const elementoHora = document.getElementById("hora");
  if (elementoHora) {
    const now = new Date();
    state.ultimaAtualizacao = now.toLocaleTimeString("pt-BR", {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    elementoHora.textContent = state.ultimaAtualizacao;
    state.marketOpen = true;
  }
}

function atualizarInterface(sinal, score, tendencia, forcaTendencia) {
  if (!state.marketOpen) return;
  
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.textContent += " 📈";
    else if (sinal === "PUT") comandoElement.textContent += " 📉";
    else if (sinal === "ESPERAR") comandoElement.textContent += " ✋";
  }
  
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
    if (score >= CONFIG.LIMIARES.SCORE_ALTO) scoreElement.style.color = '#00ff00';
    else if (score >= CONFIG.LIMIARES.SCORE_MEDIO) scoreElement.style.color = '#ffff00';
    else scoreElement.style.color = '#ff0000';
  }
  
  const tendenciaElement = document.getElementById("tendencia");
  const forcaElement = document.getElementById("forca-tendencia");
  if (tendenciaElement && forcaElement) {
    tendenciaElement.textContent = tendencia;
    forcaElement.textContent = `${forcaTendencia}%`;
  }
  
  atualizarVolumeProfile();
}

// =============================================
// VISUALIZAÇÃO DE VOLUME PROFILE
// =============================================
function atualizarVolumeProfile() {
  const container = document.getElementById("volume-profile");
  if (!container || !state.dadosHistoricos.length) return;
  
  const zonas = calcularZonasPreco(state.dadosHistoricos);
  const maxVolume = Math.max(...Object.values(state.volumeProfile));
  
  container.innerHTML = '';
  
  // Criar gráfico de barras
  Object.entries(state.volumeProfile).forEach(([bin, volume]) => {
    const barHeight = Math.max(5, (volume / maxVolume) * 100);
    const bar = document.createElement('div');
    bar.className = 'volume-bar';
    bar.style.height = `${barHeight}%`;
    bar.style.width = '100%';
    bar.style.backgroundColor = volume === maxVolume ? '#6c5ce7' : '#00cec9';
    bar.style.position = 'absolute';
    bar.style.bottom = '0';
    bar.style.left = `${bin * 5}%`;
    bar.style.width = '5%';
    bar.style.transition = 'height 0.5s ease';
    
    container.appendChild(bar);
  });
  
  // Linha do preço atual
  const currentPriceLine = document.createElement('div');
  currentPriceLine.className = 'current-price';
  const currentPrice = state.dadosHistoricos[state.dadosHistoricos.length-1].close;
  const pricePosition = ((currentPrice - zonas.suporte) / (zonas.resistencia - zonas.suporte)) * 100;
  currentPriceLine.style.position = 'absolute';
  currentPriceLine.style.left = '0';
  currentPriceLine.style.top = `${100 - pricePosition}%`;
  currentPriceLine.style.width = '100%';
  currentPriceLine.style.height = '2px';
  currentPriceLine.style.backgroundColor = '#ff7675';
  currentPriceLine.style.zIndex = '10';
  container.appendChild(currentPriceLine);
}

// =============================================
// INDICADORES TÉCNICOS
// =============================================
const calcularMedia = {
  simples: (dados, periodo) => {
    if (!Array.isArray(dados) || dados.length < periodo) return null;
    const slice = dados.slice(-periodo);
    return slice.reduce((a, b) => a + b, 0) / periodo;
  },

  exponencial: (dados, periodo) => {
    if (!Array.isArray(dados) || dados.length < periodo) return [];
    
    const k = 2 / (periodo + 1);
    let ema = state.emaCache[`ema${periodo}`] || 
              calcularMedia.simples(dados.slice(0, periodo), periodo);
    
    const emaArray = [ema];
    
    for (let i = periodo; i < dados.length; i++) {
      ema = dados[i] * k + ema * (1 - k);
      emaArray.push(ema);
    }
    
    // Atualizar cache
    state.emaCache[`ema${periodo}`] = ema;
    
    return emaArray;
  }
};

function calcularRSI(closes, periodo = CONFIG.PERIODOS.RSI) {
  if (closes.length < periodo + 1) return 50;
  
  // Se já temos cache e é o mesmo preço, retornar valor anterior
  if (state.rsiCache.initialized && state.rsiCache.lastPrice === closes[closes.length-1]) {
    const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
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
  } else {
    const diff = closes[closes.length - 1] - closes[closes.length - 2];
    
    if (diff > 0) {
      state.rsiCache.avgGain = ((state.rsiCache.avgGain * (periodo - 1)) + diff) / periodo;
      state.rsiCache.avgLoss = (state.rsiCache.avgLoss * (periodo - 1)) / periodo;
    } else {
      state.rsiCache.avgGain = (state.rsiCache.avgGain * (periodo - 1)) / periodo;
      state.rsiCache.avgLoss = ((state.rsiCache.avgLoss * (periodo - 1)) - diff) / periodo;
    }
  }
  
  state.rsiCache.lastPrice = closes[closes.length-1];
  const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularStochastic(highs, lows, closes, 
                          periodoK = CONFIG.PERIODOS.STOCH_K, 
                          periodoD = CONFIG.PERIODOS.STOCH_D) {
  try {
    if (closes.length < periodoK) return { k: 50, d: 50 };
    
    const kValues = [];
    for (let i = periodoK - 1; i < closes.length; i++) {
      const startIndex = Math.max(0, i - periodoK + 1);
      const sliceHigh = highs.slice(startIndex, i + 1);
      const sliceLow = lows.slice(startIndex, i + 1);
      
      if (sliceHigh.length === 0 || sliceLow.length === 0) {
        kValues.push(50);
        continue;
      }
      
      const highestHigh = Math.max(...sliceHigh);
      const lowestLow = Math.min(...sliceLow);
      const range = highestHigh - lowestLow;
      const k = range !== 0 ? ((closes[i] - lowestLow) / range) * 100 : 50;
      kValues.push(k);
    }
    
    const kSuavizado = [];
    for (let i = periodoD - 1; i < kValues.length; i++) {
      const startIndex = Math.max(0, i - periodoD + 1);
      const slice = kValues.slice(startIndex, i + 1);
      const mediaK = calcularMedia.simples(slice, periodoD) || 50;
      kSuavizado.push(mediaK);
    }
    
    const dValues = [];
    for (let i = periodoD - 1; i < kSuavizado.length; i++) {
      const startIndex = Math.max(0, i - periodoD + 1);
      const slice = kSuavizado.slice(startIndex, i + 1);
      dValues.push(calcularMedia.simples(slice, periodoD) || 50);
    }
    
    return {
      k: kSuavizado[kSuavizado.length - 1] || 50,
      d: dValues[dValues.length - 1] || 50
    };
  } catch (e) {
    console.error("Erro no cálculo Stochastic:", e);
    return { k: 50, d: 50 };
  }
}

function calcularMACD(closes, rapida = CONFIG.PERIODOS.MACD_RAPIDA, 
                    lenta = CONFIG.PERIODOS.MACD_LENTA, 
                    sinal = CONFIG.PERIODOS.MACD_SINAL) {
  try {
    // Recalcular apenas se necessário
    if (state.macdCache.emaRapida === null || 
        state.macdCache.emaLenta === null ||
        state.macdCache.lastPrice !== closes[closes.length-1]) {
      
      const emaRapida = calcularMedia.exponencial(closes, rapida);
      const emaLenta = calcularMedia.exponencial(closes, lenta);
      
      const startIdx = Math.max(0, lenta - rapida);
      const macdLinha = emaRapida.slice(startIdx).map((val, idx) => val - emaLenta[idx]);
      const sinalLinha = calcularMedia.exponencial(macdLinha, sinal);
      
      const ultimoMACD = macdLinha[macdLinha.length - 1] || 0;
      const ultimoSinal = sinalLinha[sinalLinha.length - 1] || 0;
      
      state.macdCache = {
        emaRapida: emaRapida[emaRapida.length - 1],
        emaLenta: emaLenta[emaLenta.length - 1],
        macdLine: macdLinha,
        signalLine: sinalLinha,
        lastPrice: closes[closes.length-1]
      };
      
      return {
        histograma: ultimoMACD - ultimoSinal,
        macdLinha: ultimoMACD,
        sinalLinha: ultimoSinal
      };
    }
    
    // Atualização incremental
    const kRapida = 2 / (rapida + 1);
    const kLenta = 2 / (lenta + 1);
    const kSinal = 2 / (sinal + 1);
    
    const novoValor = closes[closes.length - 1];
    
    state.macdCache.emaRapida = novoValor * kRapida + state.macdCache.emaRapida * (1 - kRapida);
    state.macdCache.emaLenta = novoValor * kLenta + state.macdCache.emaLenta * (1 - kLenta);
    
    const novaMacdLinha = state.macdCache.emaRapida - state.macdCache.emaLenta;
    state.macdCache.macdLine.push(novaMacdLinha);
    
    if (state.macdCache.signalLine.length === 0) {
      state.macdCache.signalLine.push(novaMacdLinha);
    } else {
      const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
      const novoSignal = novaMacdLinha * kSinal + ultimoSinal * (1 - kSinal);
      state.macdCache.signalLine.push(novoSignal);
    }
    
    const ultimoMACD = novaMacdLinha;
    const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
    
    return {
      histograma: ultimoMACD - ultimoSinal,
      macdLinha: ultimoMACD,
      sinalLinha: ultimoSinal
    };
  } catch (e) {
    console.error("Erro no cálculo MACD:", e);
    return { histograma: 0, macdLinha: 0, sinalLinha: 0 };
  }
}

function calcularATR(dados, periodo = CONFIG.PERIODOS.ATR) {
  try {
    if (!Array.isArray(dados) || dados.length < periodo + 1) return 0;
    
    // Reutilizar cálculo anterior se possível
    if (state.atrGlobal && dados[dados.length-1].time === state.lastATRTime) {
      return state.atrGlobal;
    }
    
    const trValues = [];
    for (let i = 1; i < dados.length; i++) {
      const tr = Math.max(
        dados[i].high - dados[i].low,
        Math.abs(dados[i].high - dados[i-1].close),
        Math.abs(dados[i].low - dados[i-1].close)
      );
      trValues.push(tr);
    }
    
    state.atrGlobal = calcularMedia.simples(trValues.slice(-periodo), periodo);
    state.lastATRTime = dados[dados.length-1].time;
    return state.atrGlobal;
  } catch (e) {
    console.error("Erro no cálculo ATR:", e);
    return 0;
  }
}

function calcularSuperTrend(dados, periodo = CONFIG.PERIODOS.SUPERTREND, multiplicador = 3) {
  try {
    if (dados.length < periodo) return { direcao: 0, valor: 0 };
    
    if (state.atrGlobal === 0) {
      state.atrGlobal = calcularATR(dados, periodo);
    }
    
    const current = dados[dados.length - 1];
    const hl2 = (current.high + current.low) / 2;
    const atr = state.atrGlobal;
    
    const upperBand = hl2 + (multiplicador * atr);
    const lowerBand = hl2 - (multiplicador * atr);
    
    let superTrend;
    let direcao;
    
    if (state.superTrendCache.length === 0) {
      superTrend = upperBand;
      direcao = 1;
    } else {
      const prev = dados[dados.length - 2];
      const prevSuperTrend = state.superTrendCache[state.superTrendCache.length - 1];
      
      if (prev.close > prevSuperTrend.valor) {
        direcao = 1;
        superTrend = Math.max(lowerBand, prevSuperTrend.valor);
      } else {
        direcao = -1;
        superTrend = Math.min(upperBand, prevSuperTrend.valor);
      }
    }
    
    state.superTrendCache.push({ direcao, valor: superTrend });
    return { direcao, valor: superTrend };
    
  } catch (e) {
    console.error("Erro no cálculo SuperTrend:", e);
    return { direcao: 0, valor: 0 };
  }
}

function detectarDivergencias(closes, rsis, highs, lows) {
  try {
    const lookback = CONFIG.PERIODOS.DIVERGENCIA_LOOKBACK;
    
    if (closes.length < lookback || rsis.length < lookback) {
      return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
    }
    
    // Encontrar máximos e mínimos
    const findPeaks = (data, isHigh = true) => {
      const peaks = [];
      for (let i = 2; i < data.length - 2; i++) {
        if (isHigh) {
          if (data[i] > data[i-1] && data[i] > data[i-2] && 
              data[i] > data[i+1] && data[i] > data[i+2]) {
            peaks.push({ index: i, value: data[i] });
          }
        } else {
          if (data[i] < data[i-1] && data[i] < data[i-2] && 
              data[i] < data[i+1] && data[i] < data[i+2]) {
            peaks.push({ index: i, value: data[i] });
          }
        }
      }
      return peaks;
    };
    
    const priceHighs = findPeaks(highs, true);
    const priceLows = findPeaks(lows, false);
    const rsiHighs = findPeaks(rsis, true);
    const rsiLows = findPeaks(rsis, false);
    
    let divergenciaRegularAlta = false;
    let divergenciaRegularBaixa = false;
    
    // Verificar divergências de alta
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = priceLows[priceLows.length - 1];
      const prevPriceLow = priceLows[priceLows.length - 2];
      const lastRsiLow = rsiLows[rsiLows.length - 1];
      const prevRsiLow = rsiLows[rsiLows.length - 2];
      
      if (lastPriceLow.value < prevPriceLow.value && 
          lastRsiLow.value > prevRsiLow.value &&
          Math.abs(lastPriceLow.index - prevPriceLow.index) < lookback) {
        divergenciaRegularAlta = true;
      }
    }
    
    // Verificar divergências de baixa
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = priceHighs[priceHighs.length - 1];
      const prevPriceHigh = priceHighs[priceHighs.length - 2];
      const lastRsiHigh = rsiHighs[rsiHighs.length - 1];
      const prevRsiHigh = rsiHighs[rsiHighs.length - 2];
      
      if (lastPriceHigh.value > prevPriceHigh.value && 
          lastRsiHigh.value < prevRsiHigh.value &&
          Math.abs(lastPriceHigh.index - prevPriceHigh.index) < lookback) {
        divergenciaRegularBaixa = true;
      }
    }
    
    return {
      divergenciaRSI: divergenciaRegularAlta || divergenciaRegularBaixa,
      tipoDivergencia: divergenciaRegularAlta ? "ALTA" : 
                      divergenciaRegularBaixa ? "BAIXA" : "NENHUMA"
    };
  } catch (e) {
    console.error("Erro na detecção de divergências:", e);
    return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
  }
}

// =============================================
// BUSCAR NOTÍCIAS PARA CHF/JPY
// =============================================
async function buscarNoticias() {
  try {
    const apiKey = API_KEYS.NEWS[0];
    const url = `${CONFIG.API_ENDPOINTS.NEWS}?q="Swiss Franc"+"Japanese Yen"+OR+CHFJPY+OR+Forex&language=en&sortBy=publishedAt&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.articles && data.articles.length > 0) {
      state.noticias = data.articles.slice(0, 3).map(article => ({
        title: article.title,
        description: article.description,
        sentiment: analisarSentimento(article.title + ' ' + article.description)
      }));
    }
  } catch (e) {
    console.error("Erro ao buscar notícias:", e);
  }
}

function analisarSentimento(texto) {
  const positivo = ['alta', 'compra', 'forte', 'crescimento', 'positive', 'up', 'bullish', 'strong', 'hawkish'];
  const negativo = ['queda', 'venda', 'fraco', 'perda', 'negative', 'down', 'bearish', 'weak', 'dovish'];
  
  const palavras = texto.toLowerCase().split(' ');
  let score = 0;
  
  palavras.forEach(palavra => {
    if (positivo.includes(palavra)) score++;
    if (negativo.includes(palavra)) score--;
  });
  
  return score > 0 ? 'POSITIVO' : score < 0 ? 'NEGATIVO' : 'NEUTRO';
}

// =============================================
// CORE DO SISTEMA (COM NOVOS INDICADORES)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    const dados = await obterDadosTwelveData();
    state.dadosHistoricos = dados;
    
    if (dados.length < 20) {
      throw new Error(`Dados insuficientes (${dados.length} velas)`);
    }
    
    const velaAtual = dados[dados.length - 1];
    const closes = dados.map(v => v.close);
    const highs = dados.map(v => v.high);
    const lows = dados.map(v => v.low);
    const volumes = dados.map(v => v.volume);

    // Calcular EMAs
    const calcularEMA = (dados, periodo) => {
      const emaArray = calcularMedia.exponencial(dados, periodo);
      return emaArray[emaArray.length - 1];
    };

    const ema5 = calcularEMA(closes, CONFIG.PERIODOS.EMA_CURTA);
    const ema13 = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);
    const ema50 = calcularEMA(closes, CONFIG.PERIODOS.EMA_50);

    // Calcular novos indicadores
    state.volumeRelativo = calcularVolumeRelativo(volumes);
    state.obv = calcularOBV(closes, volumes);
    state.vwap = calcularVWAP(dados);
    state.bandasBollinger = calcularBandasBollinger(closes);
    state.imbalance = calcularImbalance(dados);

    const zonas = calcularZonasPreco(dados);
    state.resistenciaKey = zonas.resistencia;
    state.suporteKey = zonas.suporte;
    state.poc = zonas.poc;

    const superTrend = calcularSuperTrend(dados);
    const rsi = calcularRSI(closes);
    const stoch = calcularStochastic(highs, lows, closes);
    const macd = calcularMACD(closes);
    const atr = calcularATR(dados);
    
    // Preencher histórico de RSI
    if (state.rsiHistory.length === 0) {
      for (let i = CONFIG.PERIODOS.RSI; i < closes.length; i++) {
        state.rsiHistory.push(calcularRSI(closes.slice(0, i+1)));
      }
    } else {
      state.rsiHistory.push(calcularRSI(closes));
      if (state.rsiHistory.length > 50) state.rsiHistory.shift();
    }
    
    const divergencias = detectarDivergencias(closes, state.rsiHistory, highs, lows);
    const tendencia = avaliarTendencia(ema5, ema13, ema50);
    const lateral = detectarLateralidade(closes);

    state.tendenciaDetectada = tendencia.tendencia;
    state.forcaTendencia = tendencia.forca;

    const indicadores = {
      rsi,
      stoch,
      macd,
      emaCurta: ema5,
      emaMedia: ema13,
      ema50,
      close: velaAtual.close,
      superTrend,
      tendencia,
      atr,
      volumeRelativo: state.volumeRelativo,
      vwap: state.vwap,
      bandasBollinger: state.bandasBollinger,
      imbalance: state.imbalance
    };

    let sinal = gerarSinal(indicadores, divergencias, lateral);
    
    // Aplicar cooldown
    if (sinal !== "ESPERAR" && state.cooldown <= 0) {
      state.cooldown = 3;
    } else if (state.cooldown > 0) {
      state.cooldown--;
      sinal = "ESPERAR";
    }

    const score = calcularScore(sinal, indicadores, divergencias);

    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

    atualizarInterface(sinal, score, state.tendenciaDetectada, state.forcaTendencia);

    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `
        <li>📊 Tendência: ${state.tendenciaDetectada} (${state.forcaTendencia}%)</li>
        <li>💰 Preço: ${indicadores.close.toFixed(3)}</li>
        <li>📉 RSI: ${rsi.toFixed(2)} ${rsi < CONFIG.LIMIARES.RSI_OVERSOLD ? '🔻' : rsi > CONFIG.LIMIARES.RSI_OVERBOUGHT ? '🔺' : ''}</li>
        <li>📊 MACD: ${macd.histograma > 0 ? '+' : ''}${macd.histograma.toFixed(4)} ${macd.histograma > 0 ? '🟢' : '🔴'}</li>
        <li>📈 Stochastic: ${stoch.k.toFixed(2)}/${stoch.d.toFixed(2)}</li>
        <li>📌 Médias: EMA5 ${ema5.toFixed(3)} | EMA13 ${ema13.toFixed(3)} | EMA50 ${ema50.toFixed(3)}</li>
        <li>📊 Suporte: ${state.suporteKey.toFixed(3)} | Resistência: ${state.resistenciaKey.toFixed(3)}</li>
        <li>📊 POC: ${state.poc.toFixed(3)}</li>
        <li>⚠️ Divergência: ${divergencias.tipoDivergencia}</li>
        <li>🚦 SuperTrend: ${superTrend.direcao > 0 ? 'ALTA' : 'BAIXA'} (${superTrend.valor.toFixed(3)})</li>
        <li>⚡ Volatilidade (ATR): ${atr.toFixed(4)}</li>
        <li>🔄 Lateral: ${lateral ? 'SIM' : 'NÃO'}</li>
        <li>💹 Volume: ${(state.volumeRelativo * 100).toFixed(0)}% ${state.volumeRelativo > CONFIG.LIMIARES.VOLUME_ALERTA ? '🚀' : ''}</li>
        <li>📊 VWAP: ${state.vwap.toFixed(3)}</li>
        <li>📊 Bollinger: ${state.bandasBollinger.superior.toFixed(3)} | ${state.bandasBollinger.inferior.toFixed(3)}</li>
        <li>📦 OBV: ${state.obv > 0 ? '↑' : '↓'} ${Math.abs(state.obv).toFixed(0)}</li>
        <li>⚖️ Imbalance: ${(state.imbalance * 100).toFixed(1)}%</li>
      `;
    }

    state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
    if (state.ultimos.length > 8) state.ultimos.pop();
    const ultimosElement = document.getElementById("ultimos");
    if (ultimosElement) ultimosElement.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");

    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, "ERRO", 0);
    
    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `<li>ERRO: ${e.message}</li>`;
    }
    
    if (++state.tentativasErro > 3) setTimeout(() => location.reload(), 10000);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// FUNÇÕES DE DADOS (TWELVE DATA API - CHF/JPY)
// =============================================
async function obterDadosTwelveData() {
  try {
    const apiKey = API_KEYS.TWELVE_DATA[currentKeyIndex];
    const url = `${CONFIG.API_ENDPOINTS.TWELVE_DATA}/time_series?symbol=${CONFIG.PARES.FOREX}&interval=1min&outputsize=100&apikey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Falha na API: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'error') {
      throw new Error(data.message || `Erro Twelve Data: ${data.code}`);
    }
    
    const valores = data.values ? data.values.reverse() : [];
    
    return valores.map(item => ({
      time: item.datetime,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume) || 1
    }));
  } catch (e) {
    console.error("Erro ao obter dados:", e);
    
    errorCount++;
    if (errorCount >= 2) {
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.TWELVE_DATA.length;
      errorCount = 0;
      console.log(`Alternando para chave API: ${currentKeyIndex}`);
    }
    
    throw e;
  }
}

// =============================================
// CONTROLE DE TEMPO
// =============================================
function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  const agora = new Date();
  const segundos = agora.getSeconds();
  state.timer = 60 - segundos;
  
  const elementoTimer = document.getElementById("timer");
  if (elementoTimer) {
    elementoTimer.textContent = formatarTimer(state.timer);
    elementoTimer.style.color = state.timer <= 5 ? 'red' : '';
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (elementoTimer) {
      elementoTimer.textContent = formatarTimer(state.timer);
      elementoTimer.style.color = state.timer <= 5 ? 'red' : '';
    }
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// INICIALIZAÇÃO (PARA CHF/JPY)
// =============================================
function iniciarAplicativo() {
  // Criar interface
  const container = document.createElement('div');
  container.style = "font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 20px auto; padding: 25px; background: #1e1f29; border-radius: 15px; color: #f5f6fa; box-shadow: 0 8px 32px rgba(0,0,0,0.3);";
  container.innerHTML = `
    <h1 style="text-align: center; color: #6c5ce7; margin-bottom: 30px; font-size: 28px;">
      <i class="fas fa-chart-line"></i> Robô de Trading FOREX PRO (CHF/JPY)
    </h1>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 30px;">
      <div id="comando" style="font-size: 32px; font-weight: 700; padding: 25px; border-radius: 12px; text-align: center; background: #2c2d3a; display: flex; align-items: center; justify-content: center; min-height: 120px;">
        --
      </div>
      
      <div style="display: flex; flex-direction: column; justify-content: center; background: #2c2d3a; padding: 20px; border-radius: 12px;">
        <div id="score" style="font-size: 22px; font-weight: 600; margin-bottom: 15px; text-align: center;">--</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div style="text-align: center;">
            <div style="font-size: 14px; opacity: 0.8;">Atualização</div>
            <div id="hora" style="font-size: 18px; font-weight: 600;">--:--:--</div>
          </div>
          
          <div style="text-align: center;">
            <div style="font-size: 14px; opacity: 0.8;">Próxima Análise</div>
            <div id="timer" style="font-size: 18px; font-weight: 600;">0:60</div>
          </div>
        </div>
      </div>
    </div>
    
    <div style="background: #2c2d3a; padding: 20px; border-radius: 12px; margin-bottom: 25px;">
      <h3 style="margin-top: 0; margin-bottom: 15px; color: #6c5ce7; display: flex; align-items: center;">
        <i class="fas fa-chart-line"></i> Tendência: 
        <span id="tendencia" style="margin-left: 8px;">--</span> 
        <span id="forca-tendencia" style="margin-left: 5px;">--</span>%
      </h3>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: #3a3b4a; padding: 15px; border-radius: 8px;">
          <h4 style="margin-top: 0; margin-bottom: 10px; color: #a29bfe;">Últimos Sinais</h4>
          <ul id="ultimos" style="list-style: none; padding: 0; margin: 0;"></ul>
        </div>
        
        <div style="background: #3a3b4a; padding: 15px; border-radius: 8px;">
          <h4 style="margin-top: 0; margin-bottom: 10px; color: #a29bfe;">Indicadores</h4>
          <ul id="criterios" style="list-style: none; padding: 0; margin: 0;"></ul>
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <h4 style="margin-top: 0; margin-bottom: 10px; color: #a29bfe;">Volume Profile</h4>
        <div id="volume-profile" style="height: 150px; background: #252632; border-radius: 8px; position: relative;"></div>
      </div>
    </div>
    
    <div style="text-align: center; font-size: 14px; opacity: 0.7; padding-top: 15px; border-top: 1px solid #3a3b4a;">
      FOREX PRO - Análise em tempo real (CHF/JPY) | Atualizado: <span id="ultima-atualizacao">${new Date().toLocaleTimeString()}</span>
    </div>
  `;
  document.body.appendChild(container);
  document.body.style.backgroundColor = "#13141a";
  document.body.style.margin = "0";
  document.body.style.padding = "20px";
  
  // Adicionar Font Awesome
  const fontAwesome = document.createElement('link');
  fontAwesome.rel = 'stylesheet';
  fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
  document.head.appendChild(fontAwesome);

  // Adicionar estilos dinâmicos
  const style = document.createElement('style');
  style.textContent = `
    .call { 
      background: linear-gradient(135deg, #00b894, #00cec9) !important; 
      color: white !important;
      box-shadow: 0 4px 20px rgba(0, 184, 148, 0.3);
      animation: pulseCall 2s infinite;
    }
    .put { 
      background: linear-gradient(135deg, #ff7675, #d63031) !important; 
      color: white !important;
      box-shadow: 0 4px 20px rgba(255, 118, 117, 0.3);
      animation: pulsePut 2s infinite;
    }
    .esperar { 
      background: linear-gradient(135deg, #0984e3, #6c5ce7) !important; 
      color: white !important;
      box-shadow: 0 4px 20px rgba(108, 92, 231, 0.3);
    }
    .erro { 
      background: #fdcb6e !important; 
      color: #2d3436 !important;
    }
    body {
      transition: background 0.5s ease;
    }
    #comando {
      transition: all 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
    }
    @keyframes pulseCall {
      0% { box-shadow: 0 0 0 0 rgba(0, 184, 148, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(0, 184, 148, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 184, 148, 0); }
    }
    @keyframes pulsePut {
      0% { box-shadow: 0 0 0 0 rgba(255, 118, 117, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(255, 118, 117, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 118, 117, 0); }
    }
    .volume-bar {
      transition: height 0.5s ease;
    }
  `;
  document.head.appendChild(style);

  // Iniciar processos
  setInterval(atualizarRelogio, 1000);
  sincronizarTimer();
  buscarNoticias();
  setInterval(buscarNoticias, 300000); // Atualizar notícias a cada 5 minutos
  
  // Primeira análise
  setTimeout(analisarMercado, 1000);
}

// Iniciar quando o documento estiver pronto
if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
