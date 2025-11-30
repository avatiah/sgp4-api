// api/passes.js
import { propagate, twoline2satrec, gstime, eciToGeodetic, degToRad, ecfToLookAngles } from 'satellite.js';

export default function handler(req, res) {
    // Получаем TLE и координаты наблюдателя.
    const { tle1, tle2, lat, lon, days } = req.query;

    if (!tle1 || !tle2) {
        return res.status(400).json({ error: "TLE lines are required" });
    }

    const OBSERVER_LAT = parseFloat(lat || 55.7558); // Москва по умолчанию
    const OBSERVER_LON = parseFloat(lon || 37.6173);
    const DURATION_DAYS = parseInt(days || 7);
    const MIN_ELEVATION_DEG = 10; // Минимальный угол возвышения для регистрации пролёта

    const satrec = twoline2satrec(tle1, tle2);
    const start = new Date();
    const end = new Date(start.getTime() + DURATION_DAYS * 24 * 60 * 60 * 1000);
    const passes = [];

    const observerGd = {
        latitude: degToRad(OBSERVER_LAT),
        longitude: degToRad(OBSERVER_LON),
        height: 0.05 // Высота в км (50 метров)
    };

    // --- ЛОГИКА ПРОГНОЗИРОВАНИЯ ПРОЛЁТОВ ---
    
    // Перебираем время с шагом 1 минута (60000 мс)
    for (let t = new Date(start.getTime()); t.getTime() <= end.getTime(); t.setTime(t.getTime() + 60000)) {
        
        // 1. Пропагация орбиты
        const positionAndVelocity = propagate(satrec, t);
        if (positionAndVelocity.position === false) continue;

        const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gstime(t));

        // 2. Расчет углов Az/El относительно наблюдателя (КРИТИЧЕСКИЙ ШАГ!)
        const lookAngles = ecfToLookAngles(observerGd, positionEcf);
        
        const elevationRad = lookAngles.elevation;
        const elevationDeg = elevationRad * (180 / Math.PI);

        // 3. Проверка условия видимости (Elevation > 10 градусов)
        if (elevationDeg >= MIN_ELEVATION_DEG) {
            
            // Если спутник виден, сохраняем точку
            passes.push({
                time: t.toISOString(),
                maxEl: elevationDeg.toFixed(1), // Максимальный угол возвышения
                azimuth: (lookAngles.azimuth * (180 / Math.PI)).toFixed(1),
            });
        }
    }
    
    // Возвращаем результаты (ограничим до первых 50, чтобы не перегружать ответ)
    res.status(200).json({ passes: passes.slice(0, 50) });
}

export const config = {
    api: {
        externalResolver: true,
    },
};
