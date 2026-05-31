import { Request, Response } from 'express';
import { deviceService } from '../services/deviceService.js';
import type { ApiResponse } from '../types/index.js';

export const getDevices = async (req: Request, res: Response) => {
  try {
    const filter = {
      status: req.query.status as string,
      areaId: req.query.areaId as string,
      keyword: req.query.keyword as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20
    };

    const result = await deviceService.getDevices(filter);

    res.json({
      code: 200,
      message: 'Success',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getDeviceDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const device = await deviceService.getDeviceDetail(id);

    if (!device) {
      return res.status(404).json({
        code: 404,
        message: 'Device not found',
        data: null
      } as ApiResponse);
    }

    res.json({
      code: 200,
      message: 'Success',
      data: device
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting device detail:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const createDevice = async (req: Request, res: Response) => {
  try {
    const { serialNumber, model, areaId } = req.body;

    if (!serialNumber || !model) {
      return res.status(400).json({
        code: 400,
        message: 'Serial number and model are required',
        data: null
      } as ApiResponse);
    }

    const device = await deviceService.createDevice({ serialNumber, model, areaId });

    res.json({
      code: 200,
      message: 'Device created successfully',
      data: device
    } as ApiResponse);
  } catch (error) {
    console.error('Error creating device:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const updateDevice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, areaId } = req.body;

    const device = await deviceService.updateDevice(id, { status, areaId });

    res.json({
      code: 200,
      message: 'Device updated successfully',
      data: device
    } as ApiResponse);
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const deleteDevice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deviceService.deleteDevice(id);

    res.json({
      code: 200,
      message: 'Device deleted successfully',
      data: null
    } as ApiResponse);
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const getAreas = async (_req: Request, res: Response) => {
  try {
    const areas = await deviceService.getAreas();

    res.json({
      code: 200,
      message: 'Success',
      data: areas
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting areas:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};

export const initializeMockData = async (_req: Request, res: Response) => {
  try {
    await deviceService.initializeMockData();

    res.json({
      code: 200,
      message: 'Mock data initialized successfully',
      data: null
    } as ApiResponse);
  } catch (error) {
    console.error('Error initializing mock data:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
      data: null
    } as ApiResponse);
  }
};
