import { useEffect, useRef } from 'react';
import { useBookingStore } from '@/store/bookingStore';
import StepService from './StepService';
import StepStylist from './StepStylist';
import StepDateTime from './StepDateTime';
import StepContact from './StepContact';
import { cn } from '@/utils/cn';

const STEPS = ['Service', 'Stylist', 'Date & Time', 'Your Details'];

export default function BookingWizard() {
  const { currentStep } = useBookingStore();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus the step heading when step changes for accessibility
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white p-6 shadow-sm md:p-8">
      {/* Progress bar */}
      <nav aria-label="Booking progress" className="mb-8">
        <ol className="flex items-center gap-0">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    index < currentStep
                      ? 'bg-rose-500 text-white'
                      : index === currentStep
                      ? 'border-2 border-rose-500 text-rose-600'
                      : 'border-2 border-border text-muted-foreground'
                  )}
                  aria-current={index === currentStep ? 'step' : undefined}
                >
                  {index < currentStep ? '✓' : index + 1}
                </div>
                <span
                  className={cn(
                    'mt-1 hidden text-xs sm:block',
                    index === currentStep
                      ? 'font-medium text-rose-600'
                      : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </div>

              {/* Connector */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-1 h-0.5 flex-1 transition-colors',
                    index < currentStep ? 'bg-rose-500' : 'bg-border'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step content */}
      <div ref={headingRef} tabIndex={-1} className="outline-none">
        {currentStep === 0 && <StepService />}
        {currentStep === 1 && <StepStylist />}
        {currentStep === 2 && <StepDateTime />}
        {currentStep === 3 && <StepContact />}
      </div>
    </div>
  );
}
