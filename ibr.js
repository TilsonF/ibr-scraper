const axios   = require('axios');
const cheerio = require('cheerio');

async function obtenerIBR() {
  console.log('⏳ Consultando IBR desde BanRep...\n');

  const { data } = await axios.get(
    'https://totoro.banrep.gov.co/estadisticas-economicas/',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 20000,
    }
  );

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

  if (!ibr) throw new Error('No se pudo extraer el IBR');

  const fecha        = new Date().toLocaleDateString('es-CO');
  const ibrEA        = (Math.pow(1 + (ibr / 100) / 365, 365) - 1) * 100;
  const ibrMensual   = (Math.pow(1 + (ibr / 100) / 365, 30)  - 1) * 100;
  const usuraEA      = ibrEA * 1.5;
  const usuraMensual = ibrMensual * 1.5;

  const resultado = {
    fecha,
    ibrNominal:   +ibr.toFixed(4),
    ibrEA:        +ibrEA.toFixed(4),
    ibrMensual:   +ibrMensual.toFixed(4),
    usuraMaxEA:   +usuraEA.toFixed(4),
    usuraMaxMens: +usuraMensual.toFixed(4),
  };

  console.log('─── IBR Overnight ───────────────────────');
  console.log(`📅 Fecha:               ${fecha}`);
  console.log(`📊 IBR Nominal:         ${ibr}%`);
  console.log(`📈 IBR EA:              ${ibrEA.toFixed(4)}%`);
  console.log(`📆 IBR Mensual:         ${ibrMensual.toFixed(4)}%`);
  console.log('─── Tasa de Usura ───────────────────────');
  console.log(`🚨 Usura Máx EA:       ${usuraEA.toFixed(4)}%`);
  console.log(`🚨 Usura Máx Mensual:  ${usuraMensual.toFixed(4)}%`);
  console.log('─────────────────────────────────────────');
  console.log('\n📦 JSON:');
  console.log(JSON.stringify(resultado, null, 2));

  return resultado;
}

obtenerIBR().catch(e => console.error('❌', e.message));
