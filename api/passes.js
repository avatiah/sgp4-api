// api/passes.js
import { twoline2satrec, propagate, gstime, eciToGeodetic } from 'satellite.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { tle1, tle2, lat = '55.7558', lon = '37.6173', days = '7' } = req.query;

  if (!tle1 || !tle2) {
    return res.status(400).json({ error: 'tle1 and tle2 parameters are required' });
  }

  try {
    const satrec = twoline2satrec(tle1, tle2);
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + Number(days) * 86400000);
    const passes = [];

    for (let date = new Date(startDate); date <= endDate; date.setMinutes(date.getMinutes() + 3)) {
      const position = propagate(satrec, date);
      if (position.position === false) continue;

      const gmst = gstime(date);
      const coord = eciToGeodetic(position.position, gmst);

      const satLat = coord.latitude * 180 / Math.PI;
      const satLon = coord.longitude * 180 / Math.PI;
      const height = coord.height;

      if (height > 100 &&
          Math.abs(satLat - Number(lat)) < 20 &&
          Math.abs(satLon - Number(lon)) < 20) {
        passes.push({
          time: date.toISOString(),
          lat: satLat.toFixed(4),
          lon: satLon.toFixed(4),
          alt: height.toFixed(0) + ' km'
        });
      }
    }

    res.status(200).json({
      success: true,
      location: { lat: Number(lat), lon: Number(lon) },
      period_days: Number(days),
      passes_found: passes.length,
      passes
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Calculation failed', message: err.message });
  }
}

export const config = { api: { bodyParser: false } };
