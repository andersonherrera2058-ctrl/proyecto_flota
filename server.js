require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. Obtener productos
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Registrar eventos de trazabilidad (POST)
app.post('/api/open-tracking/update', async (req, res) => {
  try {
    const apiKey = req.headers['x-freight-partner-key'];
    if (apiKey !== process.env.FREIGHT_API_KEY) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { guia_transporte, estado_envio, ubicacion, notas } = req.body;
    const result = await pool.query(
      `INSERT INTO historial_trazabilidad (guia_transporte, estado_envio, ubicacion, notas)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [guia_transporte, estado_envio, ubicacion, notas]
    );

    res.json({
      exito: true,
      mensaje: 'Estado de trazabilidad actualizado correctamente.',
      evento: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Consultar historial de una guía (GET)
app.get('/api/tracking/:guia', async (req, res) => {
  try {
    const { guia } = req.params;
    const result = await pool.query(
      'SELECT * FROM historial_trazabilidad WHERE guia_transporte = $1 ORDER BY id DESC',
      [guia]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INICIAR EL SERVIDOR (Siempre al final)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Prodeseg activo en http://localhost:${PORT}`);
});

