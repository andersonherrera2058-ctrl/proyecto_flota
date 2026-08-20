const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de PostgreSQL con SSL para Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Proteger el proceso Node para que NO muera ante errores inesperados de base de datos
process.on('uncaughtException', (err) => {
  console.error('CRITICAL ERROR Caught:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Middleware para verificar API Key en escrituras
const checkApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.body.api_key;
  if (key === 'PRODESEG_LIVE_2026') {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Acceso denegado: API Key inválida o no proporcionada.' });
  }
};

// Endpoint de prueba / Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date() });
});

// Endpoint para consultar guía
app.get('/api/tracking/:guia', async (req, res) => {
  try {
    const { guia } = req.params;
    const result = await pool.query(
      'SELECT * FROM historial_trazabilidad WHERE numero_guia = $1 ORDER BY fecha_reporte DESC',
      [guia]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error en BD:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor al consultar la guía.' });
  }
});

// Endpoint para guardar registros (Protegido)
app.post('/api/tracking', checkApiKey, async (req, res) => {
  try {
    const { numero_guia, estado_envio, ubicacion, notas, foto_url, maps_url } = req.body;
    
    await pool.query(
      `INSERT INTO historial_trazabilidad (numero_guia, estado_envio, ubicacion, notas, foto_url, maps_url, fecha_reporte) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [numero_guia, estado_envio, ubicacion, notas, foto_url, maps_url]
    );

    res.json({ success: true, message: 'Evento guardado exitosamente' });
  } catch (err) {
    console.error('Error guardando en BD:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para reporte consolidado general
app.get('/api/reports/general', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT numero_guia as guia, estado_envio, ubicacion, notas, fecha_reporte, maps_url, 
              CASE WHEN foto_url IS NOT NULL THEN 'SI' ELSE 'NO' END as tiene_evidencia 
       FROM historial_trazabilidad ORDER BY fecha_reporte DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint de Sembrado / Seed de prueba
app.get('/api/seed-demo', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS historial_trazabilidad (
        id SERIAL PRIMARY KEY,
        numero_guia VARCHAR(50) NOT NULL,
        estado_envio VARCHAR(100) NOT NULL,
        ubicacion VARCHAR(255) NOT NULL,
        notas TEXT,
        foto_url TEXT,
        maps_url TEXT,
        fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Limpiar e insertar semilla
    await pool.query('DELETE FROM historial_trazabilidad WHERE numero_guia IN (\'PRO-001\', \'PRO-002\', \'48600\')');
    
    await pool.query(`
      INSERT INTO historial_trazabilidad (numero_guia, estado_envio, ubicacion, notas, maps_url, fecha_reporte)
      VALUES 
      ('PRO-001', 'EN BODEGA', 'Bodega Principal Bogotá - CEDI', 'Mercancía alistada y verificada en rampa', 'https://www.google.com/maps?q=4.7110,-74.0721', NOW() - INTERVAL '2 hours'),
      ('48600', 'ENTREGADO', 'Ubicación GPS (4.7182, -74.2272)', 'Entrega de prueba confirmada', 'https://www.google.com/maps?q=4.7182,-74.2272', NOW());
    `);

    res.json({ success: true, message: 'Base de datos inicializada y poblada con exito.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor PRODESEG corriendo en puerto ${PORT}`);
});
