type Music = { genreBucket: string | null; country: string };
export type DiscoveryBlock =
  | { kind: 'albums'; key: string; indices: number[]; layout: 'row' | 'pair'; genre?: string; country?: string; heading?: boolean }
  | { kind: 'reviews'; key: string; indices: number[]; heading?: boolean };

// Work in completed windows so fetching another page never reorders a row
// the reader has already browsed. Labels describe the actual selected items.
export function buildDiscoveryBlocks(albums: readonly Music[], reviewCount: number): DiscoveryBlock[] {
  const blocks: DiscoveryBlock[] = [];
  const topics = new Set<string>();
  let pairHeading = false, reviewHeading = false;
  const windows = Math.max(Math.ceil(albums.length / 16), Math.ceil(reviewCount / 5));
  for (let window = 0; window < windows; window++) {
    let pool = Array.from({ length: Math.min(16, Math.max(0, albums.length - window * 16)) }, (_, i) => window * 16 + i);
    const reviews = Array.from({ length: Math.min(5, Math.max(0, reviewCount - window * 5)) }, (_, i) => window * 5 + i);
    const music = (indices: number[], layout: 'row' | 'pair') => {
      if (!indices.length) return;
      const first = albums[indices[0]];
      const sameGenre = first.genreBucket && indices.every(i => albums[i].genreBucket === first.genreBucket) ? first.genreBucket : undefined;
      const sameCountry = indices.every(i => albums[i].country === first.country) ? first.country : undefined;
      const genre = sameGenre && !topics.has('genre:' + sameGenre) ? sameGenre : undefined;
      const country = !genre && sameCountry && !topics.has('country:' + sameCountry) ? sameCountry : undefined;
      if (genre) topics.add('genre:' + genre);
      if (country) topics.add('country:' + country);
      const heading = layout === 'pair' && !genre && !country && !pairHeading;
      if (heading) pairHeading = true;
      blocks.push({kind: 'albums', key: 'music-' + indices[0], indices, layout, ...(genre ? {genre} : country ? {country} : {}), ...(heading ? {heading} : {})});
      const used = new Set(indices); pool = pool.filter(i => !used.has(i));
    };
    music(pool.slice(0, pool.length < 14 ? pool.length : 8), 'row');
    if (reviews.length) blocks.push({kind:'reviews',key:'reviews-'+reviews[0],indices:reviews.slice(0,1)});
    music(pool.slice(0,8), 'row');
    if (reviews.length > 1) {
      blocks.push({kind:'reviews',key:'reviews-'+reviews[1],indices:reviews.slice(1), ...(!reviewHeading ? {heading:true} : {})});
      reviewHeading = true;
    }
  }
  // With no review between them, keep albums in one swipeable shelf.
  return blocks.reduce<DiscoveryBlock[]>((out, block) => {
    const previous = out[out.length - 1];
    if (previous?.kind === 'albums' && block.kind === 'albums') {
      previous.indices.push(...block.indices);
      if (!previous.indices.every(i => albums[i].genreBucket === previous.genre)) delete previous.genre;
      if (!previous.indices.every(i => albums[i].country === previous.country)) delete previous.country;
    } else out.push({...block,indices:[...block.indices]});
    return out;
  }, []);
}
