// api/passes.js — финальная рабочая версия (декабрь 2025)
import { twoline2satrec, propagate, gstime, eciToGeodetic } from 'satellite.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { tle1, tle2, lat = '55.7558', lon = '37.6173', days = '7' } = req.query;

  if (!tle1 || !tle2) {
    return res.status(400).json({ error: 'tle1 и tle2 обязательны' });
  }

  try {
    const satrec = twoline2satrec(tle1.trim(), tle2.trim());

    const start = new Date();
    const end = new Date(start.getTime() + Number(days) * 86400000);
    const passes = [];
    let current = new Date(start);

    while (current <= end) {
      const result = propagate(satrec, current);

      // Ключевая проверка — спасает от краша
      if (result.position && result.velocity) {
        const gmst = gstime(current);
        const pos = eciToGeodetic(result.position, gmst);

        const satLat = pos.latitude * 180 / Math.PI;
        const satLon = pos.longitude * 180 / Math.PI;
        const alt = pos.height;

        if (alt > 100 && 
           Math.abs(satLat - Number(lat)) < 25 && 
           Math.abs(satLon - Number(lon)) < 25) {
          passes.push({
            time: current.toISOString(),
            lat: satLat.toFixed(4),
            lon: satLon.toFixed(4),
            alt: Math.round(alt) + ' km'
          });
        }
      }
      // Шаг 3 минуты — быстро и точно
      current.setMinutes(current.getMinutes() + 3);
    }

    res.status(200).json({
      success: true,
      location: `${lat}, ${lon}`,
      days: Number(days),
      passes_found: passes.length,
      passes: passes.slice(0, 100)
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Расчёт не удался', 
      details: err.message 
    });
  }
}

export const config = { api: { bodyParser: false } };
