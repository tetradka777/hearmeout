// Spotify gives artists free-form genres ("art rock", "trap latino",
// "uk garage"); the app groups by the catalog's buckets (data.ts:
// Rock, Pop, Hip-Hop, R&B, Electronic, Latin). This maps an artist's genre
// list to one bucket — the first genre that matches, more specific rules
// first (so "latin pop" is Latin, "pop rap" is Hip-Hop, "dance pop" is Pop).
const RULES: [RegExp, string][] = [
  [/latin|reggaet|salsa|bachata|cumbia|urbano|sertanejo|forr[oó]|mpb|samba|corrido|banda|ranchera|bossa/i, 'Latin'],
  [/hip ?hop|rap|trap|drill|grime|boom bap/i, 'Hip-Hop'],
  [/r&b|rnb|soul|funk|neo soul|quiet storm|motown/i, 'R&B'],
  [/house|techno|trance|edm|electro|dubstep|drum and bass|dnb|garage|ambient|idm|synthwave|downtempo|breakbeat|hardstyle/i, 'Electronic'],
  [/rock|metal|punk|grunge|emo|shoegaze|indie|alternative|post-hardcore|hardcore|britpop|new wave/i, 'Rock'],
  [/pop|k-pop|j-pop|dance|disco|singer-songwriter|adult standards/i, 'Pop'],
];

export function bucketForGenres(genres: string[]): string | null {
  for (const g of genres) {
    for (const [re, bucket] of RULES) if (re.test(g)) return bucket;
  }
  return null;
}
