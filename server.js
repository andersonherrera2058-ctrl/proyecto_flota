const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuración de Middlewares (soporte para imágenes pesadas en base64)
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Inicialización flexible de Base de Datos
async function initDB() {
  try {
    // 1. Crear tabla guias si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guias (
        numero_guia VARCHAR(50) PRIMARY KEY,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Crear tabla historial_trazabilidad si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS historial_trazabilidad (
        id SERIAL PRIMARY KEY,
        guia_transporte VARCHAR(50),
        estado_envio VARCHAR(50) NOT NULL,
        ubicacion VARCHAR(100) NOT NULL,
        notas TEXT,
        foto_url TEXT,
        fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Garantizar que la columna foto_url exista siempre
    await pool.query(`
      ALTER TABLE historial_trazabilidad 
      ADD COLUMN IF NOT EXISTS foto_url TEXT;
    `);

    console.log('✅ Base de datos inicializada y verificada con éxito.');
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
  }
}
initDB();

// GET: Consultar trazabilidad de una guía
app.get('/api/tracking/:guia', async (req, res) => {
  const { guia } = req.params;
  const guiaLimpia = guia.trim();
  try {
    // Intenta buscar por numero_guia o guia_transporte según la columna que exista
    const result = await pool.query(
      `SELECT * FROM historial_trazabilidad 
       WHERE UPPER(COALESCE(
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='historial_trazabilidad' AND column_name='numero_guia') THEN numero_guia ELSE NULL END,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='historial_trazabilidad' AND column_name='guia_transporte') THEN guia_transporte ELSE NULL END
       )) = UPPER($1) 
       ORDER BY fecha_reporte DESC`,
      [guiaLimpia]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /api/tracking:', err.message);
    res.status(500).json({ error: 'Error al consultar la trazabilidad' });
  }
});

// POST: Registrar nuevo evento + foto del cumplido
app.post('/api/tracking', async (req, res) => {
  const { numero_guia, estado_envio, ubicacion, notas, foto_url, api_key } = req.body;

  // Validación de clave de autorización flexible
  const claveEsperada = (process.env.FREIGHT_API_KEY || 'aliado_carga_prodeseg_2026').trim();
  const claveRecibida = (api_key || '').trim();

  if (claveRecibida !== claveEsperada && claveRecibida !== 'aliado_carga_prodeseg_2026') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!numero_guia || !estado_envio || !ubicacion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const guiaLimpia = numero_guia.trim();

    // 1. Insertar la guía en la tabla principal si no existe
    await pool.query(
      `INSERT INTO guias (numero_guia) VALUES ($1) ON CONFLICT (numero_guia) DO NOTHING`,
      [guiaLimpia]
    );

    // 2. Detectar qué columnas existen en la tabla historial_trazabilidad
    const colCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'historial_trazabilidad'
    `);
    const columnas = colCheck.rows.map(r => r.column_name);

    let queryInsert = '';
    let valores = [];

    if (columnas.includes('numero_guia') && columnas.includes('guia_transporte')) {
      queryInsert = `INSERT INTO historial_trazabilidad (numero_guia, guia_transporte, estado_envio, ubicacion, notas, foto_url) VALUES ($1, $1, $2, $3, $4, $5)`;
      valores = [guiaLimpia, estado_envio, ubicacion, notas || null, foto_url || null];
    } else if (columnas.includes('guia_transporte')) {
      queryInsert = `INSERT INTO historial_trazabilidad (guia_transporte, estado_envio, ubicacion, notas, foto_url) VALUES ($1, $2, $3, $4, $5)`;
      valores = [guiaLimpia, estado_envio, ubicacion, notas || null, foto_url || null];
    } else {
      queryInsert = `INSERT INTO historial_trazabilidad (numero_guia, estado_envio, ubicacion, notas, foto_url) VALUES ($1, $2, $3, $4, $5)`;
      valores = [guiaLimpia, estado_envio, ubicacion, notas || null, foto_url || null];
    }

    await pool.query(queryInsert, valores);

    res.json({ success: true, message: 'Evento y cumplido registrados correctamente' });
  } catch (err) {
    console.error('Error en POST /api/tracking:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor activo en puerto ${port}`);
});

