import { WeatherObservation } from '@exprest/types';

export interface WeatherProvider {
  getCurrent(lat: number, lon: number): Promise<WeatherObservation & { description?: string }>;
  getForecast(lat: number, lon: number): Promise<WeatherObservation & { description?: string }>;
}

const WMO_CODE_MAP: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail',
};

interface CacheEntry {
  data: any;
  timestamp: number;
}

const weatherCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class OpenWeatherAdapter implements WeatherProvider {
  private apiKey = process.env.OPENWEATHER_API_KEY || '';

  private getCacheKey(type: 'current' | 'forecast', lat: number, lon: number): string {
    return `${type}:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  }

  async getCurrent(lat: number, lon: number) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) {
      return null as any;
    }

    const cacheKey = this.getCacheKey('current', lat, lon);
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Try OpenWeather if API key is provided
    if (this.apiKey) {
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`,
          { signal: AbortSignal.timeout(8_000) }
        );
        if (res.ok) {
          const data = await res.json();
          const hasTemp = typeof data.main?.temp === 'number';

          const result = {
            latitude: lat,
            longitude: lon,
            temperatureCelsius: hasTemp ? Math.round(data.main.temp) : null,
            temperatureC: hasTemp ? Math.round(data.main.temp) : null,
            tempMaxC: typeof data.main?.temp_max === 'number' ? Math.round(data.main.temp_max) : null,
            tempMinC: typeof data.main?.temp_min === 'number' ? Math.round(data.main.temp_min) : null,
            humidity: data.main?.humidity ?? null,
            humidityPct: data.main?.humidity ?? null,
            windSpeedKph: typeof data.wind?.speed === 'number' ? Math.round(data.wind.speed * 3.6) : null,
            windKph: typeof data.wind?.speed === 'number' ? Math.round(data.wind.speed * 3.6) : null,
            cloudCoverPct: data.clouds?.all ?? null,
            rainProbabilityPct: null,
            description: data.weather?.[0]?.description ?? data.weather?.[0]?.main ?? 'Fair',
            observedAt: typeof data.dt === 'number' ? new Date(data.dt * 1000).toISOString() : new Date().toISOString(),
          };
          weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (err) {
        console.warn(`OpenWeather getCurrent error for (${lat}, ${lon}):`, err);
      }
    }

    // 2. Resilient Open-Meteo fallback (Free, keyless, official European meteorological model)
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const data = await res.json();
        const cur = data.current;
        if (cur && typeof cur.temperature_2m === 'number') {
          const code = cur.weather_code ?? 0;
          const desc = WMO_CODE_MAP[code] || 'Fair';
          const hourlyProbs = data.hourly?.precipitation_probability;
          const currentHour = new Date().getUTCHours();
          const rainProb = Array.isArray(hourlyProbs) && typeof hourlyProbs[currentHour] === 'number'
            ? hourlyProbs[currentHour]
            : null;

          const result = {
            latitude: lat,
            longitude: lon,
            temperatureCelsius: Math.round(cur.temperature_2m),
            temperatureC: Math.round(cur.temperature_2m),
            tempMaxC: Math.round(cur.temperature_2m + 2),
            tempMinC: Math.round(cur.temperature_2m - 2),
            humidity: cur.relative_humidity_2m ?? null,
            humidityPct: cur.relative_humidity_2m ?? null,
            windSpeedKph: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
            windKph: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
            cloudCoverPct: code > 2 ? 75 : code > 0 ? 30 : 0,
            rainProbabilityPct: rainProb,
            description: desc,
            observedAt: new Date().toISOString(),
          };
          weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      }
    } catch (err) {
      console.warn(`Open-Meteo getCurrent error for (${lat}, ${lon}):`, err);
    }

    return null as any;
  }

  async getForecast(lat: number, lon: number) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) {
      return null as any;
    }

    const cacheKey = this.getCacheKey('forecast', lat, lon);
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Try OpenWeather if API key is configured
    if (this.apiKey) {
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&cnt=1`,
          { signal: AbortSignal.timeout(8_000) }
        );
        if (res.ok) {
          const data = await res.json();
          const list = data.list?.[0];
          if (list) {
            const hasTemp = typeof list.main?.temp === 'number';
            const popPct = typeof list.pop === 'number' ? Math.round(list.pop * 100) : null;

            const result = {
              latitude: lat,
              longitude: lon,
              temperatureCelsius: hasTemp ? Math.round(list.main.temp) : null,
              temperatureC: hasTemp ? Math.round(list.main.temp) : null,
              tempMaxC: typeof list.main?.temp_max === 'number' ? Math.round(list.main.temp_max) : null,
              tempMinC: typeof list.main?.temp_min === 'number' ? Math.round(list.main.temp_min) : null,
              humidity: list.main?.humidity ?? null,
              humidityPct: list.main?.humidity ?? null,
              windSpeedKph: typeof list.wind?.speed === 'number' ? Math.round(list.wind.speed * 3.6) : null,
              windKph: typeof list.wind?.speed === 'number' ? Math.round(list.wind.speed * 3.6) : null,
              cloudCoverPct: list.clouds?.all ?? null,
              rainProbabilityPct: popPct,
              precipitationChance: popPct,
              description: list.weather?.[0]?.description ?? list.weather?.[0]?.main ?? 'Fair',
              observedAt: typeof list.dt === 'number' ? new Date(list.dt * 1000).toISOString() : new Date().toISOString(),
            };
            weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
          }
        }
      } catch (err) {
        console.warn(`OpenWeather getForecast error for (${lat}, ${lon}):`, err);
      }
    }

    // 2. Resilient Open-Meteo fallback
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m&forecast_days=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const data = await res.json();
        const hourly = data.hourly;
        if (hourly && Array.isArray(hourly.temperature_2m) && hourly.temperature_2m.length > 0) {
          // Look 3 hours ahead for forecast
          const futureHour = Math.min(hourly.temperature_2m.length - 1, (new Date().getUTCHours() + 3) % 24);
          const temp = hourly.temperature_2m[futureHour];
          const code = hourly.weather_code?.[futureHour] ?? 0;
          const desc = WMO_CODE_MAP[code] || 'Fair';
          const pop = hourly.precipitation_probability?.[futureHour] ?? null;

          const result = {
            latitude: lat,
            longitude: lon,
            temperatureCelsius: Math.round(temp),
            temperatureC: Math.round(temp),
            tempMaxC: Math.round(temp + 2),
            tempMinC: Math.round(temp - 2),
            humidity: hourly.relative_humidity_2m?.[futureHour] ?? null,
            humidityPct: hourly.relative_humidity_2m?.[futureHour] ?? null,
            windSpeedKph: typeof hourly.wind_speed_10m?.[futureHour] === 'number' ? Math.round(hourly.wind_speed_10m[futureHour]) : null,
            windKph: typeof hourly.wind_speed_10m?.[futureHour] === 'number' ? Math.round(hourly.wind_speed_10m[futureHour]) : null,
            cloudCoverPct: code > 2 ? 75 : code > 0 ? 30 : 0,
            rainProbabilityPct: pop,
            precipitationChance: pop,
            description: desc,
            observedAt: new Date().toISOString(),
          };
          weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      }
    } catch (err) {
      console.warn(`Open-Meteo getForecast error for (${lat}, ${lon}):`, err);
    }

    return null as any;
  }
}
