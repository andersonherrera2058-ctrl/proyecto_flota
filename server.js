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

// Inicialización de la base de datos
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
    `);

    console.log('✅ Base de datos reconfigurada correctamente.');
  } catch (err) {
    console.error('⚠️ Aviso en reconfiguración de BD:', err.message);
  }
}
initDB();

// GET: Consultar trazabilidad de una guía
app.get('/api/tracking/:guia', async (req, res) => {
  const { guia } = req.params;
  const guiaLimpia = guia.trim();

  try {
    const result = await pool.query(
      `SELECT * FROM historial_trazabilidad 
       WHERE UPPER(COALESCE(guia_transporte::TEXT, numero_guia::TEXT, '')) = UPPER($1)
          OR UPPER(COALESCE(numero_guia::TEXT, guia_transporte::TEXT, '')) = UPPER($1)
       ORDER BY fecha_reporte DESC`,
      [guiaLimpia]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error en GET /api/tracking:', err.message);
    res.status(500).json({ error: `Error al consultar trazabilidad: ${err.message}` });
  }
});

// POST: Registrar nuevo evento (Directo sin requerir clave API)
app.post('/api/tracking', async (req, res) => {
  const { numero_guia, estado_envio, ubicacion, notas, foto_url } = req.body;

  if (!numero_guia || !estado_envio || !ubicacion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const guiaLimpia = numero_guia.trim();

    await pool.query(
      `INSERT INTO historial_trazabilidad (guia_transporte, numero_guia, estado_envio, ubicacion, notas, foto_url) 
       VALUES ($1, $1, $2, $3, $4, $5)`,
      [guiaLimpia, estado_envio, ubicacion, notas || null, foto_url || null]
    );

    res.json({ success: true, message: 'Evento y cumplido registrados correctamente' });
  } catch (err) {
    console.error('❌ Error en POST /api/tracking:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor activo en el puerto ${port}`);
});

