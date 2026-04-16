import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import { adminAppointmentsRouter } from './appointments';
import { blockedSlotsRouter } from './blockedSlots';
import { adminServicesRouter } from './services';

export const adminRouter = Router();

// All admin routes require a valid JWT AND the owner email.
// requireAuth validates the token; requireAdmin verifies it belongs to the owner.
// This prevents any customer account from accessing admin endpoints.
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

adminRouter.use('/appointments', adminAppointmentsRouter);
adminRouter.use('/blocked-slots', blockedSlotsRouter);
adminRouter.use('/services', adminServicesRouter);
