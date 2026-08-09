const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SYSTEM_META = {
  organization: "Polaris I.N.C",
  tagline: "Sistemas automatizados para un mundo globalizado",
  engine: "Polaris Logistics Ecosystem v2.0"
};

// Inicialización de base de datos
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

    console.log('⚡ [POLARIS I.N.C] Base de datos sincronizada y lista.');
  } catch (err) {
    console.error('⚠️ [POLARIS I.N.C] Aviso en BD:', err.message);
  }
}
initDB();

// GET: Consultar trazabilidad de una guía (Soporta múltiples columnas y formatos)
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

    res.json({
      meta: SYSTEM_META,
      query: guiaLimpia,
      total_records: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error en GET /api/tracking:', err.message);
    res.status(500).json({ meta: SYSTEM_META, error: `Error al consultar trazabilidad: ${err.message}` });
  }
});

// POST: Registrar nuevo evento + Foto + GPS
app.post('/api/tracking', async (req, res) => {
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

    res.json({ 
      meta: SYSTEM_META, 
      success: true, 
      message: 'Evento guardado exitosamente en Polaris I.N.C' 
    });
  } catch (err) {
    console.error('❌ Error en POST /api/tracking:', err.message);
    res.status(500).json({ meta: SYSTEM_META, error: err.message });
  }
});

// GET: Métricas e Indicadores de Efectividad para Dashboard
app.get('/api/dashboard', async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;

  let filtroFecha = '';
  const params = [];

  if (fecha_inicio && fecha_fin) {
    filtroFecha = ' WHERE fecha_reporte >= $1 AND fecha_reporte <= $2';
    params.push(fecha_inicio, fecha_fin + ' 23:59:59');
  }

  try {
    const query = `
      WITH ultimos_estados AS (
        SELECT DISTINCT ON (COALESCE(guia_transporte::TEXT, numero_guia::TEXT))
               COALESCE(guia_transporte::TEXT, numero_guia::TEXT) AS guia,
               estado_envio,
               fecha_reporte
        FROM historial_trazabilidad
        ${filtroFecha}
        ORDER BY COALESCE(guia_transporte::TEXT, numero_guia::TEXT), fecha_reporte DESC
      )
      SELECT 
        COUNT(*) AS total_guias,
        COUNT(*) FILTER (WHERE estado_envio = 'ENTREGADO') AS entregados,
        COUNT(*) FILTER (WHERE estado_envio = 'NOVEDAD') AS novedades,
        COUNT(*) FILTER (WHERE estado_envio IN ('DESPACHADO', 'EN_TRANSITO', 'EN_REPARTO')) AS en_proceso
      FROM ultimos_estados;
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    const total = parseInt(row.total_guias) || 0;
    const entregados = parseInt(row.entregados) || 0;
    const novedades = parseInt(row.novedades) || 0;
    const enProceso = parseInt(row.en_proceso) || 0;

    const efectividad = total > 0 ? ((entregados / total) * 100).toFixed(1) : 0;
    const porcentajeNovedades = total > 0 ? ((novedades / total) * 100).toFixed(1) : 0;

    res.json({
      meta: SYSTEM_META,
      metrics: {
        total_guias: total,
        entregados,
        novedades,
        en_proceso: enProceso,
        efectividad_porcentaje: parseFloat(efectividad),
        novedades_porcentaje: parseFloat(porcentajeNovedades)
      }
    });
  } catch (err) {
    console.error('❌ Error en GET /api/dashboard:', err.message);
    res.status(500).json({ meta: SYSTEM_META, error: 'Error calculando indicadores del dashboard' });
  }
});

app.listen(port, () => {
  console.log(`🚀 [POLARIS I.N.C] Servidor ejecutándose en el puerto ${port}`);
});

