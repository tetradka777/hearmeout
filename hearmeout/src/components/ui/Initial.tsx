import { ProfileIcon } from './Icons';

// Letter for an avatar dot: the first letter of the name, upper-cased; a
// name with no letter at all (e.g. "123") gets the person icon instead of
// a digit (audit L30).
export function Initial({ name }: { name: string }) {
  const letter = name.match(/\p{L}/u)?.[0];
  if (letter) return <>{letter.toUpperCase()}</>;
  return <span style={{ width: '60%', height: '60%', display: 'grid' }}><ProfileIcon /></span>;
}
