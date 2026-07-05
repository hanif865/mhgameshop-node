'use client';

import { useEffect, useState } from 'react';
import { imageUrl } from '@/lib/config';

interface Slide {
  id: number;
  image: string | null;
  url: string | null;
  title: string | null;
}

export function HeroSlider({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 4500);
    return () => clearInterval(t);
  }, [count]);

  if (count === 0) {
    return (
      <div className="flex aspect-[21/9] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-primary to-primary-dark text-2xl font-extrabold text-white sm:aspect-[24/7]">
        MH Game Shop
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        className="flex transition-transform duration-500"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s) => {
          const img = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl(s.image)}
              alt={s.title ?? ''}
              className="aspect-[21/9] w-full shrink-0 object-cover sm:aspect-[24/7]"
            />
          );
          return (
            <div key={s.id} className="w-full shrink-0">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {img}
                </a>
              ) : (
                img
              )}
            </div>
          );
        })}
      </div>
      {count > 1 && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-5 bg-white' : 'w-2 bg-white/60'
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
