const nock = require('nock');
const { obtenerIBR, getCache, isBusinessDayAndTime } = require('./ibr');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'ibr_cache.json');

// HTML Mock para simular la web del Banco de la República
const validHtmlResponse = `
  <html>
    <body>
      <a href="#">Indicador Bancario de Referencia (IBR) overnight, nominal</a>
      <span>11,25 %</span>
    </body>
  </html>
`;

const invalidHtmlResponse = `
  <html>
    <body>
      <a href="#">Otra Tasa Distinta</a>
      <span>11,25 %</span>
    </body>
  </html>
`;

// Helper para limpiar la caché antes de cada prueba
const cleanCache = () => {
    if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
    }
};

describe('IBR Scraper (AWS Lambda & CLI)', () => {
    beforeEach(() => {
        cleanCache();
        nock.cleanAll();
    });

    afterAll(() => {
        cleanCache();
    });

    test('Debe extraer y calcular correctamente las tasas cuando el HTML es válido', async () => {
        // Interceptar la llamada HTTP de axios a la URL real
        nock('https://totoro.banrep.gov.co')
            .get('/estadisticas-economicas/')
            .reply(200, validHtmlResponse);

        // Mockear la función de horario para forzar que sea válida
        const originalIsBusiness = isBusinessDayAndTime;
        try {
            // Necesitamos asegurar que el script intente consultar (Saltarse la restricción de horario)
            jest.spyOn(global.Date, 'now').mockImplementation(() => new Date('2026-03-03T14:00:00.000Z').valueOf());
            // NOTA: Como isBusinessDayAndTime usa "new Date()", lo evitamos forzando un datetime de un día hábil (Marzo 3 2026, Martes, 14:00 UTC = 09:00 Colombia). 
            // Al ser 09:00 no pasaría el condicional de >11:45, así que mockearemos toda la fecha para las 18:00 UTC (13:00 Colombia).
        } catch (e) { }

        // Forzamos la hora a las 1 PM (Hora Colombia) en un Martes
        const mockDate = new Date('2026-03-03T18:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
        Date.now = jest.fn(() => mockDate.getTime());

        const resultado = await obtenerIBR();

        expect(resultado).not.toBeNull();
        // Validamos que retornó los objetos esperados
        expect(resultado).toHaveProperty('ibrNominal');
        expect(resultado.ibrNominal).toBe(11.25);
        expect(resultado).toHaveProperty('ibrEA');
        expect(resultado).toHaveProperty('usuraMaxEA');

        // Restauramos el Date real
        jest.restoreAllMocks();
    });

    test('Debe retornar un error humanizado (statusCode: 500) si cambia el HTML', async () => {
        nock('https://totoro.banrep.gov.co')
            .get('/estadisticas-economicas/')
            .reply(200, invalidHtmlResponse);

        // Forzamos el horario válido (Martes 1 PM Colombia)
        const mockDate = new Date('2026-03-03T18:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

        const resultado = await obtenerIBR();

        expect(resultado).toHaveProperty('error');
        expect(resultado.statusCode).toBe(500);
        expect(resultado.error).toContain('La estructura de la web del Banco de la República ha cambiado');

        jest.restoreAllMocks();
    });

    test('Debe retornar un error humanizado (statusCode: 502) si el servidor Banrep falla', async () => {
        // Simulamos un error 503 del servidor
        nock('https://totoro.banrep.gov.co')
            .get('/estadisticas-economicas/')
            .reply(503, 'Service Unavailable');

        const mockDate = new Date('2026-03-03T18:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

        const resultado = await obtenerIBR();

        expect(resultado).toHaveProperty('error');
        expect(resultado.statusCode).toBe(502);
        expect(resultado.error).toContain('El servicio del Banco de la República está caído');

        jest.restoreAllMocks();
    });

    test('Debe retornar un error humanizado (statusCode: 400) si es fin de semana y no hay caché', async () => {
        // Forzamos Sábado (07 Marzo 2026)
        const mockDate = new Date('2026-03-07T18:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

        const resultado = await obtenerIBR();

        expect(resultado).toHaveProperty('error');
        expect(resultado.statusCode).toBe(400);
        expect(resultado.error).toContain('L a V después de las 11:45 am');

        jest.restoreAllMocks();
    });
});
