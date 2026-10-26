import type { SupabaseClient } from '@supabase/supabase-js';
import { forgetFriendIds } from './friendIds';

export async function acceptFriendRequest(admin: SupabaseClient, requestId: number, fromUserId: string, toUserId: string) {
  await admin.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
  await admin.from('friendships').upsert(
    [
      { user_id: fromUserId, friend_id: toUserId },
      { user_id: toUserId, friend_id: fromUserId },
    ],
    { onConflict: 'user_id,friend_id' }
  );
  forgetFriendIds(fromUserId, toUserId);
}
