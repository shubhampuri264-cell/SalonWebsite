import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

// Placeholder gallery images — replace with Supabase Storage URLs before launch
const GALLERY_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1595475207225-428b62bda831?w=600',
    alt: 'Balayage color result',
  },
  {
    src: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?w=600',
    alt: 'Eyebrow threading service',
  },
  {
    src: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
    alt: 'Salon interior',
  },
  {
    src: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600',
    alt: 'Hair styling in progress',
  },
  {
    src: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=600',
    alt: 'Client blowout',
  },
  {
    src: 'https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?w=600',
    alt: 'Color treatment',
  },
  {
    src: 'https://images.unsplash.com/photo-1582095133179-bfd08e2979f8?w=600',
    alt: 'Precision haircut',
  },
  {
    src: 'https://images.unsplash.com/photo-1605980776566-0486c3ac7617?w=600',
    alt: 'Threading closeup',
  },
];

export default function Gallery() {
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  return (
    <>
      <Helmet>
        <title>Gallery | Luxe Threads</title>
        <meta
          name="description"
          content="Browse our gallery of hair and threading transformations at Luxe Threads."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-16 md:px-6">
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl font-semibold md:text-5xl">Gallery</h1>
          <p className="mt-4 text-muted-foreground">
            A look at our work — from balayage and cuts to threading transformations.
          </p>
        </div>

        {/* Masonry grid */}
        <div className="masonry-grid" role="list" aria-label="Gallery images">
          {GALLERY_IMAGES.map((image, index) => (
            <div
              key={image.src}
              className="masonry-item"
              role="listitem"
            >
              <button
                onClick={() => setLightboxIndex(index)}
                className="group w-full overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                aria-label={`View ${image.alt}`}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  loading="lazy"
                  className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            </div>
          ))}
        </div>

        {/* Lightbox */}
        <Lightbox
          open={lightboxIndex >= 0}
          close={() => setLightboxIndex(-1)}
          index={lightboxIndex}
          slides={GALLERY_IMAGES}
        />
      </div>
    </>
  );
}
