// An invite link (/invite/[id]) opened while logged out: the page stores
// the inviter here before sending the visitor to sign up / sign in, the
// auth modal reads the name for its "request is sent automatically" note,
// and AppContext sends the friend request once auth is ready.
export const PENDING_INVITE_KEY = 'hmo_pending_invite';
export const PENDING_INVITE_NAME_KEY = 'hmo_pending_invite_name';
