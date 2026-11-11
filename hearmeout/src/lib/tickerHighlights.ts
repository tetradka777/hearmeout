export function highlightTickerText(text: string, subjects: readonly string[]) {
 const values=[...new Set(subjects.filter(Boolean))].sort((a,b)=>b.length-a.length);
 const parts: {text:string;highlight:boolean}[]=[];let at=0;
 while(at<text.length){let start=text.length,found='';for(const value of values){const index=text.indexOf(value,at);if(index>=0&&index<start){start=index;found=value;}}
 if(start>at)parts.push({text:text.slice(at,start),highlight:false});if(!found)break;
 parts.push({text:found,highlight:true});at=start+found.length;
 }return parts;
}
