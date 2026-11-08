import {ANIMS, PROPORTIONS, WALK_GUIDES} from '../sd/anims.mjs';
import {buildBasePrompt, buildAnimPrompt} from '../sd/prompt_builder.mjs';

export const ART_MODELS = ['gpt-image-2.5-flare','gpt-image-2.5-sunburst','gpt-image-2.6-flare','gpt-image-2.6-sunburst','gpt-image-2','gpt-image-1.5','gpt-image-1-mini'];
export function artConfig(input) {
  const kind = input.kind;
  if (!['image','item','sd'].includes(kind)) throw Error('공방 종류가 올바르지 않습니다.');
  const prompt = String(input.prompt || '').trim();
  if (!prompt || prompt.length > 6000) throw Error('만들 내용을 1~6,000자로 적어 주세요.');
  if (!ART_MODELS.includes(input.model)) throw Error('목록에서 이미지 모델을 선택해 주세요.');
  const refs = Array.isArray(input.refs) ? input.refs : [];
  if (refs.length > 4 || refs.some(id => !/^[a-f0-9-]{36}$/.test(id))) throw Error('레퍼런스는 최대 4개입니다.');
  const size = ['1024x1024','1536x1024','1024x1536'].includes(input.size) ? input.size : '1024x1024';
  const quality = ['low','medium','high'].includes(input.quality) ? input.quality : 'medium';
  const c = {kind, prompt, title:String(input.title || prompt.slice(0,35)).trim().slice(0,100), model:input.model, refs,
    size,quality,background:input.background === 'transparent' ? 'transparent' : 'opaque',
    style: ['dusk','tomato','pixel','custom'].includes(input.style) ? input.style : 'dusk',
    folder:String(input.folder || '').trim().slice(0,80), stage:input.stage === 'animation' ? 'animation' : 'base',
    proportion:PROPORTIONS.some(p=>p.key===input.proportion) ? input.proportion : 'mini',
    chroma:input.chroma === 'magenta' ? 'magenta' : 'green',
    anim:ANIMS.some(a=>a.key===input.anim) ? input.anim : 'walk_basic',
    weapon:String(input.weapon || '').slice(0,300),nearCue:String(input.nearCue || '').slice(0,300),
    fps:Math.max(1,Math.min(30,Math.round(Number(input.fps)||8))),frameSize:[64,128,256,384].includes(Number(input.frameSize))?Number(input.frameSize):256,
    keyTolerance:Math.max(10,Math.min(120,Number(input.keyTolerance)||50)),guide:input.guide!==false};
  if(kind==='item') {c.size='1024x1024'; c.background='transparent';}
  if(kind==='sd') {
    if(!refs.length) throw Error('SD 변환에 사용할 원화 또는 기준 캐릭터를 선택해 주세요.');
    c.size='1536x1024'; c.background='opaque';
  }
  return c;
}
export function artRecipe(c) {
  let prompt=c.prompt, guide=null, grid=null;
  if(c.kind==='item') {
    const style=c.style==='tomato'?'Match the provided style references: stylized digital illustration, soft cel-shading, clean lines and warm lighting.':c.style==='pixel'?'Crisp pixel art, limited palette, readable at 32 pixels, no blurry edges.':c.style==='dusk'?'Dark fantasy game inventory icon, elegant painterly cel shading, restrained jewel tones, readable silhouette, subtle worn materials.':'';
    prompt=`Generate exactly ONE game item icon. ${style} The item requested: ${c.prompt}. Full item centered with generous empty margin, three-quarter view, crisp silhouette, transparent background. No hands, people, text, numbers, labels, border, watermark, ground plane, cast shadow, steam or glow outside the silhouette. Preserve the requested item type, material and color.`;
  } else if(c.kind==='sd') {
    if(c.stage==='base') {
      prompt=buildBasePrompt({features:c.prompt, chroma:c.chroma, proportion:c.proportion});
      grid={cols:3,rows:2,frames:5,labels:['앞면','45도','옆면','뒷45도','뒷면'],fps:c.fps,frameSize:c.frameSize,animation:'base'};
    } else {
      const anim=ANIMS.find(a=>a.key===c.anim);
      guide=c.guide&&(anim.chartPoses||anim.key==='walk') ? (anim.guides?.[c.proportion]||anim.guides?.mini||WALK_GUIDES[c.proportion]) : null;
      prompt=buildAnimPrompt({anim, features:c.prompt, chroma:c.chroma, proportion:c.proportion, withColorGrid:!!guide, charPx:240,weapon:c.weapon,nearCue:c.nearCue});
      grid={cols:anim.cols,rows:anim.rows,frames:anim.keep||anim.frames,fps:c.fps,frameSize:c.frameSize,animation:anim.key};
    }
  }
  return {prompt,guide,grid};
}
