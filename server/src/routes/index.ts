import { Router } from 'express';
import { stylistsRouter } from './stylists';
import { servicesRouter } from './services';
import { availabilityRouter } from './availability';
import { appointmentsRouter } from './appointments';
import { adminRouter } from './admin/index';

export const router = Router();

router.use('/stylists', stylistsRouter);
router.use('/services', servicesRouter);
router.use('/availability', availabilityRouter);
router.use('/appointments', appointmentsRouter);
router.use('/admin', adminRouter);
