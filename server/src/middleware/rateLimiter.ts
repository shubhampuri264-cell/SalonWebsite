import rateLimit from 'express-rate-limit';

// Applied globally — 100 requests per 15 minutes per IP
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Applied only to POST /api/appointments — 10 booking attempts per hour per IP
export const bookingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts, please try again later.' },
});
