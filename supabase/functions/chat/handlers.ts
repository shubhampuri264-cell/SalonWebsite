// Intent handlers — where things actually happen.
//
// This file is the feature surface. A menu tap and a free-text message both
// arrive here as a validated intent plus validated params, and from this point
// on they are indistinguishable. That is why Iris keeps booking, cancelling and
// rescheduling when Anthropic is unreachable: the model was never in this path,
// it only chose which door to knock on.
//
// EVERY NUMBER A CUSTOMER SEES IS RENDERED HERE, from a database row or from an
// API response — never from model output. Prices come from `services`, times
// from `/api/availability`, dates from the calendar. That separation is the
// whole answer to Moffatt v. Air Canada: there is no code path by which a
// hallucinated figure reaches the screen.

import {
  CATEGORY_LABELS,
  type CatalogService,
  type CatalogStylist,
  eligibleStylists,
  fetchLivePromotions,
  priceLabel,
  stylistCanDo,
  type StylistServiceMap,
} from './catalog.ts';
import {
  BOOKING_HORIZON_DAYS,
  formatDateChip,
  formatDateLabel,
  formatTimeLabel,
  isBookableDate,
  nextBookableDates,
  salonToday,
} from './dates.ts';
import type { IntentId, NodeId } from './intents.ts';
import { CATEGORIES } from './intents.ts';
import { consumePending, createPending, type Session } from './session.ts';
import { SALON_PHONE } from './safety.ts';
import * as api from './vercel.ts';

// --- wire contract ----------------------------------------------------------
//
// Mirrored by client/src/api/chat.ts. Everything here is plain data: the widget
// renders text as text and never as HTML or markdown, so nothing that arrives
// in a reply can become markup (OWASP LLM05).

export interface Chip {
  label: string;
  intent: IntentId;
  params?: Record<string, unknown>;
  style?: 'primary' | 'ghost';
}

export type Card =
  | {
    type: 'service';
    id: string;
    name: string;
    description: string | null;
    priceLabel: string;
    durationMin: number;
    bookable: boolean;
  }
  | { type: 'promotion'; title: string; offerText: string; description: string | null }
  | { type: 'hours'; rows: Array<{ day: string; hours: string }>; address: string; phone: string }
  | {
    type: 'appointment';
    id: string;
    serviceId: string;
    serviceName: string;
    stylistName: string;
    dateLabel: string;
    timeLabel: string;
    status: string;
    canManage: boolean;
  }
  | { type: 'contactForm'; mode: 'booking' | 'message' }
  | {
    type: 'confirm';
    pendingId: string;
    serviceName: string;
    stylistName: string;
    dateLabel: string;
    timeLabel: string;
    priceLabel: string;
    durationMin: number;
  }
  | {
    type: 'booked';
    serviceName: string;
    stylistName: string;
    dateLabel: string;
    timeLabel: string;
  }
  | { type: 'signIn' };

export interface HandlerResult {
  reply: string;
  cards: Card[];
  chips: Chip[];
  node: NodeId;
}

export interface HandlerContext {
  session: Session;
  params: Record<string, unknown>;
  clientIp: string;
  customerToken?: string;
  services: CatalogService[];
  stylists: CatalogStylist[];
  /** service id -> stylist ids. See migration 018. */
  stylistServices: StylistServiceMap;
  /** Non-empty when the model wrote a sentence worth showing above the cards. */
  modelReply?: string;
}

const SALON_ADDRESS = '39-46 Queens Blvd, Sunnyside, NY 11104';

// --- chip sets --------------------------------------------------------------

const ESCAPE_CHIPS: Chip[] = [
  { label: 'Start over', intent: 'root', style: 'ghost' },
  { label: `Call ${SALON_PHONE}`, intent: 'escalate', style: 'ghost' },
];

function rootChips(): Chip[] {
  return [
    { label: 'Book an appointment', intent: 'book_start', style: 'primary' },
    { label: 'My appointments', intent: 'my_appointments' },
    { label: 'Prices', intent: 'prices' },
    { label: 'Current offers', intent: 'promotions' },
    { label: 'Hours & location', intent: 'hours' },
  ];
}

function categoryChips(services: CatalogService[]): Chip[] {
  // Only categories that actually have an active service. An empty category
  // chip leads to a dead end, which is the single most common way a booking bot
  // loses someone.
  const present = CATEGORIES.filter((c) => services.some((s) => s.category === c));
  return present.map((category) => ({
    label: CATEGORY_LABELS[category] ?? category,
    intent: 'pick_category' as IntentId,
    params: { category },
  }));
}

/**
 * The other categories, named.
 *
 * A single generic "Different category" chip tested badly for a real reason:
 * someone who asks for "a haircut and my eyebrows done" gets one category — the
 * model picks one intent per turn — and then has to guess that eyebrows live
 * behind an unlabelled button, two taps away. Naming them puts the second half
 * of the request one tap away with no model call at all.
 */
function otherCategoryChips(
  services: CatalogService[],
  exclude: string,
  // 'pick_category' continues the booking funnel; 'prices' stays on the price
  // screen. Passing the wrong one turns "what does threading cost?" into a
  // half-started booking, which is how a browser becomes an abandoned draft.
  intent: IntentId = 'pick_category',
): Chip[] {
  return categoryChips(services)
    .filter((chip) => (chip.params as { category?: string } | undefined)?.category !== exclude)
    .map((chip) => ({ ...chip, intent, style: 'ghost' as const }));
}

function withEscapes(chips: Chip[]): Chip[] {
  return [...chips, ...ESCAPE_CHIPS];
}

/**
 * Chips for wherever the customer already is, with NO side effects.
 *
 * Used by every path that shows a message instead of running a handler — the
 * pre-filter refusal, the off-topic reply, the "I didn't catch that" fallback.
 * Those all need something tappable underneath, and calling handle('root') to
 * get it would silently wipe a half-finished booking: someone four steps into
 * choosing a balayage who asks one off-topic question must not lose their draft
 * as a side effect of being told no.
 *
 * This is also what stops the composer ever being an empty box. There is always
 * something to tap, and what there is matches the step they are on.
 */
export function chipsForNode(
  node: NodeId,
  session: Session,
  services: CatalogService[],
  stylists: CatalogStylist[],
  stylistServices: StylistServiceMap,
): Chip[] {
  const { draft } = session;

  switch (node) {
    case 'category':
      return withEscapes(categoryChips(services));

    case 'service':
      return withEscapes(
        draft.category
          ? services
            .filter((s) => s.category === draft.category)
            .map((s) => ({
              label: `${s.name} · ${priceLabel(s)}`,
              intent: 'pick_service' as IntentId,
              params: { service_id: s.id },
            }))
          : categoryChips(services),
      );

    case 'stylist': {
      // Only the stylists who perform the drafted service. There is no "anyone
      // available" chip any more: it assigned whoever was free regardless of
      // whether they do the service.
      const service = findService(services, draft.serviceId);
      return withEscapes([
        ...(service ? stylistChips(stylists, stylistServices, service.id) : []),
        { label: 'Different service', intent: 'book_start', style: 'ghost' },
      ]);
    }

    case 'date':
    case 'reschedule_date':
      return withEscapes(
        nextBookableDates(6).map((date) => ({
          label: formatDateChip(date),
          intent: 'pick_date' as IntentId,
          params: { date },
        })),
      );

    case 'time':
    case 'reschedule_time':
      return withEscapes(
        draft.date
          ? [{ label: 'See times again', intent: 'pick_date' as IntentId, params: { date: draft.date }, style: 'primary' as const }]
          : [{ label: 'Pick a day', intent: 'book_start' as IntentId }],
      );

    case 'contact':
    case 'confirm':
      return withEscapes(
        draft.date
          ? [{ label: 'Change the time', intent: 'pick_date' as IntentId, params: { date: draft.date }, style: 'ghost' as const }]
          : [],
      );

    case 'appointments':
      return withEscapes([{ label: 'Book something else', intent: 'book_start' }]);

    case 'prices':
      return withEscapes([
        { label: 'Other prices', intent: 'prices' },
        { label: 'Book an appointment', intent: 'book_start', style: 'primary' },
      ]);

    case 'promotions':
    case 'hours':
    case 'booked':
      return withEscapes([{ label: 'Book an appointment', intent: 'book_start', style: 'primary' }]);

    case 'escalate':
      return [{ label: 'Start over', intent: 'root', style: 'ghost' }];

    default:
      return rootChips();
  }
}

// --- helpers ----------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function findService(services: CatalogService[], id: unknown): CatalogService | null {
  return services.find((s) => s.id === id) ?? null;
}

function stylistName(stylists: CatalogStylist[], id: string): string {
  return stylists.find((s) => s.id === id)?.name ?? 'Your stylist';
}

/** One chip per stylist who performs this service. */
function stylistChips(
  stylists: CatalogStylist[],
  map: StylistServiceMap,
  serviceId: string,
): Chip[] {
  return eligibleStylists(stylists, map, serviceId).map((s) => ({
    label: s.name,
    intent: 'pick_stylist' as IntentId,
    params: { stylist_id: s.id },
  }));
}

function serviceCard(service: CatalogService, bookable = true): Card {
  return {
    type: 'service',
    id: service.id,
    name: service.name,
    description: service.description,
    priceLabel: priceLabel(service),
    durationMin: service.duration_min,
    bookable,
  };
}

/** Every reply that cannot proceed still names a way forward. */
function deadEnd(reply: string, node: NodeId = 'root'): HandlerResult {
  return {
    reply,
    cards: [],
    chips: withEscapes([
      { label: 'Book an appointment', intent: 'book_start' },
      { label: 'Message the salon', intent: 'escalate' },
    ]),
    node,
  };
}

// --- handlers ---------------------------------------------------------------

// Async even though several branches are synchronous: one uniform signature
// means the caller never has to know which intents touch the network.
// deno-lint-ignore require-await
export async function handle(intent: IntentId, ctx: HandlerContext): Promise<HandlerResult> {
  switch (intent) {
    case 'root':
    case 'back':
      return handleRoot(ctx);
    case 'book_start':
      return handleBookStart(ctx);
    case 'pick_category':
      return handlePickCategory(ctx);
    case 'pick_service':
      return handlePickService(ctx);
    case 'pick_stylist':
      return handlePickStylist(ctx);
    case 'pick_date':
      return handlePickDate(ctx);
    case 'pick_time':
      return handlePickTime(ctx);
    case 'submit_contact':
      return handleSubmitContact(ctx);
    case 'confirm_booking':
      return handleConfirmBooking(ctx);
    case 'my_appointments':
      return handleMyAppointments(ctx);
    case 'cancel_appointment':
      return handleCancelAppointment(ctx);
    case 'reschedule_start':
      return handleRescheduleStart(ctx);
    case 'reschedule_confirm':
      return handleRescheduleConfirm(ctx);
    case 'prices':
      return handlePrices(ctx);
    case 'service_info':
      return handleServiceInfo(ctx);
    case 'promotions':
      return handlePromotions(ctx);
    case 'hours':
      return handleHours(ctx);
    case 'escalate':
      return handleEscalate(ctx);
    case 'contact_salon':
      return handleContactSalon(ctx);
  }
}

function handleRoot(ctx: HandlerContext): HandlerResult {
  ctx.session.draft = {};
  return {
    reply: ctx.modelReply ||
      "I'm Iris. I can book you in, look up your appointments, or check prices, offers and hours.",
    cards: [],
    chips: rootChips(),
    node: 'root',
  };
}

function handleBookStart(ctx: HandlerContext): HandlerResult {
  ctx.session.draft = {};
  return {
    reply: ctx.modelReply || 'What are you booking in for?',
    cards: [],
    chips: withEscapes(categoryChips(ctx.services)),
    node: 'category',
  };
}

function handlePickCategory(ctx: HandlerContext): HandlerResult {
  const category = String(ctx.params.category);
  const matching = ctx.services.filter((s) => s.category === category);

  if (matching.length === 0) {
    return deadEnd("I don't have anything listed under that at the moment.");
  }

  ctx.session.draft = { category };
  return {
    reply: ctx.modelReply || 'Which one would you like?',
    cards: [],
    chips: withEscapes([
      // Price in the label, straight from the row — grounded, and it saves a
      // round trip to the price screen mid-booking.
      ...matching.map((s) => ({
        label: `${s.name} · ${priceLabel(s)}`,
        intent: 'pick_service' as IntentId,
        params: { service_id: s.id },
      })),
      ...otherCategoryChips(ctx.services, category),
    ]),
    node: 'service',
  };
}

function handlePickService(ctx: HandlerContext): HandlerResult {
  const service = findService(ctx.services, ctx.params.service_id);
  if (!service) {
    return deadEnd("I couldn't find that service. Here's what we offer.");
  }

  ctx.session.draft = {
    ...ctx.session.draft,
    category: service.category,
    serviceId: service.id,
    serviceName: service.name,
    durationMin: service.duration_min,
    priceLabel: priceLabel(service),
    // A new service invalidates whoever was drafted for the old one.
    stylistId: undefined,
    stylistName: undefined,
  };

  const eligible = eligibleStylists(ctx.stylists, ctx.stylistServices, service.id);

  if (eligible.length === 0) {
    return deadEnd(
      `${service.name} isn't bookable through me at the moment. Call us on ${SALON_PHONE} and we'll sort it out.`,
    );
  }

  // One stylist means the question has one answer, so asking it is friction.
  // Assign and move on to dates.
  if (eligible.length === 1) {
    return assignStylist(ctx, service, eligible[0], [serviceCard(service, false)]);
  }

  return {
    reply: ctx.modelReply || 'Who would you like to see?',
    cards: [serviceCard(service, false)],
    chips: withEscapes(stylistChips(ctx.stylists, ctx.stylistServices, service.id)),
    node: 'stylist',
  };
}

function handlePickStylist(ctx: HandlerContext): HandlerResult {
  const { draft } = ctx.session;
  if (!draft.serviceId) {
    return handleBookStart({ ...ctx, modelReply: 'Let me get the service first — what are you booking in for?' });
  }

  const service = findService(ctx.services, draft.serviceId);
  if (!service) {
    return handleBookStart({ ...ctx, modelReply: "That service isn't on the menu any more — what else can I book you in for?" });
  }

  const id = String(ctx.params.stylist_id);
  const stylist = ctx.stylists.find((s) => s.id === id) ?? null;

  // The model can name a stylist from free text, and a stale widget can send an
  // old chip, so the pairing is checked here rather than trusted. The booking
  // API checks it again; this exists so the customer is corrected now instead of
  // three questions later at the confirm step.
  if (!stylist || !stylistCanDo(ctx.stylistServices, stylist.id, service.id)) {
    const who = stylist ? `${stylist.name} doesn't do ${service.name}` : "I couldn't find that stylist";
    return {
      reply: `${who}. Here's who can.`,
      cards: [],
      chips: withEscapes([
        ...stylistChips(ctx.stylists, ctx.stylistServices, service.id),
        { label: 'Different service', intent: 'book_start', style: 'ghost' as const },
      ]),
      node: 'stylist',
    };
  }

  return assignStylist(ctx, service, stylist, []);
}

/** Records the chosen stylist on the draft and asks for a day. */
function assignStylist(
  ctx: HandlerContext,
  service: CatalogService,
  stylist: CatalogStylist,
  cards: Card[],
): HandlerResult {
  ctx.session.draft = {
    ...ctx.session.draft,
    stylistId: stylist.id,
    stylistName: stylist.name,
  };

  // Offering "different stylist" only makes sense when there is another one who
  // does this service.
  const hasAlternative = eligibleStylists(ctx.stylists, ctx.stylistServices, service.id).length > 1;

  return {
    reply: ctx.modelReply || `Which day suits you? You'll be with ${stylist.name}.`,
    cards,
    chips: withEscapes([
      ...nextBookableDates(6).map((date) => ({
        label: formatDateChip(date),
        intent: 'pick_date' as IntentId,
        params: { date },
      })),
      hasAlternative
        ? { label: 'Different stylist', intent: 'pick_service' as IntentId, params: { service_id: service.id }, style: 'ghost' as const }
        : { label: 'Different service', intent: 'book_start' as IntentId, style: 'ghost' as const },
    ]),
    node: 'date',
  };
}

async function handlePickDate(ctx: HandlerContext): Promise<HandlerResult> {
  const { draft } = ctx.session;
  const date = String(ctx.params.date);

  // Rescheduling reuses this handler, so a missing service means the funnel was
  // entered sideways rather than that anything is broken.
  //
  // The stylist has to be a real id, not just present: a session that was
  // already open when stylist eligibility shipped can still be carrying the old
  // 'anyone' draft, and /api/availability now rejects it. Restarting the funnel
  // is a better answer than a dead end saying times could not be loaded.
  if (!draft.serviceId || !draft.stylistId || !UUID_RE.test(draft.stylistId)) {
    return handleBookStart({ ...ctx, modelReply: "Let's start from the top — what are you booking in for?" });
  }

  if (!isBookableDate(date)) {
    return {
      reply: `We can book up to ${BOOKING_HORIZON_DAYS} days ahead. Pick another day and I'll check what's free.`,
      cards: [],
      chips: withEscapes(
        nextBookableDates(6).map((d) => ({
          label: formatDateChip(d),
          intent: 'pick_date' as IntentId,
          params: { date: d },
        })),
      ),
      node: 'date',
    };
  }

  const result = await api.getAvailability({
    date,
    serviceId: draft.serviceId,
    stylistId: draft.stylistId,
    clientIp: ctx.clientIp,
  });

  if (!result.ok || !result.data) {
    // A mismatch is permanent for this pairing, so "try another day" would send
    // the customer round a loop that cannot end. Every other failure here really
    // is transient.
    if (result.code === 'STYLIST_SERVICE_MISMATCH') {
      return deadEnd(
        `${draft.stylistName ?? 'That stylist'} doesn't offer ${draft.serviceName ?? 'that service'}, so I can't find times with them. Start a new booking and I'll show you who does.`,
        'date',
      );
    }
    return deadEnd(
      `I couldn't load times just then. Try another day, or call us on ${SALON_PHONE}.`,
      'date',
    );
  }

  const slots = result.data.slots ?? [];
  if (slots.length === 0) {
    return {
      reply: result.data.message
        ? `${result.data.message} Try one of these instead.`
        : `Nothing free on ${formatDateLabel(date)}. Try another day.`,
      cards: [],
      chips: withEscapes(
        nextBookableDates(6)
          .filter((d) => d !== date)
          .map((d) => ({ label: formatDateChip(d), intent: 'pick_date' as IntentId, params: { date: d } })),
      ),
      node: 'date',
    };
  }

  ctx.session.draft = { ...draft, date, time: undefined };

  // Capped so the chip row stays usable. The cap is disclosed rather than
  // silent — "and more" is the difference between a short list and a lie.
  const shown = slots.slice(0, 12);
  const more = slots.length - shown.length;

  return {
    reply: ctx.modelReply ||
      `Here's what's free on ${formatDateLabel(date)}${more > 0 ? ` — the first ${shown.length} of ${slots.length}` : ''}.`,
    cards: [],
    chips: withEscapes([
      ...shown.map((slot) => ({
        label: formatTimeLabel(slot.time),
        intent: 'pick_time' as IntentId,
        params: { time: slot.time },
      })),
      { label: 'Different day', intent: 'pick_stylist', params: { stylist_id: draft.stylistId }, style: 'ghost' as const },
    ]),
    node: 'time',
  };
}

function handlePickTime(ctx: HandlerContext): HandlerResult {
  const { draft } = ctx.session;
  if (!draft.serviceId || !draft.date) {
    return handleBookStart({ ...ctx, modelReply: "Let's start again — what are you booking in for?" });
  }

  const time = String(ctx.params.time);
  ctx.session.draft = { ...draft, time };

  // Rescheduling skips the contact form: we already have the customer, and
  // asking a signed-in person to retype their details would be absurd.
  if (draft.rescheduleId) {
    return {
      reply: `Move it to ${formatDateLabel(draft.date)} at ${formatTimeLabel(time)}?`,
      cards: [],
      chips: withEscapes([
        {
          label: 'Yes, move it',
          intent: 'reschedule_confirm',
          params: { appointment_id: draft.rescheduleId, date: draft.date, time },
          style: 'primary',
        },
        { label: 'Pick another time', intent: 'pick_date', params: { date: draft.date }, style: 'ghost' },
      ]),
      node: 'reschedule_time',
    };
  }

  return {
    reply: ctx.modelReply || 'Last step — how can the salon reach you?',
    cards: [{ type: 'contactForm', mode: 'booking' }],
    chips: withEscapes([
      { label: 'Different time', intent: 'pick_date', params: { date: draft.date }, style: 'ghost' },
    ]),
    node: 'contact',
  };
}

async function handleSubmitContact(ctx: HandlerContext): Promise<HandlerResult> {
  const { draft } = ctx.session;
  const service = findService(ctx.services, draft.serviceId);

  if (!service || !draft.stylistId || !draft.date || !draft.time) {
    return handleBookStart({ ...ctx, modelReply: "Something went missing there — let's start again." });
  }

  const pendingId = crypto.randomUUID();
  const stored = await createPending(pendingId, {
    serviceId: service.id,
    serviceName: service.name,
    stylistId: draft.stylistId,
    stylistName: draft.stylistName ?? stylistName(ctx.stylists, draft.stylistId),
    date: draft.date,
    time: draft.time,
    priceLabel: priceLabel(service),
    durationMin: service.duration_min,
    clientName: String(ctx.params.client_name),
    clientEmail: String(ctx.params.client_email),
    clientPhone: String(ctx.params.client_phone),
    notes: ctx.params.notes ? String(ctx.params.notes) : undefined,
    marketingConsent: ctx.params.marketing_consent === true,
  });

  if (!stored) {
    return deadEnd(
      `I couldn't hold that booking just now. Please try again, or call us on ${SALON_PHONE}.`,
      'contact',
    );
  }

  return {
    reply: 'Here are the details — have a check, then confirm.',
    cards: [{
      type: 'confirm',
      pendingId,
      serviceName: service.name,
      stylistName: draft.stylistName ?? stylistName(ctx.stylists, draft.stylistId),
      dateLabel: formatDateLabel(draft.date),
      timeLabel: formatTimeLabel(draft.time),
      priceLabel: priceLabel(service),
      durationMin: service.duration_min,
    }],
    chips: withEscapes([
      { label: 'Change the time', intent: 'pick_date', params: { date: draft.date }, style: 'ghost' },
    ]),
    node: 'confirm',
  };
}

async function handleConfirmBooking(ctx: HandlerContext): Promise<HandlerResult> {
  // GETDEL: a replayed confirm (double click, retried fetch, deliberate replay)
  // finds nothing and books nothing.
  const pending = await consumePending(String(ctx.params.pending_id));
  if (!pending) {
    return deadEnd(
      "That confirmation has expired or was already used. Nothing has been double-booked — start again and I'll find you a time.",
      'root',
    );
  }

  const result = await api.createBooking({
    body: {
      stylist_id: pending.stylistId,
      service_id: pending.serviceId,
      client_name: pending.clientName,
      client_email: pending.clientEmail,
      client_phone: pending.clientPhone,
      appointment_date: pending.date,
      appointment_time: pending.time,
      ...(pending.notes ? { notes: pending.notes } : {}),
      ...(pending.marketingConsent ? { marketing_consent: true } : {}),
    },
    customerToken: ctx.customerToken,
    clientIp: ctx.clientIp,
  });

  if (!result.ok) {
    if (result.code === 'SLOT_TAKEN') {
      return {
        reply: 'Someone just took that slot. Nothing was booked — shall I show you what else is free that day?',
        cards: [],
        chips: withEscapes([
          { label: 'See other times', intent: 'pick_date', params: { date: pending.date }, style: 'primary' },
          { label: 'Another day', intent: 'pick_stylist', params: { stylist_id: pending.stylistId } },
        ]),
        node: 'time',
      };
    }
    if (result.code === 'RATE_LIMITED') {
      return deadEnd(
        `That's as many bookings as we can take on those details today. Please call us on ${SALON_PHONE} and we'll sort it out.`,
      );
    }
    return deadEnd(
      `${result.error ?? "That didn't go through"}. Nothing was booked — please try again or call us on ${SALON_PHONE}.`,
    );
  }

  ctx.session.bookingsCreated += 1;
  ctx.session.draft = {};

  return {
    reply: `You're booked in. A confirmation is on its way to your email — it has a link if you need to cancel.`,
    cards: [{
      type: 'booked',
      serviceName: pending.serviceName,
      stylistName: pending.stylistName,
      dateLabel: formatDateLabel(pending.date),
      timeLabel: formatTimeLabel(pending.time),
    }],
    chips: [
      { label: 'Book something else', intent: 'book_start' },
      { label: 'My appointments', intent: 'my_appointments' },
    ],
    node: 'booked',
  };
}

/**
 * Everything past this point needs the customer's own token.
 *
 * Not signed in is answered with three real routes, never with "what's your
 * email?" — asking for an email would turn Iris into an appointment-lookup
 * oracle, which is exactly the enumeration hole api/customer/forgot-password.ts
 * is written to avoid.
 */
function requireSignIn(reply: string): HandlerResult {
  return {
    reply,
    cards: [{ type: 'signIn' }],
    chips: withEscapes([{ label: 'Book something new', intent: 'book_start' }]),
    node: 'appointments',
  };
}

async function handleMyAppointments(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.customerToken) {
    return requireSignIn(
      "To look up an appointment I'll need you signed in. You can also use the cancellation link in your confirmation email, or call the salon.",
    );
  }

  const result = await api.getCustomerAppointments({
    customerToken: ctx.customerToken,
    clientIp: ctx.clientIp,
  });

  if (!result.ok || !result.data) {
    if (result.status === 401) {
      return requireSignIn('Your session has expired — sign in again and I can pull those up.');
    }
    return deadEnd(`I couldn't load your appointments just then. Please try again shortly.`);
  }

  const today = salonToday();
  const upcoming = result.data
    .filter((a) => a.status !== 'cancelled' && a.appointment_date >= today)
    .sort((a, b) =>
      a.appointment_date === b.appointment_date
        ? a.appointment_time.localeCompare(b.appointment_time)
        : a.appointment_date.localeCompare(b.appointment_date)
    );

  if (upcoming.length === 0) {
    return {
      reply: "You haven't got anything booked at the moment. Shall we fix that?",
      cards: [],
      chips: withEscapes([{ label: 'Book an appointment', intent: 'book_start', style: 'primary' }]),
      node: 'appointments',
    };
  }

  return {
    reply: upcoming.length === 1 ? "Here's your appointment." : `Here are your ${upcoming.length} appointments.`,
    cards: upcoming.map((a): Card => ({
      type: 'appointment',
      id: a.id,
      serviceId: (a as unknown as { service_id?: string }).service_id ?? '',
      serviceName: api.unwrapJoin(a.services)?.name ?? 'Your service',
      stylistName: api.unwrapJoin(a.stylists)?.name ?? 'Your stylist',
      dateLabel: formatDateLabel(a.appointment_date),
      timeLabel: formatTimeLabel(a.appointment_time),
      status: a.status,
      canManage: true,
    })),
    chips: withEscapes([{ label: 'Book something else', intent: 'book_start' }]),
    node: 'appointments',
  };
}

/**
 * Cancels through the customer's OWN appointment list.
 *
 * The list endpoint is scoped to `user_id = auth.uid()` server-side, so an
 * appointment id belonging to someone else simply is not in it and the
 * cancellation token is never obtained. Passing an arbitrary id here therefore
 * fails as "not found" rather than cancelling a stranger's booking — the check
 * is structural, not a comparison this file could get wrong.
 */
async function handleCancelAppointment(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.customerToken) {
    return requireSignIn(
      "To cancel I'll need you signed in — or use the cancellation link in your confirmation email.",
    );
  }

  const list = await api.getCustomerAppointments({
    customerToken: ctx.customerToken,
    clientIp: ctx.clientIp,
  });
  if (!list.ok || !list.data) {
    if (list.status === 401) return requireSignIn('Your session has expired — sign in again to cancel.');
    return deadEnd("I couldn't reach your appointments just then. Please try again shortly.");
  }

  const target = list.data.find((a) => a.id === ctx.params.appointment_id);
  if (!target) {
    return deadEnd("I couldn't find that appointment on your account.", 'appointments');
  }
  if (target.status === 'cancelled') {
    return { ...(await handleMyAppointments(ctx)), reply: "That one's already cancelled." };
  }

  const cancelled = await api.cancelByToken({
    token: target.cancellation_token,
    clientIp: ctx.clientIp,
  });
  if (!cancelled.ok) {
    return deadEnd(
      `I couldn't cancel that just now. Please call us on ${SALON_PHONE} and we'll take care of it.`,
      'appointments',
    );
  }

  const refreshed = await handleMyAppointments(ctx);
  return { ...refreshed, reply: "That's cancelled, and a confirmation is on its way to your email." };
}

async function handleRescheduleStart(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.customerToken) {
    return requireSignIn(
      "To move an appointment I'll need you signed in. Otherwise you can cancel using the link in your confirmation email and book again, or call the salon.",
    );
  }

  // No appointment named yet — show the list so they can pick one.
  if (!ctx.params.appointment_id) {
    const list = await handleMyAppointments(ctx);
    return { ...list, reply: 'Which one would you like to move?' };
  }

  const list = await api.getCustomerAppointments({
    customerToken: ctx.customerToken,
    clientIp: ctx.clientIp,
  });
  if (!list.ok || !list.data) {
    if (list.status === 401) return requireSignIn('Your session has expired — sign in again to make changes.');
    return deadEnd("I couldn't reach your appointments just then. Please try again shortly.");
  }

  const target = list.data.find((a) => a.id === ctx.params.appointment_id);
  if (!target) return deadEnd("I couldn't find that appointment on your account.", 'appointments');
  if (target.status === 'cancelled') {
    return deadEnd("That one's already cancelled — shall I book you something new?", 'appointments');
  }

  const service = findService(ctx.services, target.service_id);
  if (!service) {
    return deadEnd(
      `That service isn't on our list any more, so I can't move it automatically. Please call us on ${SALON_PHONE}.`,
      'appointments',
    );
  }

  // An appointment booked before eligibility existed can pair a stylist with a
  // service they do not perform — the old 'anyone' resolver assigned whoever was
  // free, ignoring the service entirely. /api/availability now refuses that
  // pairing, so pinning the stylist and offering days would produce a date
  // picker where every day fails. Say so once, here, instead.
  if (!stylistCanDo(ctx.stylistServices, target.stylist_id, service.id)) {
    return deadEnd(
      `That booking is with a stylist who no longer offers ${service.name}, so I can't move it myself. Please call us on ${SALON_PHONE} and we'll sort it out.`,
      'appointments',
    );
  }

  // Reuse the ordinary booking funnel with the stylist genuinely pinned. This
  // used to draft 'anyone' while displaying the original stylist's name, so the
  // times offered were the whole roster's and did not belong to the person the
  // customer was told they'd be seeing. PATCH /api/appointments keeps the
  // original stylist regardless, which is exactly what this now asks for.
  ctx.session.draft = {
    rescheduleId: target.id,
    serviceId: service.id,
    serviceName: service.name,
    durationMin: service.duration_min,
    priceLabel: priceLabel(service),
    stylistId: target.stylist_id,
    stylistName: api.unwrapJoin(target.stylists)?.name ?? 'Your stylist',
  };

  return {
    reply: `Moving your ${service.name}. Which day works better?`,
    cards: [],
    chips: withEscapes(
      nextBookableDates(6).map((date) => ({
        label: formatDateChip(date),
        intent: 'pick_date' as IntentId,
        params: { date },
      })),
    ),
    node: 'reschedule_date',
  };
}

async function handleRescheduleConfirm(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.customerToken) {
    return requireSignIn('Sign in again and I can move that for you.');
  }

  const result = await api.reschedule({
    appointmentId: String(ctx.params.appointment_id),
    date: String(ctx.params.date),
    time: String(ctx.params.time),
    customerToken: ctx.customerToken,
    clientIp: ctx.clientIp,
  });

  if (!result.ok) {
    // The original booking is never touched on a failed move — the API does the
    // whole thing as one UPDATE — so every message here can say so honestly.
    if (result.code === 'SLOT_TAKEN') {
      return {
        reply: 'Someone took that slot first. Your original appointment is still exactly as it was — want to try another time?',
        cards: [],
        chips: withEscapes([
          { label: 'Other times that day', intent: 'pick_date', params: { date: ctx.params.date }, style: 'primary' },
          { label: 'My appointments', intent: 'my_appointments' },
        ]),
        node: 'reschedule_date',
      };
    }
    return deadEnd(
      `${result.error ?? "I couldn't move that"}. Your original appointment is unchanged — please call us on ${SALON_PHONE} if you need a hand.`,
      'appointments',
    );
  }

  ctx.session.draft = {};
  const refreshed = await handleMyAppointments(ctx);
  return { ...refreshed, reply: "Moved. There's a confirmation on its way to your email." };
}

function handlePrices(ctx: HandlerContext): HandlerResult {
  const category = typeof ctx.params.category === 'string' ? ctx.params.category : null;
  const matching = category ? ctx.services.filter((s) => s.category === category) : ctx.services;

  if (matching.length === 0) {
    return deadEnd("I don't have anything listed under that at the moment.");
  }

  // Unfiltered, the full list is long. Offer the categories instead of dumping
  // forty cards into a 380px panel.
  if (!category) {
    return {
      reply: ctx.modelReply || 'Which would you like prices for?',
      cards: [],
      chips: withEscapes(categoryChips(ctx.services)),
      node: 'prices',
    };
  }

  return {
    reply: ctx.modelReply || `Here are our ${CATEGORY_LABELS[category] ?? category}.`,
    cards: matching.map((s) => serviceCard(s)),
    chips: withEscapes([
      { label: 'Book an appointment', intent: 'book_start', style: 'primary' },
      ...otherCategoryChips(ctx.services, category, 'prices'),
    ]),
    node: 'prices',
  };
}

function handleServiceInfo(ctx: HandlerContext): HandlerResult {
  const service = findService(ctx.services, ctx.params.service_id);
  if (!service) {
    return {
      reply: "I couldn't find that one. Which are you interested in?",
      cards: [],
      chips: withEscapes(categoryChips(ctx.services)),
      node: 'prices',
    };
  }

  return {
    reply: ctx.modelReply || `Here's the detail on our ${service.name}.`,
    cards: [serviceCard(service)],
    chips: withEscapes([
      { label: `Book ${service.name}`, intent: 'pick_service', params: { service_id: service.id }, style: 'primary' },
      { label: 'Other services', intent: 'prices' },
    ]),
    node: 'prices',
  };
}

async function handlePromotions(ctx: HandlerContext): Promise<HandlerResult> {
  const promotions = await fetchLivePromotions();

  if (promotions.length === 0) {
    return {
      reply: "There aren't any offers running at the moment. Our regular prices are below if that helps.",
      cards: [],
      chips: withEscapes([
        { label: 'See prices', intent: 'prices', style: 'primary' },
        { label: 'Book an appointment', intent: 'book_start' },
      ]),
      node: 'promotions',
    };
  }

  return {
    // The offer WORDING is passed through untouched — see migration 017. Iris
    // does not summarise an offer, combine two, or work out what one is worth,
    // so the model's sentence is only ever the framing around it.
    reply: ctx.modelReply || "Here's what's on at the moment.",
    cards: promotions.map((p): Card => ({
      type: 'promotion',
      title: p.title,
      offerText: p.offer_text,
      description: p.description,
    })),
    chips: withEscapes([{ label: 'Book an appointment', intent: 'book_start', style: 'primary' }]),
    node: 'promotions',
  };
}

function handleHours(ctx: HandlerContext): HandlerResult {
  return {
    reply: ctx.modelReply || "We're on Queens Boulevard in Sunnyside — details below.",
    cards: [{
      type: 'hours',
      // Rendered here rather than described in prose, for the same reason prices
      // are: a closing time Iris typed would be a closing time Iris could get
      // wrong.
      rows: [
        { day: 'Monday – Sunday', hours: '10:00 AM – 8:00 PM' },
      ],
      address: SALON_ADDRESS,
      phone: SALON_PHONE,
    }],
    chips: withEscapes([{ label: 'Book an appointment', intent: 'book_start', style: 'primary' }]),
    node: 'hours',
  };
}

function handleEscalate(ctx: HandlerContext): HandlerResult {
  const { draft } = ctx.session;
  const context = draft.serviceName ? ` about ${draft.serviceName}` : '';

  return {
    reply: `Happy to pass this on${context}. Leave a message below and the salon will get back to you, or call ${SALON_PHONE}.`,
    cards: [{ type: 'contactForm', mode: 'message' }],
    chips: [{ label: 'Start over', intent: 'root', style: 'ghost' }],
    node: 'escalate',
  };
}

async function handleContactSalon(ctx: HandlerContext): Promise<HandlerResult> {
  const { draft } = ctx.session;

  // The summary is composed HERE, from session state, and prefixed to whatever
  // the customer wrote. A handoff that arrives without context is a handoff the
  // owner has to chase.
  const summary = [
    draft.serviceName ? `Service: ${draft.serviceName}` : null,
    draft.date ? `Date discussed: ${draft.date}` : null,
    draft.time ? `Time discussed: ${draft.time}` : null,
  ].filter(Boolean).join('\n');

  const message = summary
    ? `${String(ctx.params.message)}\n\n---\nFrom the website assistant:\n${summary}`
    : String(ctx.params.message);

  const result = await api.sendContactMessage({
    name: String(ctx.params.name),
    email: String(ctx.params.email),
    message,
    clientIp: ctx.clientIp,
  });

  if (!result.ok) {
    return deadEnd(
      `I couldn't send that just now. Please call us on ${SALON_PHONE} — sorry about that.`,
      'escalate',
    );
  }

  return {
    reply: "Sent. The salon will come back to you by email.",
    cards: [],
    chips: rootChips(),
    node: 'root',
  };
}
