import { Router, type Request, type Response } from 'express';
import * as notificationService from '../services/notification.service.js';
import * as sampleRepo from '../repositories/sample.repository.js';
import { generateCSV } from '../services/notification.service.js';

const router = Router();

router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.query.userId as string) || 'u003';
    const includeRead = req.query.includeRead === 'true';
    const notifications = await notificationService.getNotifications(userId, includeRead);
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

router.get('/notifications/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.query.userId as string) || 'u003';
    const count = await notificationService.getUnreadCount(userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Fetch unread count error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
});

router.post('/notifications/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    await notificationService.markNotificationAsRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

router.get('/export/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const samples = await sampleRepo.findAllForExport({ status, startDate, endDate });
    const csv = generateCSV(samples);

    const filename = `样品流转报表_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csv);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ success: false, error: 'Failed to export CSV' });
  }
});

router.get('/reminders/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const samples = await notificationService.getPendingReminderSamples();
    res.json({ success: true, data: samples });
  } catch (error) {
    console.error('Fetch pending reminders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending reminders' });
  }
});

router.post('/reminders/trigger', async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await notificationService.sendPendingApprovalReminders();
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Trigger reminders error:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger reminders' });
  }
});

export default router;
