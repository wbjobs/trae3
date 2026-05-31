import { Request, Response } from 'express';
import { alertEngineService } from '../services/alertEngine.js';
import { aggregationService } from '../services/aggregation.js';
import type { ApiResponse } from '../types/index.js';

export const getAlerts = async (req: Request, res: Response) => {
  try {
    const filter = {
      status: req.query.status as string,
      level: req.query.level as string,
      deviceId: req.query.deviceId as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20
    };

    const result = await alertEngineService.getAlerts(filter);

    res.json({
      code: 200,
      message: 'Success',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const handleAlert = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        code: 400,
        message: 'Status is required',
        data: null
      } as ApiResponse);
    }

    await alertEngineService.handleAlert(id, status);
    aggregationService.invalidateOverviewCaches();

    res.json({
      code: 200,
      message: 'Alert handled successfully',
      data: null
    } as ApiResponse);
  } catch (error) {
    console.error('Error handling alert:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getAlertStatistics = async (_req: Request, res: Response) => {
  try {
    const statistics = await alertEngineService.getAlertStatistics();

    res.json({
      code: 200,
      message: 'Success',
      data: statistics
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting alert statistics:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};
