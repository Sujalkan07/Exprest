import { WeatherObservation } from '@exprest/types';

export interface WeatherProvider {
  getCurrent(lat: number, lon: number): Promise<WeatherObservation & { description?: string }>;
  getForecast(lat: number, lon: number): Promise<WeatherObservation & { description?: string }>;
}

export class OpenWeatherAdapter implements WeatherProvider {
  private apiKey = process.env.OPENWEATHER_API_KEY || '';

  async getCurrent(lat: number, lon: number) {
    if (!this.apiKey) {
      return null as any;
    }

    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) return null as any;
      const data = await res.json();
      const hasTemp = typeof data.main?.temp === 'number';
      const hasRain = typeof data.rain?.['1h'] === 'number';

      return {
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
        // Current weather endpoint does not provide precipitation probability; represent honestly
        rainProbabilityPct: hasRain ? 100 : null,
        description: data.weather?.[0]?.description ?? data.weather?.[0]?.main ?? '',
        observedAt: typeof data.dt === 'number' ? new Date(data.dt * 1000).toISOString() : new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`OpenWeather getCurrent error for (${lat}, ${lon}):`, err);
      return null as any;
    }
  }

  async getForecast(lat: number, lon: number) {
    if (!this.apiKey) {
      return null as any;
    }

    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&cnt=1`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) return null as any;
      const data = await res.json();
      const list = data.list?.[0];
      if (!list) return null as any;

      const hasTemp = typeof list.main?.temp === 'number';
      const popPct = typeof list.pop === 'number' ? Math.round(list.pop * 100) : null;

      return {
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
        // Forecast provides actual probability of precipitation (pop 0.0 - 1.0)
        rainProbabilityPct: popPct,
        precipitationChance: popPct,
        description: list.weather?.[0]?.description ?? list.weather?.[0]?.main ?? '',
        observedAt: typeof list.dt === 'number' ? new Date(list.dt * 1000).toISOString() : new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`OpenWeather getForecast error for (${lat}, ${lon}):`, err);
      return null as any;
    }
  }
}
