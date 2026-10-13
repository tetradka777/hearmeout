// The five reactions (migration 029), shared by the server and the cards.
// Our icons, not emoji (the redesign keeps emoji off the site).
export const REACTIONS = ['heart', 'flame', 'spark', 'repeat', 'star'] as const;
export type ReactionKind = (typeof REACTIONS)[number];
