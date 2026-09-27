import { RailRadarAdapter } from '../../providers/railradar/RailRadarAdapter.js';
import { AppError } from '../../common/errors/AppError.js';

export class TrainService {
  private railRadar = new RailRadarAdapter();

  async searchTrains(query: string) {
    if (!query || query.trim().length === 0) {
      throw new AppError('INVALID_QUERY', 'Search query cannot be empty.', 400);
    }
    return this.railRadar.search(query);
  }
}
