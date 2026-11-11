'use client';
import {useRef,useState} from 'react';
import {useApp} from '@/lib/AppContext';
import {Initial} from './Initial';
import {userAvatarStyle} from '@/lib/format';
export function AvatarChoices(){
 const {me,t,updateAvatar}=useApp();const preview=useRef<HTMLSpanElement>(null);const [busy,setBusy]=useState(false);
 if(!me)return null;
 const choose=async()=>{
  if(busy||!preview.current)return;setBusy(true);
  try{
   const original=preview.current.querySelector('svg');if(!original)return;
   const svg=original.cloneNode(true) as SVGSVGElement;const theme=getComputedStyle(preview.current);
   svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','192');svg.setAttribute('height','192');svg.setAttribute('viewBox','-14 -14 92 92');
   svg.setAttribute('style','color:'+theme.color+';--pick:'+theme.getPropertyValue('--pick')+';--cream:'+theme.getPropertyValue('--cream'));
   const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();
   const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;const ctx=canvas.getContext('2d');if(!ctx)return;
   ctx.fillStyle=theme.backgroundColor;ctx.fillRect(0,0,192,192);ctx.drawImage(image,0,0,192,192);await updateAvatar(canvas.toDataURL('image/png'));
  }finally{setBusy(false);}
 };
 return <div className="avatar33choices"><button className="btn ghost" disabled={busy} onClick={()=>void updateAvatar('')}><span className="dot" style={userAvatarStyle({avatarUrl:null})}><Initial name={me.name}/></span>{t('profile.defaultAvatar')}</button><button className="btn ghost" disabled={busy} aria-busy={busy} onClick={()=>void choose()}><span className="dot" ref={preview} style={userAvatarStyle({avatarUrl:null})}><Initial name={me.name} festive/></span>{t('profile.festiveAvatar')}</button></div>;
}
