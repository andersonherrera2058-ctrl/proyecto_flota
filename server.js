const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const API_SECRET_KEY = "PRODESEG_LIVE_2026";

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SYSTEM_META = {
  organization: "PRODESEG S.A.",
  tagline: "Protección Contra Incendios y Seguridad Industrial",
  website: "www.prodeseg.com.co",
  engine: "Prodeseg Logistics & Tracking API v3.0"
};

// Middleware de seguridad por API Key para escritura
function verificarApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.body.api_key;
  if (!apiKey || apiKey !== API_SECRET_KEY) {
    return res.status(401).json({ meta: SYSTEM_META, error: 'Acceso denegado: API Key inválida o no proporcionada.' });
  }
  next();
}

// Inicialización y sincronización de base de datos
async function initDB() {
  try {
    await pool.query(`
      ALTER TABLE historial_trazabilidad 
      DROP CONSTRAINT IF EXISTS historial_trazabilidad_guia_transporte_fkey;
    `);
    await pool.query(`
      ALTER TABLE historial_trazabilidad ADD COLUMN IF NOT EXISTS guia_transporte VARCHAR(50);
      ALTER TABLE historial_trazabilidad ADD COLUMN IF NOT EXISTS numero_guia VARCHAR(50);
      ALTER TABLE historial_trazabilidad ADD COLUMN IF NOT EXISTS foto_url TEXT;
      ALTER TABLE historial_trazabilidad ADD COLUMN IF NOT EXISTS maps_url TEXT;
    `);
    console.log('🔥 [PRODESEG S.A.] Base de datos sincronizada y segura.');
  } catch (err) {
    console.error('⚠️ [PRODESEG S.A.] Aviso en BD:', err.message);
  }
}
initDB();

// GET: Cargar portal de clientes al ingresar a la raíz (https://proyecto-flota-okdm.onrender.com/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

// GET: Consulta pública de trazabilidad por guía
app.get('/api/tracking/:guia', async (req, res) => {
  const { guia } = req.params;
  const guiaLimpia = guia.trim();
  try {
    const result = await pool.query(
      `SELECT * FROM historial_trazabilidad 
       WHERE UPPER(COALESCE(guia_transporte::TEXT, '')) = UPPER($1)
          OR UPPER(COALESCE(numero_guia::TEXT, '')) = UPPER($1)
          OR UPPER(COALESCE(guia_transporte::TEXT, '')) LIKE UPPER('%' || $1 || '%')
          OR UPPER(COALESCE(numero_guia::TEXT, '')) LIKE UPPER('%' || $1 || '%')
       ORDER BY fecha_reporte DESC`,
      [guiaLimpia]
    );
    res.json({ meta: SYSTEM_META, query: guiaLimpia, total_records: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ meta: SYSTEM_META, error: `Error al consultar: ${err.message}` });
  }
});

// GET: Reporte general consolidado para Excel (Ligero)
app.get('/api/reports/general', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(guia_transporte, numero_guia) AS guia, estado_envio, ubicacion, notas, maps_url, fecha_reporte, 
              CASE WHEN foto_url IS NOT NULL THEN 'SI' ELSE 'NO' END AS tiene_evidencia
       FROM historial_trazabilidad ORDER BY fecha_reporte DESC`
    );
    res.json({ meta: SYSTEM_META, total_records: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ meta: SYSTEM_META, error: 'Error al obtener reporte general.' });
  }
});

// POST: Registrar evento protegido con API Key
app.post('/api/tracking', verificarApiKey, async (req, res) => {
  const { numero_guia, estado_envio, ubicacion, notas, foto_url, maps_url } = req.body;
  if (!numero_guia || !estado_envio || !ubicacion) {
    return res.status(400).json({ meta: SYSTEM_META, error: 'Faltan campos obligatorios' });
  }
  try {
    const guiaLimpia = numero_guia.trim();
    await pool.query(
      `INSERT INTO historial_trazabilidad (guia_transporte, numero_guia, estado_envio, ubicacion, notas, foto_url, maps_url) 
       VALUES ($1, $1, $2, $3, $4, $5, $6)`,
      [guiaLimpia, estado_envio, ubicacion, notas || null, foto_url || null, maps_url || null]
    );
    res.json({ meta: SYSTEM_META, success: true, message: 'Evento guardado exitosamente en PRODESEG S.A.' });
  } catch (err) {
    res.status(500).json({ meta: SYSTEM_META, error: err.message });
  }
});

// GET: Indicadores de gestión para el Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const query = `
      WITH ultimos_estados AS (
        SELECT DISTINCT ON (COALESCE(guia_transporte::TEXT, numero_guia::TEXT))
               COALESCE(guia_transporte::TEXT, numero_guia::TEXT) AS guia,
               estado_envio, fecha_reporte
        FROM historial_trazabilidad
        ORDER BY COALESCE(guia_transporte::TEXT, numero_guia::TEXT), fecha_reporte DESC
      )
      SELECT 
        COUNT(*) AS total_guias,
        COUNT(*) FILTER (WHERE estado_envio = 'ENTREGADO') AS entregados,
        COUNT(*) FILTER (WHERE estado_envio = 'NOVEDAD') AS novedades,
        COUNT(*) FILTER (WHERE estado_envio IN ('EN_BODEGA', 'DESPACHADO', 'EN_TRANSITO', 'EN_REPARTO')) AS en_proceso
      FROM ultimos_estados;
    `;
    const result = await pool.query(query);
    const row = result.rows[0];

    res.json({
      meta: SYSTEM_META,
      metrics: {
        total_guias: parseInt(row.total_guias) || 0,
        entregados: parseInt(row.entregados) || 0,
        novedades: parseInt(row.novedades) || 0,
        en_proceso: parseInt(row.en_proceso) || 0
      }
    });
  } catch (err) {
    res.status(500).json({ meta: SYSTEM_META, error: 'Error al calcular indicadores.' });
  }
});

// GET: Endpoint de 1 solo clic para limpiar la BD y crear las 3 guías demo
app.get('/api/seed-demo', async (req, res) => {
  try {
    await pool.query('DELETE FROM historial_trazabilidad;');

    await pool.query(`
      INSERT INTO historial_trazabilidad (guia_transporte, numero_guia, estado_envio, ubicacion, notas, maps_url, foto_url) 
      VALUES 
      ('PRO-001', 'PRO-001', 'ENTREGADO', 'Bodega Principal Bogotá CEDI', 'Entrega satisfactoria de equipos contra incendio. Recibió Ing. Roberto Gómez con sello y firma autorizada.', 'https://www.google.com/maps?q=4.7110,-74.0721', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      ('PRO-002', 'PRO-002', 'EN RUTA', 'Autopista Norte Km 18 - Flota Prodeseg Movilidad 03', 'Despacho en tránsito hacia cliente industrial con custodia satelital activa.', 'https://www.google.com/maps?q=4.7384,-74.2589', NULL),
      ('PRO-003', 'PRO-003', 'NOVEDAD', 'Punto de Control Mosquera', 'Reprogramación solicitada por cliente final por inventario en planta. Cita agendada para el miércoles.', 'https://www.google.com/maps?q=4.7049,-74.2307', NULL);
    `);

    res.json({ success: true, message: '🔥 Base de datos limpia y 3 guías demo creadas exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🔥 [PRODESEG S.A.] Servidor seguro activo en puerto ${port}`);
});

