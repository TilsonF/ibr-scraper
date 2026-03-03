# IBR Scraper (Banco de la República de Colombia)

Este proyecto es un scraper desarrollado en Node.js para obtener la Tasa IBR (Indicador Bancario de Referencia) publicada por el Banco de la República de Colombia.

## Instalación

1. Clona el repositorio.
2. Instala las dependencias:
   ```bash
   npm install
   ```

## Uso

Puedes usar NPM para ejecutar el scraper o correrlo directamente con node.

### Uso estándar

Para ver el reporte completo en consola con logs informativos:
```bash
npm start
# o también: node ibr.js
```

### Uso para APIs y automatizaciones

Si deseas obtener únicamente la respuesta en formato JSON puro, sin decoraciones de registro (ideal para consumirlo desde otro servicio o API), utiliza:

```bash
npm run api
# o también: node ibr.js --json
```

### Ejecutar en modo debug

Para ejecutar el scraper en modo debug:
```bash
node ibr_debug.js
```

### Ejecutar pruebas (Unit Tests)

Este proyecto incluye pruebas unitarias con Jest para validar los escenarios de conectividad y extracción.

```bash
npm test
```

## Despliegue en AWS Lambda

El scraper está diseñado para funcionar nativamente en AWS Lambda usando el `handler` exportado.

1. **Empaquetar la función**:
   Instala las dependencias y crea un archivo ZIP con el contenido del proyecto (excluyendo tests o `.git` si lo prefieres).
   ```bash
   zip -r ibr-scraper.zip .
   ```
2. **Configuración en Lambda**:
   - Runtime: **Node.js 18.x** (o superior).
   - Handler: `ibr.handler`
   - Memory: 128 MB o 256 MB es suficiente.
   - Timeout: Al menos 15-20 segundos.

3. *(Opcional)*: Puedes configurar una regla en **Amazon EventBridge** (ej: `cron(46 16 ? * MON-FRI *)` que equivale a las 11:46 a.m. en Colombia) para invocar esta función a diario.
