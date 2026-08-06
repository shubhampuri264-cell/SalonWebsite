import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import 'yet-another-react-lightbox/styles.css';

type ImageSlide = { type?: undefined; src: string; alt: string };
type VideoSlide = {
  type: 'video';
  poster: string;
  sources: { src: string; type: string }[];
};
type Slide = ImageSlide | VideoSlide;

const GALLERY_SLIDES: Slide[] = [
  { src: '/gallery/hair-1.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-2.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-3.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-4.jpg', alt: 'Icon Studio hair work' },
  { src: '/gallery/hair-6.jpg', alt: 'Icon Studio hair work' },
  // screenshot-1..9 used to sit here. Each was a byte-identical copy of a
  // salon-N.jpeg below, so the grid showed all nine twice and shipped 1.9 MB to
  // do it. screenshot-10 had no duplicate and survives as salon-10.
  { src: '/gallery/salon-10.jpg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-1.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-2.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-3.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-4.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-5.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-6.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-7.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-8.jpeg', alt: 'Icon Studio salon work' },
  { src: '/gallery/salon-9.jpeg', alt: 'Icon Studio salon work' },
  // Re-encoded from the original iPhone .mov masters (46 MB combined, 1080x1920
  // at 15 Mbps, wrapped in QuickTime because of the gyro/timecode side tracks).
  // Those only played in Chrome and Safari, which sniff H.264 out of a MOV;
  // Firefox has no QuickTime demuxer and showed a broken player. The .mp4 files
  // are ISO-BMFF, H.264 High/yuv420p, AAC-LC, faststart -- 6.6 MB combined and
  // playable everywhere. Regenerate with:
  //   ffmpeg -i hair-video-N.mov -map 0:v:0 -map 0:a:0? \
  //     -c:v libx264 -crf 26 -preset slow -profile:v high -pix_fmt yuv420p \
  //     -maxrate 2500k -bufsize 5000k -vf "scale='min(720,iw)':-2" \
  //     -c:a aac -b:a 96k -movflags +faststart hair-video-N.mp4
  {
    type: 'video',
    poster: '/gallery/hair-video-1-poster.jpg',
    sources: [{ src: '/gallery/hair-video-1.mp4', type: 'video/mp4' }],
  },
  {
    type: 'video',
    poster: '/gallery/hair-video-2-poster.jpg',
    sources: [{ src: '/gallery/hair-video-2.mp4', type: 'video/mp4' }],
  },
  {
    type: 'video',
    poster: '/gallery/hair-video-3-poster.jpg',
    sources: [{ src: '/gallery/hair-video-3.mp4', type: 'video/mp4' }],
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
        <div className="mb-14 text-center">
          <span className="eyebrow eyebrow--center">Our Work</span>
          <h1 className="mt-4 font-serif text-4xl font-semibold md:text-5xl">Gallery</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            A look at our work — from balayage and cuts to threading transformations.
          </p>
        </div>

        {/* Masonry grid */}
        <div className="masonry-grid" role="list" aria-label="Gallery images">
          {GALLERY_SLIDES.map((slide, index) => (
            <div key={index} className="masonry-item" role="listitem">
              <button
                onClick={() => setLightboxIndex(index)}
                className="group w-full overflow-hidden rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                aria-label={slide.type === 'video' ? 'Play video' : `View ${(slide as ImageSlide).alt}`}
              >
                {slide.type === 'video' ? (
                  <div className="relative w-full bg-black rounded-xl overflow-hidden">
                    {/* A poster image, not a <video>. The tile only needs a
                        still frame, and an 8-68 KB JPEG delivers that for a
                        fraction of what a video element costs -- the old one
                        range-requested its way through the source file just to
                        decode a first frame. Video bytes are now fetched only
                        when the lightbox actually opens. */}
                    <img
                      src={(slide as VideoSlide).poster}
                      alt=""
                      loading="lazy"
                      className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
