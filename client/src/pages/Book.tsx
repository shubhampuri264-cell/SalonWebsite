import { Helmet } from 'react-helmet-async';
import BookingWizard from '@/components/BookingWizard/BookingWizard';

export default function Book() {
  return (
    <>
      <Helmet>
        <title>Book an Appointment | Icon Studio</title>
        <meta
          name="description"
          content="Book your hair salon or threading appointment online at Icon Studio. Fast, easy, 24/7."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-12 md:px-6">
        <div className="mb-10 text-center">
          <h1 className="font-serif text-4xl font-semibold md:text-5xl">
            Book an Appointment
          </h1>
          <p className="mt-3 text-muted-foreground">
            Complete the steps below to reserve your time.
          </p>
        </div>

        <BookingWizard />
      </div>
    </>
  );
}
