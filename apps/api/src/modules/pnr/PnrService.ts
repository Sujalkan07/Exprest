import { RailRadarAdapter } from '../../providers/railradar/RailRadarAdapter.js';
import { AppError } from '../../common/errors/AppError.js';
import { PnrStatusResult } from '@exprest/types';

export class PnrService {
  constructor(private railRadar = new RailRadarAdapter()) {}

  async getPnrStatus(rawPnr: string): Promise<PnrStatusResult> {
    if (!rawPnr || typeof rawPnr !== 'string') {
      throw new AppError('INVALID_PNR', 'PNR number is required.', 400);
    }

    // Normalize: strip whitespace, hyphens, and any non-numeric characters
    const normalized = rawPnr.replace(/[\s\-\.]/g, '');

    // Validate that the normalized string is exactly 10 digits
    if (!/^\d{10}$/.test(normalized)) {
      throw new AppError(
        'INVALID_PNR',
        'Invalid PNR format. PNR must be exactly 10 numeric digits.',
        400
      );
    }

    return this.railRadar.getPnrStatus(normalized);
  }

  async getTrainFare(
    trainNumber: string,
    fromStation: string,
    toStation: string,
    journeyDate?: string,
    classCode?: string,
    quota?: string
  ): Promise<any> {
    if (!trainNumber || typeof trainNumber !== 'string') {
      throw new AppError('INVALID_QUERY', 'Train number is required for fare calculation.', 400);
    }
    return this.railRadar.getTrainFare(trainNumber, fromStation, toStation, journeyDate, classCode, quota);
  }
}
