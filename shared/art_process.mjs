export const canvasOf=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export async function loadBitmap(url){const r=await fetch(url);if(!r.ok)throw Error('이미지를 불러오지 못했습니다.');return createImageBitmap(await r.blob());}
export function alphaBounds(data,w,h){let left=w,top=h,right=-1,bottom=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return right<0?null:{x:left,y:top,w:right-left+1,h:bottom-top+1};}
export function chromaKey(data,chroma,tolerance=50){for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],key=chroma==='magenta'?Math.min(r,b)-g:g-Math.max(r,b);if(key>tolerance){data[i+3]=Math.round(data[i+3]*Math.max(0,1-(key-tolerance)/40));if(chroma==='green')data[i+1]=Math.min(g,Math.max(r,b)+10);else {data[i]=Math.min(r,g+10);data[i+2]=Math.min(b,g+10);}}}return data;}
export async function processArtwork(item){
 const bitmap=await loadBitmap(item.originalUrl),source=canvasOf(bitmap.width,bitmap.height),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close();
 const cfg=item.config;
 if(cfg.kind==='image')return source;
 if(cfg.kind==='item'){
   const bound=alphaBounds(ctx.getImageData(0,0,source.width,source.height).data,source.width,source.height);if(!bound)throw Error('빈 이미지입니다. 원본을 확인해 주세요.');
   const target=canvasOf(256,256),out=target.getContext('2d'),scale=224/Math.max(bound.w,bound.h);out.imageSmoothingEnabled=cfg.style!=='pixel';out.drawImage(source,bound.x,bound.y,bound.w,bound.h,(256-bound.w*scale)/2,(256-bound.h*scale)/2,bound.w*scale,bound.h*scale);return target;
 }
 const pixels=ctx.getImageData(0,0,source.width,source.height);chromaKey(pixels.data,cfg.chroma,cfg.keyTolerance);ctx.putImageData(pixels,0,0);
 const grid=item.export.grid,cellW=source.width/grid.cols,cellH=source.height/grid.rows,frames=[];
 let maxW=1,maxH=1;
 for(let i=0;i<grid.frames;i++){const cell=canvasOf(Math.floor(cellW),Math.floor(cellH)),cc=cell.getContext('2d',{willReadFrequently:true});cc.drawImage(source,Math.round((i%grid.cols)*cellW),Math.round(Math.floor(i/grid.cols)*cellH),cell.width,cell.height,0,0,cell.width,cell.height);const bound=alphaBounds(cc.getImageData(0,0,cell.width,cell.height).data,cell.width,cell.height);if(!bound)throw Error('빈 프레임이 있습니다. 원본 시트를 확인하고 다른 시안을 생성해 주세요.');frames.push({cell,bound});maxW=Math.max(maxW,bound.w);maxH=Math.max(maxH,bound.h);}
 const size=grid.frameSize,output=canvasOf(grid.cols*size,grid.rows*size),out=output.getContext('2d');out.imageSmoothingEnabled=false;
 // Shared scale keeps frame-to-frame size. Shared cell ground line preserves body bobbing.
 const scale=Math.min((size-24)/maxW,(size-24)/maxH),ground=Math.max(...frames.map(f=>f.bound.y+f.bound.h));
 frames.forEach(({cell,bound},i)=>{const x=(i%grid.cols)*size+(size-bound.w*scale)/2,y=Math.floor(i/grid.cols)*size+size-12-(ground-bound.y)*scale;out.drawImage(cell,bound.x,bound.y,bound.w,bound.h,Math.round(x),Math.round(y),Math.round(bound.w*scale),Math.round(bound.h*scale));});
 return output;
}
export function godotArtFrames(item,stem){const g=item.export.grid,s=g.frameSize,lines=['[gd_resource type="SpriteFrames" load_steps='+ (g.frames+2)+' format=3]','',`[ext_resource type="Texture2D" path="${stem}.png" id="1"]`];for(let i=0;i<g.frames;i++)lines.push('',`[sub_resource type="AtlasTexture" id="frame_${i}"]`,'atlas = ExtResource("1")',`region = Rect2(${i%g.cols*s}, ${Math.floor(i/g.cols)*s}, ${s}, ${s})`);const list=g.animation==='base'?Array.from({length:g.frames},(_,i)=>`{"frames": [{"duration": 1.0, "texture": SubResource("frame_${i}")}], "loop": false, "name": &"${['front','quarter','side','quarter_back','back'][i]}", "speed": 1.0}`):[`{"frames": [${Array.from({length:g.frames},(_,i)=>`{"duration": 1.0, "texture": SubResource("frame_${i}")}`).join(',')}], "loop": true, "name": &"${g.animation}", "speed": ${g.fps}.0}`];return lines.join('\n')+'\n\n[resource]\nanimations = ['+list.join(',')+']\n';}
