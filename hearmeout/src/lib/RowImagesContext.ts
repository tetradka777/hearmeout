'use client';
import { createContext } from 'react';

// A nearby circular selection warms each logical image once, so rebasing
// never waits for an offscreen clone's visibility observer.
export const RowImagesContext = createContext(false);
