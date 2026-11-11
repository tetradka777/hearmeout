'use client';
import {useApp} from '@/lib/AppContext';
import {Shelf} from './ui/SuperCards';
import {CoverArt} from './ui/CoverArt';
import {PreviewButton} from './redesign/PreviewButton';
import {blurStyle} from '@/lib/imageColor';
import type {FeedFriendRepeatTrack} from '@/lib/types';
export function OnRepeatSection({friends=false}:{friends?:boolean}){
 const {t,feed,openAlbum,viewFriend}=useApp();
 const tracks=friends?feed?.friendsOnRepeat:feed?.repeatedTracks;
 if(!tracks?.length)return null;
 return <Shelf title={t(friends?'home.repeatFriends':'home.repeatMine')} sub={t('home.repeatToday')} className="repeat35">
  {tracks.map((track,i)=>{const friend=friends?(track as FeedFriendRepeatTrack).user:null;
   return <article className="tile bh15 repeat35card" style={blurStyle(track.cover)} key={[friend?.id,track.trackId,track.title,track.artist,track.albumId].join('|')}>
    <div className="repeat35body"><CoverArt url={track.cover ?? undefined} fallbackLetter={track.artist[0]||'?'} className="cov" px={80} style={{width:64,height:64,flex:'none'}}/>
    <div className="repeat35text">{track.albumId?<button className="repeat35title" onClick={()=>openAlbum(track.albumId!)}><span>{track.title}</span></button>:<b>{track.title}</b>}<small>{track.artist||t('liveSearch.unknownArtist')}</small></div></div>
    <div className="repeat35foot"><span>{friend&&<button onClick={()=>viewFriend(friend.id)}>{friend.name}</button>}<small>{t('stats.playsN',{n:track.plays})}</small></span><PreviewButton tracks={tracks} index={i} size={40}/></div>
   </article>;
  })}
 </Shelf>;
}
