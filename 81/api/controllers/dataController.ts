import { Request, Response } from 'express';
import { dataReceiverService } from '../services/dataReceiver.js';
import { aggregationService } from '../services/aggregation.js';
import { alertEngineService } from '../services/alertEngine.js';
import type { MeterDataRequest, BatchMeterDataRequest, ApiResponse } from '../types/index.js';

export const receiveMeterData = async (req: Request, res: Response) => {
  try {
    const data: MeterDataRequest = req.body;

    const isValid = await dataReceiverService.validateData(data);
    if (!isValid) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid data format',
        data: null
      } as ApiResponse);
    }

    const result = await dataReceiverService.receiveMeterData(data);

    if (!result.isDuplicate) {
      await alertEngineService.checkAndCreateAlerts(data);
      aggregationService.invalidateOverviewCaches();
    }

    res.json({
      code: 200,
      message: result.isDuplicate ? 'Duplicate data skipped' : 'Data received successfully',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Error receiving meter data:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const receiveBatchMeterData = async (req: Request, res: Response) => {
  try {
    const batchData: BatchMeterDataRequest = req.body;

    if (!batchData.data || !Array.isArray(batchData.data)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid batch data format',
        data: null
      } as ApiResponse);
    }

    const result = await dataReceiverService.receiveBatchMeterData(batchData);

    if (result.processed > 0) {
      for (const data of batchData.data) {
        try {
          await alertEngineService.checkAndCreateAlerts(data);
        } catch (e) {
          console.error('Error checking alerts for device:', data.deviceId, e);
        }
      }
      aggregationService.invalidateOverviewCaches();
    }

    res.json({
      code: result.success ? 200 : 207,
      message: result.success ? 'Batch data received successfully' : 'Partial success',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Error receiving batch meter data:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getDashboardOverview = async (_req: Request, res: Response) => {
  try {
    const overview = await aggregationService.getDashboardOverview();

    res.json({
      code: 200,
      message: 'Success',
      data: overview
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting dashboard overview:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getHistoricalData = async (req: Request, res: Response) => {
  try {
    const filter = {
      deviceId: req.query.deviceId as string,
      startTime: req.query.startTime ? parseInt(req.query.startTime as string) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime as string) : undefined,
      areaId: req.query.areaId as string
    };

    const data = await aggregationService.getHistoricalData(filter);

    res.json({
      code: 200,
      message: 'Success',
      data
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting historical data:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getHourlyConsumption = async (_req: Request, res: Response) => {
  try {
    const data = await aggregationService.getHourlyConsumption();

    res.json({
      code: 200,
      message: 'Success',
      data
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting hourly consumption:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getConsumptionStats = async (req: Request, res: Response) => {
  try {
    const filter = {
      deviceId: req.query.deviceId as string,
      areaId: req.query.areaId as string
    };

    const data = await aggregationService.getConsumptionStats(filter);

    res.json({
      code: 200,
      message: 'Success',
      data
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting consumption stats:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getTrendReplay = async (req: Request, res: Response) => {
  try {
    const { deviceId, areaId, startTime, endTime, granularity } = req.query;

    if (!startTime || !endTime || !granularity) {
      return res.status(400).json({
        code: 400,
        message: 'Missing required parameters: startTime, endTime, granularity',
        data: null
      } as ApiResponse);
    }

    const validGranularities = ['1h', '6h', '12h', '1d', '1w'];
    if (!validGranularities.includes(granularity as string)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid granularity. Must be one of: 1h, 6h, 12h, 1d, 1w',
        data: null
      } as ApiResponse);
    }

    const data = await aggregationService.getTrendReplay({
      deviceId: deviceId as string,
      areaId: areaId as string,
      startTime: parseInt(startTime as string),
      endTime: parseInt(endTime as string),
      granularity: granularity as '1h' | '6h' | '12h' | '1d' | '1w'
    });

    res.json({
      code: 200,
      message: 'Success',
      data
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting trend replay:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};
