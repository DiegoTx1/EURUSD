 // =============================================
        // CONFIGURAÇÕES GLOBAIS (ATUALIZADAS PARA FOREX)
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
          rsiCache: { avgGain: 0, avgLoss: 0, initialized: false },
          emaCache: {
            ema5: null,
            ema13: null,
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
          logs: [
            "Sistema iniciado",
            "Conectando à API..."
          ]
        };

        const CONFIG = {
          API_ENDPOINTS: {
            TWELVE_DATA: "https://api.twelvedata.com"
          },
          PARES: {
            FOREX: "EUR/USD"
          },
          PERIODOS: {
            RSI: 9,
            STOCH_K: 14,
            STOCH_D: 3,
            EMA_CURTA: 5,
            EMA_MEDIA: 13,
            EMA_LONGA: 200,
            MACD_RAPIDA: 6,
            MACD_LENTA: 13,
            MACD_SINAL: 9,
            VELAS_CONFIRMACAO: 3,
            ANALISE_LATERAL: 30,
            ATR: 14,
            SUPERTREND: 7,
            DIVERGENCIA_LOOKBACK: 8,
            EXTREME_LOOKBACK: 2,
            COOLDOWN: 3
          },
          LIMIARES: {
            SCORE_ALTO: 85,
            SCORE_MEDIO: 70,
            RSI_OVERBOUGHT: 70,
            RSI_OVERSOLD: 30,
            STOCH_OVERBOUGHT: 85,
            STOCH_OVERSOLD: 15,
            VARIACAO_LATERAL: 0.002,
            ATR_LIMIAR: 0.005,
            LATERALIDADE_LIMIAR: 0.005,
            VOLUME_MINIMO: 1.2,
            ATR_MINIMO_OPERACIONAL: 0.002,
            MAGNITUDE_DIVERGENCIA: 0.002
          },
          PESOS: {
            RSI: 1.7,
            MACD: 2.2,
            TENDENCIA: 2.8,
            STOCH: 1.2,
            SUPERTREND: 1.9,
            DIVERGENCIA: 2.0
          },
          DEBUG_MODE: true
        };

        // =============================================
        // GERENCIADOR DE CHAVES API
        // =============================================
        const API_KEYS = [
          "9cf795b2a4f14d43a049ca935d174ebb",
          "0105e6681b894e0185704171c53f5075"
        ];
        let currentKeyIndex = 0;
        let errorCount = 0;

        // =============================================
        // FUNÇÕES UTILITÁRIAS
        // =============================================
        function debugLog(message) {
          if (CONFIG.DEBUG_MODE) {
            const now = new Date();
            const timestamp = now.toLocaleTimeString("pt-BR", {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            
            const logEntry = `${timestamp} - ${message}`;
            state.logs.unshift(logEntry);
            if (state.logs.length > 20) state.logs.pop();
            
            // Atualizar interface de logs
            const logsElement = document.getElementById("logs");
            if (logsElement) {
              logsElement.innerHTML = state.logs.map(log => `<div class="log-item"><span class="status-online status-indicator"></span> ${log}</div>`).join("");
            }
            
            console.log(`[DEBUG] ${logEntry}`);
          }
        }

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
            
            // Atualizar rodapé
            document.getElementById("ultima-atualizacao").textContent = state.ultimaAtualizacao;
          }
        }

        // =============================================
        // SISTEMA DE TENDÊNCIA OTIMIZADO PARA FOREX
        // =============================================
        function avaliarTendencia(ema5, ema13) {
          const diff = ema5 - ema13;
          const forca = Math.min(100, Math.abs(diff * 10000));
          
          if (forca > 75) {
            return diff > 0 
              ? { tendencia: "FORTE_ALTA", forca }
              : { tendencia: "FORTE_BAIXA", forca };
          }
          
          if (forca > 40) {
            return diff > 0 
              ? { tendencia: "ALTA", forca } 
              : { tendencia: "BAIXA", forca };
          }
          
          return { tendencia: "NEUTRA", forca: 0 };
        }

        // =============================================
        // DETECÇÃO DE LATERALIDADE (AJUSTADO PARA FOREX)
        // =============================================
        function detectarLateralidade(closes, periodo = CONFIG.PERIODOS.ANALISE_LATERAL, limiar = CONFIG.LIMIARES.LATERALIDADE_LIMIAR) {
          if (closes.length < periodo) {
            debugLog("Detecção de lateralidade: Dados insuficientes");
            return false;
          }
          
          const highs = state.dadosHistoricos.map(d => d.high).slice(-periodo);
          const lows = state.dadosHistoricos.map(d => d.low).slice(-periodo);
          
          const maxHigh = Math.max(...highs);
          const minLow = Math.min(...lows);
          const amplitude = maxHigh - minLow;
          
          return amplitude / minLow < limiar;
        }

        // =============================================
        // CÁLCULO DE SUPORTE/RESISTÊNCIA PARA FOREX
        // =============================================
        function calcularZonasPreco(dados, periodo = 50) {
          if (dados.length < periodo) periodo = dados.length;
          const slice = dados.slice(-periodo);
          
          // Filtro por volume relevante
          const mediaVolume = calcularMedia.simples(slice.map(d => d.volume), periodo);
          const minVolume = mediaVolume * 1.2;
          const zonasRelevantes = slice.filter(v => v.volume > minVolume);
          
          if (zonasRelevantes.length === 0) {
            return {
              resistencia: Math.max(...slice.map(v => v.high)),
              suporte: Math.min(...slice.map(v => v.low)),
              pivot: (Math.max(...slice.map(v => v.high)) + Math.min(...slice.map(v => v.low)) + dados[dados.length-1].close) / 3
            };
          }
          
          return {
            resistencia: Math.max(...zonasRelevantes.map(v => v.high)),
            suporte: Math.min(...zonasRelevantes.map(v => v.low)),
            pivot: (Math.max(...zonasRelevantes.map(v => v.high)) + Math.min(...zonasRelevantes.map(v => v.low)) + dados[dados.length-1].close) / 3
          };
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
            superTrend,
            tendencia,
            volume
          } = indicadores;
          
          // Cálculo de suporte/resistência
          const zonas = calcularZonasPreco(state.dadosHistoricos);
          state.suporteKey = zonas.suporte;
          state.resistenciaKey = zonas.resistencia;
          
          // Breakout em Forex
          const variacao = state.resistenciaKey - state.suporteKey;
          const limiteBreakout = variacao * 0.02;
          
          // Nova lógica de confirmação
          const confirmacaoMinima = (
            (macd.histograma > 0 && stoch.k > stoch.d && !lateral) || 
            (macd.histograma < 0 && stoch.k < stoch.d && !lateral)
          );

          // Priorizar tendência forte com confirmação
          if (tendencia.forca > 70) {
            if (tendencia.tendencia.includes("ALTA") && 
                close > emaCurta && 
                rsi > 40 && rsi < 65 && 
                confirmacaoMinima) {
              debugLog("Sinal CALL por tendência forte de alta");
              return "CALL";
            }
            if (tendencia.tendencia.includes("BAIXA") && 
                close < emaCurta && 
                rsi > 35 && rsi < 60 && 
                confirmacaoMinima) {
              debugLog("Sinal PUT por tendência forte de baixa");
              return "PUT";
            }
          }

          // Breakout com confirmação de volume e RSI
          if (close > (state.resistenciaKey + limiteBreakout)) {
            const mediaVolume = calcularMedia.simples(state.dadosHistoricos.map(d => d.volume).slice(-5), 5);
            if (volume > mediaVolume * CONFIG.LIMIARES.VOLUME_MINIMO &&
                rsi < 60) {
              debugLog("Sinal CALL por breakout de resistência");
              return "CALL";
            }
          }
          
          if (close < (state.suporteKey - limiteBreakout)) {
            const mediaVolume = calcularMedia.simples(state.dadosHistoricos.map(d => d.volume).slice(-5), 5);
            if (volume > mediaVolume * CONFIG.LIMIARES.VOLUME_MINIMO &&
                rsi > 40) {
              debugLog("Sinal PUT por breakout de suporte");
              return "PUT";
            }
          }
          
          // Divergências em RSI
          if (divergencias.divergenciaRSI) {
            if (divergencias.tipoDivergencia === "ALTA" && close > state.suporteKey && !lateral) {
              debugLog("Sinal CALL por divergência de alta");
              return "CALL";
            }
            
            if (divergencias.tipoDivergencia === "BAIXA" && close < state.resistenciaKey && !lateral) {
              debugLog("Sinal PUT por divergência de baixa");
              return "PUT";
            }
          }
          
          // Condições específicas para Forex
          if (rsi < 35 && close > emaMedia && !lateral) {
            debugLog("Sinal CALL por RSI oversold e acima da EMA");
            return "CALL";
          }
          
          if (rsi > 65 && close < emaMedia && !lateral) {
            debugLog("Sinal PUT por RSI overbought e abaixo da EMA");
            return "PUT";
          }
          
          debugLog("Nenhum sinal gerado, aguardando...");
          return "ESPERAR";
        }

        // =============================================
        // CALCULADOR DE CONFIANÇA PARA FOREX
        // =============================================
        function calcularScore(sinal, indicadores, divergencias, lateral) {
          let score = 65;

          const fatores = {
            alinhamentoTendencia: sinal === "CALL" && indicadores.tendencia.tendencia.includes("ALTA") ||
                              sinal === "PUT" && indicadores.tendencia.tendencia.includes("BAIXA") ? 25 : 0,
            divergencia: divergencias.divergenciaRSI ? 20 : 0,
            posicaoMedia: sinal === "CALL" && indicadores.close > indicadores.emaMedia ? 15 : 
                          sinal === "PUT" && indicadores.close < indicadores.emaMedia ? 15 : 0,
            superTrend: sinal === "CALL" && indicadores.close > indicadores.superTrend.valor ? 10 :
                        sinal === "PUT" && indicadores.close < indicadores.superTrend.valor ? 10 : 0,
            volatilidade: (indicadores.atr / indicadores.close) > CONFIG.LIMIARES.ATR_MINIMO_OPERACIONAL ? 10 : 0,
            volume: indicadores.volume > calcularMedia.simples(state.dadosHistoricos.map(d => d.volume).slice(-10), 10) * CONFIG.LIMIARES.VOLUME_MINIMO ? 8 : 0,
            magnitude: (indicadores.atr / indicadores.close) > 0.003 ? 7 : 0,
            lateralidade: lateral ? -15 : 0
          };
          
          score += Object.values(fatores).reduce((sum, val) => sum + val, 0);
          
          return Math.min(100, Math.max(0, score));
        }

        // =============================================
        // VERIFICAR SESSÃO DE MERCADO
        // =============================================
        function verificarSessao() {
          const hora = new Date().getUTCHours();
          // Sessão Londres (8AM-5PM UTC) e Nova York (1PM-10PM UTC)
          return (hora >= 7 && hora < 17);
        }

        // =============================================
        // INDICADORES TÉCNICOS (OTIMIZADOS PARA FOREX)
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
              const diff = closes[i] - closes[i - 1];
              if (diff > 0) gains += diff;
              else losses -= diff;
            }
            
            state.rsiCache.avgGain = gains / periodo;
            state.rsiCache.avgLoss = losses / periodo;
            state.rsiCache.initialized = true;
            
            const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
            return 100 - (100 / (1 + rs));
          }
          
          const diff = closes[closes.length - 1] - closes[closes.length - 2];
          
          if (diff > 0) {
            state.rsiCache.avgGain = ((state.rsiCache.avgGain * (periodo - 1)) + diff) / periodo;
            state.rsiCache.avgLoss = (state.rsiCache.avgLoss * (periodo - 1)) / periodo;
          } else {
            state.rsiCache.avgGain = (state.rsiCache.avgGain * (periodo - 1)) / periodo;
            state.rsiCache.avgLoss = ((state.rsiCache.avgLoss * (periodo - 1)) - diff) / periodo;
          }
          
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
            if (state.macdCache.emaRapida === null || state.macdCache.emaLenta === null) {
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
                signalLine: sinalLinha
              };
              
              return {
                histograma: ultimoMACD - ultimoSinal,
                macdLinha: ultimoMACD,
                sinalLinha: ultimoSinal
              };
            }
            
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
            
            const trValues = [];
            for (let i = 1; i < dados.length; i++) {
              const tr = Math.max(
                dados[i].high - dados[i].low,
                Math.abs(dados[i].high - dados[i-1].close),
                Math.abs(dados[i].low - dados[i-1].close)
              );
              trValues.push(tr);
            }
            
            return calcularMedia.simples(trValues.slice(-periodo), periodo);
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
            const extremeLookback = CONFIG.PERIODOS.EXTREME_LOOKBACK;
            
            if (closes.length < lookback || rsis.length < lookback) {
              return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
            }
            
            const findExtremes = (data, isHigh = true) => {
              const extremes = [];
              for (let i = extremeLookback; i < data.length - extremeLookback; i++) {
                let isExtreme = true;
                
                for (let j = 1; j <= extremeLookback; j++) {
                  if (isHigh) {
                    if (data[i] <= data[i-j] || data[i] <= data[i+j]) {
                      isExtreme = false;
                      break;
                    }
                  } else {
                    if (data[i] >= data[i-j] || data[i] >= data[i+j]) {
                      isExtreme = false;
                      break;
                    }
                  }
                }
                
                if (isExtreme) {
                  extremes.push({ index: i, value: data[i] });
                }
              }
              return extremes;
            };
            
            const priceHighs = findExtremes(highs, true);
            const priceLows = findExtremes(lows, false);
            const rsiHighs = findExtremes(rsis, true);
            const rsiLows = findExtremes(rsis, false);
            
            let divergenciaRegularAlta = false;
            let divergenciaRegularBaixa = false;
            
            if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
              const lastPriceHigh = priceHighs[priceHighs.length - 1];
              const prevPriceHigh = priceHighs[priceHighs.length - 2];
              const lastRsiHigh = rsiHighs[rsiHighs.length - 1];
              const prevRsiHigh = rsiHighs[rsiHighs.length - 2];
              
              if (lastPriceHigh.value > prevPriceHigh.value && 
                  lastRsiHigh.value < prevRsiHigh.value) {
                divergenciaRegularBaixa = true;
              }
            }
            
            if (priceLows.length >= 2 && rsiLows.length >= 2) {
              const lastPriceLow = priceLows[priceLows.length - 1];
              const prevPriceLow = priceLows[priceLows.length - 2];
              const lastRsiLow = rsiLows[rsiLows.length - 1];
              const prevRsiLow = rsiLows[rsiLows.length - 2];
              
              if (lastPriceLow.value < prevPriceLow.value && 
                  lastRsiLow.value > prevRsiLow.value) {
                divergenciaRegularAlta = true;
              }
            }
            
            // Adicionar filtro de magnitude
            const magnitudeMinima = CONFIG.LIMIARES.MAGNITUDE_DIVERGENCIA;
            
            if (divergenciaRegularAlta) {
              const magnitude = Math.abs(lastPriceLow.value - prevPriceLow.value);
              if (magnitude < magnitudeMinima) divergenciaRegularAlta = false;
            }
            
            if (divergenciaRegularBaixa) {
              const magnitude = Math.abs(lastPriceHigh.value - prevPriceHigh.value);
              if (magnitude < magnitudeMinima) divergenciaRegularBaixa = false;
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
        // ATUALIZAÇÃO DA INTERFACE
        // =============================================
        function atualizarInterface(sinal, score, tendencia, forcaTendencia, indicadores) {
          if (!state.marketOpen) return;
          
          const comandoElement = document.getElementById("comando");
          const sinalValorElement = document.getElementById("sinal-valor");
          const sinalDescElement = document.getElementById("sinal-desc");
          
          if (comandoElement && sinalValorElement && sinalDescElement) {
            comandoElement.className = "signal-box " + sinal.toLowerCase();
            sinalValorElement.textContent = sinal;
            
            if (sinal === "CALL") {
              sinalDescElement.textContent = "Compra recomendada";
              sinalValorElement.innerHTML = "CALL 📈";
            } else if (sinal === "PUT") {
              sinalDescElement.textContent = "Venda recomendada";
              sinalValorElement.innerHTML = "PUT 📉";
            } else if (sinal === "ESPERAR") {
              sinalDescElement.textContent = "Aguardando oportunidade";
              sinalValorElement.innerHTML = "ESPERAR ✋";
            } else if (sinal === "FORA_SESSAO") {
              sinalDescElement.textContent = "Mercado fechado";
              sinalValorElement.innerHTML = "FORA DA SESSÃO 🌙";
            } else {
              sinalDescElement.textContent = "Erro na análise";
              sinalValorElement.innerHTML = "ERRO ⚠️";
            }
          }
          
          const scoreElement = document.getElementById("score");
          if (scoreElement) {
            scoreElement.textContent = `${score}%`;
            if (score >= CONFIG.LIMIARES.SCORE_ALTO) scoreElement.style.color = '#00ff00';
            else if (score >= CONFIG.LIMIARES.SCORE_MEDIO) scoreElement.style.color = '#ffff00';
            else scoreElement.style.color = '#ff0000';
          }
          
          const tendenciaElement = document.getElementById("tendencia");
          if (tendenciaElement) {
            tendenciaElement.textContent = tendencia;
          }
          
          // Atualizar indicadores
          atualizarIndicadores(indicadores);
        }
        
        function atualizarIndicadores(indicadores) {
          const container = document.getElementById("indicadores-container");
          if (!container) return;
          
          const indicatorsData = [
            { name: "RSI", value: indicadores.rsi.toFixed(2), trend: indicadores.rsi },
            { name: "Stochastic K", value: indicadores.stoch.k.toFixed(2), trend: indicadores.stoch.k },
            { name: "Stochastic D", value: indicadores.stoch.d.toFixed(2), trend: indicadores.stoch.d },
            { name: "MACD", value: indicadores.macd.histograma > 0 ? `+${indicadores.macd.histograma.toFixed(4)}` : indicadores.macd.histograma.toFixed(4), trend: indicadores.macd.histograma * 1000 },
            { name: "Suporte", value: state.suporteKey.toFixed(5), trend: null },
            { name: "Resistência", value: state.resistenciaKey.toFixed(5), trend: null },
            { name: "ATR", value: indicadores.atr.toFixed(5), trend: null },
            { name: "Volume", value: indicadores.volume.toFixed(2), trend: indicadores.volume }
          ];
          
          container.innerHTML = indicatorsData.map(ind => `
            <div class="indicator-card">
              <div class="indicator-name">${ind.name}</div>
              <div class="indicator-value">${ind.value}</div>
              ${ind.trend !== null ? `
                <div class="trend-indicator">
                  <div class="trend-fill" style="width: ${Math.min(100, Math.abs(ind.trend))}%; background: ${ind.trend > 0 ? '#00b894' : '#ff7675'}"></div>
                </div>
              ` : ''}
            </div>
          `).join("");
        }

        // =============================================
        // CORE DO SISTEMA (ATUALIZADO PARA FOREX)
        // =============================================
        async function analisarMercado() {
          if (state.leituraEmAndamento) return;
          state.leituraEmAndamento = true;
          
          try {
            debugLog("Iniciando análise de mercado");
            
            // Verificar sessão de mercado
            if (!verificarSessao()) {
              state.marketOpen = false;
              atualizarInterface("FORA_SESSAO", 0, "FORA DA SESSÃO", 0, {});
              return;
            }
            
            const dados = await obterDadosTwelveData();
            state.dadosHistoricos = dados;
            debugLog(`Dados obtidos: ${dados.length} registros`);
            
            if (dados.length < 20) {
              throw new Error(`Dados insuficientes (${dados.length} velas)`);
            }
            
            const velaAtual = dados[dados.length - 1];
            const closes = dados.map(v => v.close);
            const highs = dados.map(v => v.high);
            const lows = dados.map(v => v.low);

            // Calcular EMAs
            const calcularEMA = (dados, periodo) => {
              const emaArray = calcularMedia.exponencial(dados, periodo);
              return emaArray.length > 0 ? emaArray[emaArray.length - 1] : null;
            };

            const ema5 = calcularEMA(closes, CONFIG.PERIODOS.EMA_CURTA);
            const ema13 = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);

            const superTrend = calcularSuperTrend(dados);
            const rsi = calcularRSI(closes);
            const stoch = calcularStochastic(highs, lows, closes);
            const macd = calcularMACD(closes);
            const atr = calcularATR(dados);
            
            // Preencher histórico de RSI
            state.rsiHistory = [];
            for (let i = CONFIG.PERIODOS.RSI; i < closes.length; i++) {
              state.rsiHistory.push(calcularRSI(closes.slice(0, i+1)));
            }
            
            const divergencias = detectarDivergencias(closes, state.rsiHistory, highs, lows);
            const lateral = detectarLateralidade(closes);
            const tendencia = avaliarTendencia(ema5, ema13);

            state.tendenciaDetectada = tendencia.tendencia;
            state.forcaTendencia = tendencia.forca;

            const indicadores = {
              rsi,
              stoch,
              macd,
              emaCurta: ema5,
              emaMedia: ema13,
              close: velaAtual.close,
              superTrend,
              tendencia,
              atr,
              volume: velaAtual.volume
            };

            let sinal = gerarSinal(indicadores, divergencias, lateral);
            
            // Aplicar cooldown
            if (sinal !== "ESPERAR" && state.cooldown <= 0) {
              // Aplicar filtro adicional de volatilidade
              if (indicadores.atr / indicadores.close > CONFIG.LIMIARES.ATR_MINIMO_OPERACIONAL) {
                state.cooldown = CONFIG.PERIODOS.COOLDOWN;
              } else {
                sinal = "ESPERAR";
                debugLog("Volatilidade insuficiente - sinal bloqueado");
              }
            } else if (state.cooldown > 0) {
              state.cooldown--;
              sinal = "ESPERAR";
              debugLog(`Cooldown ativo (${state.cooldown} períodos restantes)`);
            }

            const score = calcularScore(sinal, indicadores, divergencias, lateral);

            state.ultimoSinal = sinal;
            state.ultimoScore = score;
            state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

            atualizarInterface(sinal, score, state.tendenciaDetectada, state.forcaTendencia, indicadores);

            state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
            if (state.ultimos.length > 8) state.ultimos.pop();

            state.tentativasErro = 0;
            debugLog("Análise concluída com sucesso");
          } catch (e) {
            console.error("Erro na análise:", e);
            debugLog(`Erro na análise: ${e.message}`);
            atualizarInterface("ERRO", 0, "ERRO", 0, {});
            
            if (++state.tentativasErro > 3) {
              debugLog("Muitos erros consecutivos - recarregando...");
              setTimeout(() => location.reload(), 10000);
            }
          } finally {
            state.leituraEmAndamento = false;
          }
        }

        // =============================================
        // FUNÇÕES DE DADOS (TWELVE DATA API)
        // =============================================
        async function obterDadosTwelveData() {
          try {
            const apiKey = API_KEYS[currentKeyIndex];
            const url = `${CONFIG.API_ENDPOINTS.TWELVE_DATA}/time_series?symbol=${CONFIG.PARES.FOREX}&interval=1min&outputsize=100&apikey=${apiKey}`;
            
            debugLog(`Solicitando dados: ${url}`);
            const response = await fetch(url);
            
            if (!response.ok) {
              throw new Error(`Falha na API: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'error') {
              throw new Error(data.message || `Erro Twelve Data: ${data.code}`);
            }
            
            const valores = data.values ? data.values.reverse() : [];
            debugLog(`Dados recebidos: ${valores.length} registros`);
            
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
            debugLog(`Erro na API: ${e.message}`);
            
            errorCount++;
            if (errorCount >= 2) {
              currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
              errorCount = 0;
              debugLog(`Alternando para chave API: ${currentKeyIndex}`);
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
        // INICIALIZAÇÃO
        // =============================================
        function iniciarAplicativo() {
          // Criar estrutura de indicadores
          const container = document.getElementById("indicadores-container");
          if (container) {
            const indicators = ["RSI", "Stochastic", "MACD", "Suporte", "Resistência", "ATR", "Volume", "Tendência"];
            container.innerHTML = indicators.map(ind => `
              <div class="indicator-card">
                <div class="indicator-name">${ind}</div>
                <div class="indicator-value">--</div>
              </div>
            `).join("");
          }
          
          // Configurar botões
          document.getElementById("refresh-btn").addEventListener("click", () => {
            debugLog("Atualização manual solicitada");
            analisarMercado();
          });
          
          document.getElementById("config-btn").addEventListener("click", () => {
            debugLog("Abrindo configurações");
            alert("Configurações serão implementadas na próxima versão");
          });
          
          // Iniciar processos
          setInterval(atualizarRelogio, 1000);
          sincronizarTimer();
          
          // Primeira análise
          setTimeout(analisarMercado, 1000);
        }

        // Iniciar quando o documento estiver pronto
        if (document.readyState === "complete") iniciarAplicativo();
        else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
  
