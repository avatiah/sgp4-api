// api/passes.js — ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ С ИСПРАВЛЕНИЕМ ЛОГИКИ ПРОХОДОВ
import { twoline2satrec } from 'satellite.js';
import { calculatePasses } from 'sat-pass-calculator';
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Используем new URL() для корректного парсинга параметров из Node.js
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { searchParams } = url;
  
  // Получаем параметры из searchParams
  const tle1 = searchParams.get('tle1');
  const tle2 = searchParams.get('tle2');
  const lat = searchParams.get('lat') || '55.7558'; // Default Москва
  const lon = searchParams.get('lon') || '37.6173';
  const min_el = searchParams.get('min_el') || '10'; // Минимальный угол
  const days = searchParams.get('days') || '3'; 
  
  // Проверка обязательных полей
  if (!tle1 || !tle2) {
    return res.status(400).json({ error: 'tle1 и tle2 обязательны' });
  }

  try {
    const satrec = twoline2satrec(tle1.trim(), tle2.trim());
    
    // Начало и конец расчета
    const start = new Date();
    const end = new Date(start.getTime() + Number(days) * 86400000);
    
    // Точка наблюдения
    const observer = {
      latitude: Number(lat),
      longitude: Number(lon),
      altitude: 0 // Высота над уровнем моря
    };

    // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ: ИСПОЛЬЗОВАНИЕ calculatePasses ---
    const rawPasses = calculatePasses({
      satrec,
      observer,
      startTime: start,
      endTime: end,
      minElevation: Number(min_el) // ИСПОЛЬЗУЕМ MIN_EL!
    });
    
    // Форматирование результата
    const passes = rawPasses.map(p => ({
      aos: p.start.time.toISOString(), // Время начала (Acquisition of Signal)
      los: p.end.time.toISOString(),   // Время конца (Loss of Signal)
      maxEl: p.max.elevation,          // Максимальная высота прохода (в градусах)
      time: p.max.time.toISOString(),  // Время максимальной высоты
      duration: Math.round((p.end.time.getTime() - p.start.time.getTime()) / 1000) // Длительность в секундах
    }));

    res.status(200).json({
      success: true,
      location: `${lat}, ${lon}`,
      days: Number(days),
      minElevation: Number(min_el),
      passes_found: passes.length,
      passes: passes.slice(0, 100) // Ограничение на 100 проходов
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Расчёт не удался', 
      details: err.message 
    });
  }
}
