// api/passes.js - ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ С ТОЧНЫМ РАСЧЕТОМ УГЛА И ОЧИСТКОЙ TLE
import { 
    twoline2satrec, 
    propagate, 
    gstime, 
    degreesToRadians,
    radiansToDegrees,
    eciToEcf,
    ecfToLookAngles
} from 'satellite.js';

// --- Константы ---
const TIME_STEP_SECONDS = 10;
const SECONDS_IN_DAY = 86400;

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        // Используем new URL() для корректного парсинга параметров
        const url = new URL(req.url, `http://${req.headers.host}`);
        const { searchParams } = url;
        
        // Получение и приведение типов параметров
        const tle1 = searchParams.get('tle1');
        const tle2 = searchParams.get('tle2');
        const lat = Number(searchParams.get('lat') || '32.0853');
        const lon = Number(searchParams.get('lon') || '34.7818');
        const min_el = Number(searchParams.get('min_el') || '10');
        const days = Number(searchParams.get('days') || '3'); 
        const altObserver = Number(searchParams.get('alt') || '0');

        if (!tle1 || !tle2) {
            return res.status(400).json({ error: 'tle1 и tle2 обязательны' });
        }

        // --- УСИЛЕННАЯ ОЧИСТКА TLE ---
        const cleanTle1 = tle1.replace(/\s+/g, ' ').trim();
        const cleanTle2 = tle2.replace(/\s+/g, ' ').trim();
        const satrec = twoline2satrec(cleanTle1, cleanTle2);

        // --- ПРОВЕРКА ОШИБКИ SGP4 ---
        if (satrec.error) {
             return res.status(500).json({ 
                 error: 'Ошибка инициализации SGP4', 
                 details: satrec.error
             });
        }
        
        // Точка наблюдения в радианах
        const observerCoords = {
            latitude: degreesToRadians(lat),
            longitude: degreesToRadians(lon),
            height: altObserver
        };

        const passes = [];
        const start = new Date();
        const end = new Date(start.getTime() + days * SECONDS_IN_DAY * 1000);

        let currentTime = start;
        let isVisible = false;
        let currentPass = null;

        while (currentTime.getTime() < end.getTime()) {
            
            const result = propagate(satrec, currentTime);
            
            if (result.position && result.velocity) {
                const gmst = gstime(currentTime);
                
                // --- ТОЧНЫЙ РАСЧЕТ УГЛА ВОЗВЫШЕНИЯ (ELEVATION) ---
                
                // 1. Преобразование ECI -> ECF (необходимо для расчета углов)
                const positionEcf = eciToEcf(result.position, gmst);

                // 2. Расчет углов видимости (Elevation, Azimuth, Range)
                const lookAngles = ecfToLookAngles(observerCoords, positionEcf);
                
                const currentElDeg = radiansToDegrees(lookAngles.elevation);
                
                const nowVisible = currentElDeg >= min_el;

                if (nowVisible && !isVisible) {
                    // НАЧАЛО ПРОХОДА (AOS)
                    isVisible = true;
                    currentPass = {
                        aos: new Date(currentTime),
                        maxEl: currentElDeg, 
                        time: new Date(currentTime),
                        azimuth: radiansToDegrees(lookAngles.azimuth)
                    };
                } else if (!nowVisible && isVisible) {
                    // КОНЕЦ ПРОХОДА (LOS)
                    isVisible = false;
                    if (currentPass && currentPass.maxEl >= min_el) {
                         currentPass.los = new Date(currentTime);
                         currentPass.duration = Math.round((currentPass.los.getTime() - currentPass.aos.getTime()) / 1000);
                         passes.push({
                            aos: currentPass.aos.toISOString(),
                            los: currentPass.los.toISOString(),
                            maxEl: currentPass.maxEl.toFixed(2), 
                            time: currentPass.time.toISOString(),
                            duration: currentPass.duration,
                            azimuth: currentPass.azimuth.toFixed(2)
                         });
                    }
                    currentPass = null;
                } else if (nowVisible && isVisible && currentPass) {
                    // Обновление максимальной высоты
                    if (currentElDeg > currentPass.maxEl) {
                        currentPass.maxEl = currentElDeg;
                        currentPass.time = new Date(currentTime);
                        currentPass.azimuth = radiansToDegrees(lookAngles.azimuth);
                    }
                }
            } else {
                 // Спутник упал или TLE невалидны
                 if (isVisible) {
                     isVisible = false;
                     currentPass = null;
                 }
            }

            // Переход к следующему временному шагу
            currentTime = new Date(currentTime.getTime() + TIME_STEP_SECONDS * 1000);
        }

        res.status(200).json({
            success: true,
            location: `${lat}, ${lon}`,
            days: days,
            minElevation: min_el,
            passes_found: passes.length,
            passes: passes.slice(0, 100)
        });

    } catch (err) {
        res.status(500).json({ 
            error: 'Общая ошибка API', 
            details: err.message 
        });
    }
}
