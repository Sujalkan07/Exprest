import { WeatherObservation } from '@exprest/types';

export interface WeatherProvider {
  getCurrent(lat: number, lon: number): Promise<WeatherObservation & { description?: string }>;
  getForecast(lat: number, lon: number): Promise<WeatherObservation & { description?: string }>;
}

export class OpenWeatherAdapter implements WeatherProvider {
  private apiKey = process.env.OPENWEATHER_API_KEY!;

  async getCurrent(lat: number, lon: number) {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`
    );
    if (!res.ok) throw new Error(`OpenWeather current failed: ${res.status}`);
    const data = await res.json();
    return {
      latitude: lat,
      longitude: lon,
      temperatureCelsius: Math.round(data.main?.temp ?? 0),
      temperatureC: Math.round(data.main?.temp ?? 0),
      humidity: data.main?.humidity ?? 0,
      humidityPct: data.main?.humidity ?? 0,
      windSpeedKph: Math.round((data.wind?.speed ?? 0) * 3.6),
      windKph: Math.round((data.wind?.speed ?? 0) * 3.6),
      rainProbabilityPct: data.clouds?.all ?? 0,
      description: data.weather?.[0]?.description ?? '',
      observedAt: new Date().toISOString(),
    };
  }

  async getForecast(lat: number, lon: number) {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&cnt=1`
    );
    if (!res.ok) throw new Error(`OpenWeather forecast failed: ${res.status}`);
    const data = await res.json();
    const list = data.list?.[0];
    return {
      latitude: lat,
      longitude: lon,
      temperatureCelsius: Math.round(list?.main?.temp ?? 0),
      temperatureC: Math.round(list?.main?.temp ?? 0),
      humidity: list?.main?.humidity ?? 0,
      humidityPct: list?.main?.humidity ?? 0,
      windSpeedKph: Math.round((list?.wind?.speed ?? 0) * 3.6),
      windKph: Math.round((list?.wind?.speed ?? 0) * 3.6),
      rainProbabilityPct: Math.round((list?.pop ?? 0) * 100),
      precipitationChance: Math.round((list?.pop ?? 0) * 100),
      description: list?.weather?.[0]?.description ?? '',
      observedAt: new Date().toISOString(),
    };
  }
}
