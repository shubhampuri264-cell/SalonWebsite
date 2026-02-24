import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { adminAppointmentsRouter } from './appointments';
import { blockedSlotsRouter } from './blockedSlots';

export const adminRouter = Router();

// All admin routes require authentication
adminRouter.use(requireAuth);

adminRouter.use('/appointments', adminAppointmentsRouter);
adminRouter.use('/blocked-slots', blockedSlotsRouter);
