import { propagate, twoline2satrec, gstime, eciToGeodetic } from 'satellite.js';

export default function handler(req, res) {
  const { tle1, tle2, lat = 55.7558, lon = 37.6173, days = 7 } = req.query;

  if (!tle1 || !tle2) {
    return res.status(400).json({ error: "TLE lines are required" });
  }

  const satrec = twoline2satrec(tle1, tle2);
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const passes = [];

  for (let t = start; t <= end; t.setMinutes(t.getMinutes() + 1)) {
    const positionAndVelocity = propagate(satrec, t);
    if (positionAndVelocity.position === false) continue;

    const positionEci = positionAndVelocity.position;
    const gmst = gstime(t);
    const positionGd = eciToGeodetic(positionEci, gmst);

    const latitude = positionGd.latitude * (180 / Math.PI);
    const longitude = positionGd.longitude * (180 / Math.PI);
    const height = positionGd.height;

    // Виден ли спутник с земли?
    if (height > 100 && 
        Math.abs(latitude - parseFloat(lat)) < 15 && 
        Math.abs(longitude - parseFloat(lon)) < 15) {
      
      passes.push({
        time: t.toISOString(),
        lat: latitude.toFixed(4),
        lon: longitude.toFixed(4),
        alt: height.toFixed(1)
      });
    }
  }

  res.status(200).json({ passes: passes.slice(0, 50) }); // первые 50 пролётов
}

export const config = {
  api: {
    externalResolver: true,
  },
};

add api/passes.js
