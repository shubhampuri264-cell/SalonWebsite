import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import 'yet-another-react-lightbox/styles.css';

type ImageSlide = { type?: undefined; src: string; alt: string };
type VideoSlide = { type: 'video'; sources: { src: string; type: string }[] };
type Slide = ImageSlide | VideoSlide;

const GALLERY_SLIDES: Slide[] = [
  { src: '/gallery/hair-1.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-2.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-3.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-4.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-6.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/screenshot-1.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-2.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-3.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-4.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-5.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-6.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-7.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-8.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-9.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/screenshot-10.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-1.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-2.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-3.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-4.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-5.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-6.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-7.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-8.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-9.jpeg', alt: 'Icon Studio salon work' },
  {
    type: 'video',
    sources: [{ src: '/gallery/hair-video-1.mov', type: 'video/mp4' }],
  },
  {
    type: 'video',
    sources: [{ src: '/gallery/hair-video-2.mov', type: 'video/mp4' }],
  },
  {
    type: 'video',
    sources: [{ src: '/gallery/hair-video-3.mov', type: 'video/mp4' }],
  },
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
          {GALLERY_SLIDES.map((slide, index) => (
            <div key={index} className="masonry-item" role="listitem">
              <button
                onClick={() => setLightboxIndex(index)}
                className="group w-full overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                aria-label={slide.type === 'video' ? 'Play video' : `View ${(slide as ImageSlide).alt}`}
              >
                {slide.type === 'video' ? (
                  <div className="relative w-full bg-black rounded-xl overflow-hidden">
                    <video
                      src={(slide as VideoSlide).sources[0].src}
                      className="w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                      <svg className="h-12 w-12 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <img
                    src={(slide as ImageSlide).src}
                    alt={(slide as ImageSlide).alt}
                    loading="lazy"
                    className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Lightbox */}
        <Lightbox
          open={lightboxIndex >= 0}
          close={() => setLightboxIndex(-1)}
          index={lightboxIndex}
          slides={GALLERY_SLIDES}
          plugins={[Video]}
        />
      </div>
    </>
  );
}
