const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// En AWS Lambda solo se tiene permisos de escritura en /tmp
const isLambda = !!process.env.AWS_REGION || !!process.env.AWS_EXECUTION_ENV;
const CACHE_FILE = isLambda ? '/tmp/ibr_cache.json' : path.join(__dirname, 'ibr_cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora en milisegundos

// Check if we want purely JSON output (e.g. for API usage o si es Lambda)
const isJsonOutput = process.argv.includes('--json') || isLambda;

function log(message) {
  if (!isJsonOutput) {
    console.log(message);
  }
}

function warn(message, error) {
  if (!isJsonOutput) {
    console.warn(message, error);
  }
}

function isBusinessDayAndTime() {
  const now = new Date();

  // Ajustar a zona horaria de Colombia (UTC-5)
  const options = { timeZone: 'America/Bogota', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const strBogota = now.toLocaleString('en-US', options);

  // Extraer mes, día, año, hora y minuto
  const matches = strBogota.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/);
  if (!matches) return true; // Fallback por seguridad

  const [_, month, day, year, hrStr, minStr] = matches;
  const hour = parseInt(hrStr, 10);
  const min = parseInt(minStr, 10);

  // Crear una fecha local basada en la hora de Bogotá para obtener el día de la semana
  const dateBogota = new Date(year, month - 1, day);
  const dayOfWeek = dateBogota.getDay();

  // Verificar si es fin de semana (0 = Domingo, 6 = Sábado)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Verificar si es después de las 11:45 AM
  if (hour < 11 || (hour === 11 && min < 45)) {
    return false;
  }

  return true;
}

function getCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const stat = fs.statSync(CACHE_FILE);
      const now = Date.now();
      if (now - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      warn('⚠️ Error al leer el caché:', e.message);
    }
  }
  return null;
}

function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    warn('⚠️ Error al guardar el caché:', e.message);
  }
}

async function obtenerIBR() {
  if (!isBusinessDayAndTime()) {
    log('⏳ No es un día hábil después de las 11:45 a.m. (Hora de Colombia). Se usará el caché si existe o se detendrá.');
    const cachedData = getCache();
    if (cachedData) {
      log('📦 Retornando datos del caché (sin actualizar por horario):');
      return cachedData;
    } else {
      log('🛑 No hay datos en caché y no es un horario válido para consultar al banco.');
      return { error: 'No hay datos en caché y la consulta debe hacerse de L a V después de las 11:45 am', statusCode: 400 };
    }
  }

  const cachedData = getCache();
  if (cachedData) {
    log('⚡ Retornando IBR desde el caché (válido por 1 hr).');
    return cachedData;
  }

  log('⏳ Consultando IBR desde BanRep...\n');

  let data;
  try {
    const response = await axios.get(
      'https://totoro.banrep.gov.co/estadisticas-economicas/',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      }
    );
    data = response.data;
  } catch (error) {
    return { error: 'El servicio del Banco de la República está caído o tardó demasiado en responder.', statusCode: 502, details: error.message };
  }

  const $ = cheerio.load(data);

  // Estrategia: encontrar el índice del <a> IBR overnight
  // y tomar el primer <span> con % que aparece inmediatamente después
  const todosLosElementos = $('a, span').toArray();

  let encontroLink = false;
  let ibr = null;

  for (const el of todosLosElementos) {
    const texto = $(el).text().trim();

    if (el.name === 'a' && texto === 'Indicador Bancario de Referencia (IBR) overnight, nominal') {
      encontroLink = true;
      continue;
    }

    if (encontroLink && el.name === 'span') {
      const match = texto.match(/(\d{1,2}[.,]\d{2,4})\s*%/);
      if (match) {
        ibr = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }
  }

  if (!ibr) {
    return { error: 'La estructura de la web del Banco de la República ha cambiado. Actualización de scraper requerida.', statusCode: 500 };
  }

  const fecha = new Date().toLocaleDateString('es-CO');
  const ibrEA = (Math.pow(1 + (ibr / 100) / 365, 365) - 1) * 100;
  const ibrMensual = (Math.pow(1 + (ibr / 100) / 365, 30) - 1) * 100;
  const usuraEA = ibrEA * 1.5;
  const usuraMensual = ibrMensual * 1.5;

  const resultado = {
    fecha,
    ibrNominal: +ibr.toFixed(4),
    ibrEA: +ibrEA.toFixed(4),
    ibrMensual: +ibrMensual.toFixed(4),
    usuraMaxEA: +usuraEA.toFixed(4),
    usuraMaxMens: +usuraMensual.toFixed(4),
  };

  log('─── IBR Overnight ───────────────────────');
  log(`📅 Fecha:               ${fecha}`);
  log(`📊 IBR Nominal:         ${ibr}%`);
  log(`📈 IBR EA:              ${ibrEA.toFixed(4)}%`);
  log(`📆 IBR Mensual:         ${ibrMensual.toFixed(4)}%`);
  log('─── Tasa de Usura ───────────────────────');
  log(`🚨 Usura Máx EA:       ${usuraEA.toFixed(4)}%`);
  log(`🚨 Usura Máx Mensual:  ${usuraMensual.toFixed(4)}%`);
  log('─────────────────────────────────────────');

  saveCache(resultado);
  log('\n📦 Se guardó el resultado en caché.');

  return resultado;
}

// Handler para AWS Lambda
exports.handler = async (event, context) => {
  try {
    const result = await obtenerIBR();

    if (result.error) {
      return {
        statusCode: result.statusCode || 500,
        body: JSON.stringify({ error: result.error, details: result.details })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno en Lambda', details: err.message })
    };
  }
};

// Ejecución por consola (Local / NPM CLI)
if (require.main === module) {
  obtenerIBR().then(res => {
    if (isJsonOutput) {
      // Elimina la propiedad extra de statusCode si fue retornada internamente para no ensuciar la salida JSON normal
      if (res && res.statusCode) delete res.statusCode;
      console.log(JSON.stringify(res, null, 2));
    } else if (res && res.error) {
      console.error('❌', res.error, res.details || '');
    }
  }).catch(e => {
    if (isJsonOutput) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('❌', e.message);
    }
  });
}

// Exportar funciones útiles para los tests sin modificar el resto
exports.obtenerIBR = obtenerIBR;
exports.isBusinessDayAndTime = isBusinessDayAndTime;
exports.getCache = getCache;
exports.saveCache = saveCache;
