const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Aumentamos el límite para permitir recibir fotos en formato Base64
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Inicialización de base de datos
async function initDB() {
  try {
    // 1. Crear tabla de guías si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guias (
        numero_guia VARCHAR(50) PRIMARY KEY,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Crear tabla de historial
    await pool.query(`
      CREATE TABLE IF NOT EXISTS historial_trazabilidad (
        id SERIAL PRIMARY KEY,
        numero_guia VARCHAR(50) REFERENCES guias(numero_guia),
        estado_envio VARCHAR(50) NOT NULL,
        ubicacion VARCHAR(100) NOT NULL,
        notas TEXT,
        foto_url TEXT,
        fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Asegurar columna foto_url por si la tabla ya existía
    await pool.query(`
      ALTER TABLE historial_trazabilidad 
      ADD COLUMN IF NOT EXISTS foto_url TEXT;
    `);

    console.log('✅ Base de datos verificada y lista.');
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
  }
}
initDB();

// GET: Consultar trazabilidad de una guía
app.get('/api/tracking/:guia', async (req, res) => {
  const { guia } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM historial_trazabilidad WHERE UPPER(numero_guia) = UPPER($1) ORDER BY fecha_reporte DESC`,
      [guia]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar la trazabilidad' });
  }
});

// POST: Registrar nuevo evento (crea la guía si no existe + foto)
app.post('/api/tracking', async (req, res) => {
  const { numero_guia, estado_envio, ubicacion, notas, foto_url, api_key } = req.body;

  if (api_key !== process.env.FREIGHT_API_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!numero_guia || !estado_envio || !ubicacion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    // Registra la guía de forma automática si es un número nuevo
    await pool.query(
      `INSERT INTO guias (numero_guia) VALUES ($1) ON CONFLICT (numero_guia) DO NOTHING`,
      [numero_guia.trim()]
    );

    // Inserta el evento en el historial con la foto opcional
    await pool.query(
      `INSERT INTO historial_trazabilidad (numero_guia, estado_envio, ubicacion, notas, foto_url) 
       VALUES ($1, $2, $3, $4, $5)`,
      [numero_guia.trim(), estado_envio, ubicacion, notas || null, foto_url || null]
    );

    res.json({ success: true, message: 'Evento y cumplido registrados correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor activo en el puerto ${port}`);
});


