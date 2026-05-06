import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

const GALLERY_IMAGES = [
  { src: '/gallery/salon-1.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-2.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-3.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-4.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-5.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-6.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-7.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-8.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-9.jpeg', alt: 'Icon Studio salon work' },
];

export default function Gallery() {
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  return (
    <>
      <Helmet>
        <title>Gallery | Icon Studio</title>
        <meta
          name="description"
          content="Browse our gallery of hair and threading transformations at Icon Studio."
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
