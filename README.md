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
