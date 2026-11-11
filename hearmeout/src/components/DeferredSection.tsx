'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useApp} from '@/lib/AppContext';
import {cachedJson,peekJson} from '@/lib/cachedJson';
import type {ScreenName} from '@/lib/types';
// Warm the exact existing source before mounting its consumer: the placeholder
// remains stable while loading, and useCachedJson shares the completed answer.
export function DeferredSection({children,screen,warmUrl}:{children:ReactNode;screen:ScreenName;warmUrl?:string}){
 const {state,t}=useApp();const anchor=useRef<HTMLDivElement>(null);const [started,setStarted]=useState(false);
 useEffect(()=>{if(started||state.activeScreen!==screen||!anchor.current)return;let alive=true;
  const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){io.disconnect();void (warmUrl&&peekJson(warmUrl)==null?cachedJson(warmUrl):Promise.resolve()).finally(()=>{if(alive)setStarted(true);});}},{rootMargin:'200px'});io.observe(anchor.current);return()=>{alive=false;io.disconnect();};
 },[started,state.activeScreen,screen,warmUrl]);
 return <div ref={anchor} className="defer35" style={started?undefined:{minHeight:320}}>{started?children:<span className="muted" role="status">{t('app.loading')}</span>}</div>;
}
