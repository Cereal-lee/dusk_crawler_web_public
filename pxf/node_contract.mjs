// SPDX-License-Identifier: MIT
// Public-edition definitions authored for Dusk. Names used in imported JSON are
// interoperability identifiers; labels, defaults and limits are defined here.
const scalar=(n,d=0,min=-512,max=512,t='num')=>({n,t,d,min,max,label:n.replace(/([a-z])([A-Z])/g,'$1 $2')});
const choose=(n,d,opt)=>({n,t:'sel',d,opt,label:n});
const flag=(n,d=false)=>({n,t:'bool',d,label:n});
const swatch=(n,d='#70cce0')=>({n,t:'color',d,label:n});
const colors=()=>({n:'colors',t:'palette',d:['#162849','#397c9c','#8edce3','#f6f1d0'],max:32,label:'Color stops'});
const f=(n,d=0)=>scalar(n,d,0,1);
const count=(n,d,max=64,min=1)=>scalar(n,d,min,max,'int');
const seed=()=>scalar('seed',2026,0,2147483647,'seed');
const position=()=>[f('x',.5),f('y',.5)];
const gain=()=>scalar('intensity',1,0,8);
const curve=()=>['x0','y0','x1','y1','x2','y2','x3','y3'].map((n,i)=>scalar(n,[.15,.7,.3,.2,.7,.2,.85,.65][i],-2,3));
const tintParams=()=>[swatch('color'),f('amount',1),scalar('bright',1,0,8),f('opacity',1)];
const transform=()=>[scalar('tx'),scalar('ty'),scalar('sx',1,-8,8),scalar('sy',1,-8,8),scalar('rot',0,-3600,3600),f('px',.5),f('py',.5)];
const blending=()=>choose('mode','over',['over','add','screen','max','multiply','subtract']);
const node=(label,cat,inputs,params)=>({label,cat,in:inputs,params});
export const NODE_CONTRACT={
 Shape:node('Silhouette','source',[],[...position(),choose('shape','circle',['circle','ring','square','diamond','polygon','star','shard','crescent','cross']),scalar('size',13,0,256),f('size2',.4),count('points',6,32,3),scalar('rot',0,-3600,3600),scalar('aspect',1,.01,16),scalar('stroke',0,0,128),f('falloff',.25),gain()]),
 Arc:node('Swept ribbon','source',[],[...position(),scalar('radius',22,0,256),scalar('thick',6,0,128),scalar('start',-100,-3600,3600),scalar('sweep',220,-720,720),f('head',1),scalar('tail',1,.001,4),scalar('taper',1,0,8),scalar('aspect',1,.01,16),scalar('rot',0,-3600,3600),gain()]),
 Stroke:node('Bezier trail','source',[],[...curve(),f('from'),f('to',1),flag('span',true),scalar('width',4,0,128),f('taper',.7),f('vA',.4),f('vM',1),f('vB',.8),gain()]),
 Spike:node('Tapered ray','source',[],[f('x0',.2),f('y0',.7),f('x1',.8),f('y1',.25),f('grow',1),scalar('width',7,0,128),f('taper',1),scalar('taperPow',1,.01,10),f('base',.3),f('tip',1),scalar('facet',.15,-1,1),f('ridge',.1),scalar('shine',-1,-1,1),f('shineAmp',.2),scalar('shineW',.15,.001,1),gain()]),
 Particles:node('Particle emitter','source',[],[...position(),seed(),count('count',18,256),choose('emit','burst',['burst','stream']),f('start'),f('span',.7),scalar('life',.8,.01,4),f('lifeVar',.2),flag('loop'),choose('area','point',['point','circle','ring','box','line']),scalar('aw',5,0,256),scalar('ah',5,0,256),choose('dirMode','direction',['direction','outward','inward']),scalar('angle',-90,-3600,3600),scalar('spread',140,0,720),scalar('speed',1.3,0,32),f('speedVar',.25),scalar('gravity',.04,-4,4),scalar('drag',.02,0,.99),scalar('ground',0,0,256),f('bounce',.5),scalar('turb',0,0,32),choose('fade','out',['out','flat','inout','flicker']),scalar('bright',1,0,8),f('brightVar',.2),scalar('sizeA',3,0,64),scalar('sizeB',1,0,64),choose('pshape','diamond',['dot','circle','square','diamond','plus','streak']),scalar('stretch',1,0,16)]),
 Lightning:node('Electric branch','source',[],[seed(),count('rate',2,32,0),f('x0',.25),f('y0',.2),f('x1',.75),f('y1',.8),f('grow',1),count('detail',4,7),scalar('jag',.25,0,1),f('branch',.25),f('branchLen',.5),scalar('thick',2,.1,32),gain()]),
 Noise:node('Fractal field','source',[],[seed(),choose('type','smooth',['smooth','cells','ridged']),scalar('scaleX',5,.01,128),scalar('scaleY',5,.01,128),scalar('scrollX',0,-32,32),scalar('scrollY',0,-32,32),count('octaves',3,6),scalar('contrast',1,0,8),scalar('bias',0,-1,1)]),
 Gradient:node('Value ramp','source',[],[...position(),choose('type','radial',['radial','linear','diamond','angular']),scalar('radius',24,.01,512),scalar('aspect',1,.01,16),scalar('angle',0,-3600,3600),scalar('offset',0,-8,8),flag('repeat'),flag('invert')]),
 Checker:node('Tile pattern','source',[],[scalar('size',8,.25,128),scalar('ox'),scalar('oy'),flag('iso'),choose('pattern','checker',['checker','dots']),f('dot',.25),f('a',.25),f('b',.8)]),
 Grid:node('Cell field','source',[],[seed(),scalar('cellW',8,.25,128),scalar('cellH',8,.25,128),scalar('gap',1,0,128),f('gapV'),f('lo',.25),f('hi',.85),scalar('ox'),scalar('oy')]),
 Transform:node('Affine placement','filter',['Image'],transform()),
 Repeat:node('Instance array','filter',['Image'],[seed(),count('count',4,32),flag('centered'),choose('layout','linear',['linear','bezier']),scalar('scale0',1,0,8),scalar('scale1',.5,0,8),scalar('scalePow',1,.01,8),f('scaleStep',.1),f('jitter'),scalar('posX',-1,-1,2),scalar('posY',-1,-1,2),f('px',.5),f('py',.5),...curve().map(q=>({...q,n:'b'+q.n,label:'Curve '+q.n})),scalar('dist',1,.01,8),scalar('dx',5),scalar('dy'),count('delay',0,32,0),scalar('sx',1,-8,8),scalar('sy',1,-8,8),scalar('angle0',0,-3600,3600),scalar('angleStep',15,-3600,3600),scalar('rotMin',0,-3600,3600),scalar('rotMax',0,-3600,3600),blending(),f('fadeStep',.15)]),
 Echo:node('Frame echoes','filter',['Image'],[count('copies',3,12),count('step',1,32),f('decay',.6)]),
 Blur:node('Soft focus','filter',['Image'],[count('radius',2,24,0),count('passes',1,4)]),
 Glow:node('Light bloom','filter',['Image'],[count('radius',2,24,0),scalar('strength',.4,0,8)]),
 Displace:node('Field distortion','filter',['Image','Field'],[choose('mode','dir',['dir','radial','swirl']),scalar('angle',0,-3600,3600),f('cx',.5),f('cy',.5),f('center',.5),scalar('amount',8,-256,256)]),
 Polar:node('Circular projection','filter',['Image'],[f('cx',.5),f('cy',.5),scalar('rIn',0,0,256),scalar('rOut',24,.01,256),scalar('spin',0,-3600,3600),flag('invert')]),
 Pixelate:node('Pixel blocks','filter',['Image'],[count('block',2,64)]),
 Blend:node('Layer composition','combine',['Base','Layer'],[blending(),f('opacity',1)]),
 Mask:node('Coverage mask','combine',['Image','Coverage'],[choose('mode','multiply',['multiply','cutout']),f('strength',1)]),
 Tint:node('Color wash','color',['Image','Coverage'],tintParams()),
 Palette:node('Color ramp','color',['Image'],[colors(),choose('key','alpha',['alpha','luma']),choose('mode','steps',['steps','smooth']),f('cutoff',.02),scalar('shift',0,-1,1),f('opacity',1)]),
 Quantize:node('Nearest swatch','color',['Image'],[colors(),choose('alpha','soft',['soft','hard']),f('threshold',.25)]),
 Output:node('Export surface','output',['Image'],[choose('alpha','soft',['soft','hard']),f('threshold',.15)]),
 Levels:node('Tone remap','color',['Image'],[f('lo'),f('hi',1),scalar('gamma',1,.01,8),count('steps',0,64,0)]),
 Dither:node('Ordered shading','color',['Image'],[choose('pattern','bayer4',['bayer2','bayer4']),count('levels',4,32,2),f('strength',.6)]),
 Outline:node('Edge stroke','filter',['Image','Coverage'],[count('width',1,12),f('threshold',.1),flag('corners',true),choose('mode','outer',['outer','inner']),swatch('color','#b0e7ef')]),
 AuraShell:node('Projected aura','filter',['Shell','Rise'],[f('cx',.5),f('lipY',.55),f('tipY',.1),f('baseY',.9),scalar('radius',20,.01,256),scalar('tilt',.3,.01,2),scalar('flare',.2,-.9,3),choose('range','full',['full','front','rear']),scalar('twist',0,-8,8),scalar('uvX',1,.01,16),scalar('spin',0,-32,32),scalar('riseUV',1,.01,8),scalar('stretch',1,.01,8),f('riseAlpha',.7),scalar('riseCutoff',1,.01,1),f('rearAlpha',.4),f('shade',.3)]),
 Revolve:node('Lathed surface','filter',['Surface','Cap'],[f('cx',.5),f('yTop',.2),f('yBot',.8),scalar('rEnd',10,.01,256),scalar('rMid',20,.01,256),scalar('scale',1,.01,8),scalar('bulgePow',1,.01,8),f('shade',.3),scalar('light',.2,-1,1),scalar('shadePow',1,.01,8),scalar('ratio',.25,.01,2),choose('range','full',['full','front','rear']),scalar('uvX',1,.01,16),scalar('spin',0,-32,32),choose('cap','none',['none','top','bottom'])])
};

// Saved-graph interoperability: omitted values and accepted wire-format tokens.
// Keep public labels/layout; these functional defaults preserve authored playback.
const SAVED_GRAPH_COMPATIBILITY = {
 "Shape": {
  "size": {
   "d": 12
  },
  "points": {
   "d": 5,
   "min": 2
  },
  "falloff": {
   "d": 0
  }
 },
 "Noise": {
  "type": {
   "d": "fbm",
   "opt": [
    "smooth",
    "cells",
    "ridged",
    "fbm"
   ]
  },
  "scaleX": {
   "d": 4,
   "t": "int"
  },
  "scaleY": {
   "d": 4,
   "t": "int"
  },
  "seed": {
   "d": 1
  }
 },
 "Gradient": {
  "type": {
   "d": "linear"
  },
  "angle": {
   "d": 90
  }
 },
 "Particles": {
  "count": {
   "d": 30,
   "max": 600
  },
  "seed": {
   "d": 1
  },
  "span": {
   "d": 1
  },
  "life": {
   "d": 0.5
  },
  "lifeVar": {
   "d": 0.3
  },
  "aw": {
   "d": 8
  },
  "ah": {
   "d": 8
  },
  "dirMode": {
   "d": "fixed",
   "opt": [
    "direction",
    "outward",
    "inward",
    "fixed"
   ]
  },
  "spread": {
   "d": 360
  },
  "speed": {
   "d": 1
  },
  "speedVar": {
   "d": 0.5
  },
  "gravity": {
   "d": 0
  },
  "drag": {
   "d": 0
  },
  "sizeA": {
   "d": 2
  },
  "pshape": {
   "d": "square"
  },
  "bounce": {
   "d": 0.35
  },
  "brightVar": {
   "d": 0
  }
 },
 "Lightning": {
  "x0": {
   "d": 0.5
  },
  "y0": {
   "d": 0.05
  },
  "x1": {
   "d": 0.5
  },
  "y1": {
   "d": 0.95
  },
  "detail": {
   "d": 5
  },
  "jag": {
   "d": 0.35
  },
  "branchLen": {
   "d": 0.35
  },
  "seed": {
   "d": 3
  },
  "thick": {
   "d": 1,
   "t": "int"
  }
 },
 "Arc": {
  "thick": {
   "d": 8
  },
  "start": {
   "d": -150
  },
  "head": {
   "max": 1.5
  },
  "tail": {
   "d": 0.7
  },
  "taper": {
   "d": 1.2
  }
 },
 "Repeat": {
  "count": {
   "d": 6
  },
  "angleStep": {
   "d": 60
  },
  "dx": {
   "d": 0
  },
  "scaleStep": {
   "d": 0,
   "min": -1
  },
  "fadeStep": {
   "d": 0
  },
  "delay": {
   "t": "num"
  },
  "mode": {
   "d": "add"
  },
  "seed": {
   "d": 1
  },
  "layout": {
   "d": "step",
   "opt": [
    "linear",
    "bezier",
    "step"
   ]
  },
  "scale1": {
   "d": 1
  },
  "bx0": {
   "d": 0.5
  },
  "by0": {
   "d": 0.2
  },
  "bx1": {
   "d": 0.5
  },
  "by1": {
   "d": 0.4
  },
  "bx2": {
   "d": 0.5
  },
  "by2": {
   "d": 0.6
  },
  "bx3": {
   "d": 0.5
  },
  "by3": {
   "d": 0.8
  }
 },
 "Blur": {
  "radius": {
   "d": 1
  },
  "passes": {
   "d": 2
  }
 },
 "Glow": {
  "strength": {
   "d": 1
  }
 },
 "Dither": {
  "strength": {
   "d": 1
  }
 },
 "Displace": {
  "amount": {
   "d": 4
  },
  "angle": {
   "d": 90
  }
 },
 "Polar": {
  "rIn": {
   "d": 4
  },
  "rOut": {
   "d": 30
  },
  "invert": {
   "d": true
  }
 },
 "Palette": {
  "colors": {
   "d": [
    "#4a0d12",
    "#a3231b",
    "#e8591c",
    "#ffb030",
    "#fff1b8"
   ]
  },
  "cutoff": {
   "d": 0.1
  },
  "mode": {
   "d": "bands",
   "opt": [
    "steps",
    "smooth",
    "bands"
   ]
  }
 },
 "Tint": {
  "color": {
   "d": "#ffffff"
  }
 },
 "Outline": {
  "color": {
   "d": "#10142e"
  },
  "threshold": {
   "d": 0.5
  },
  "corners": {
   "d": false
  }
 },
 "Spike": {
  "x0": {
   "d": 0.4
  },
  "y0": {
   "d": 0.85
  },
  "x1": {
   "d": 0.6
  },
  "y1": {
   "d": 0.15
  },
  "width": {
   "d": 10
  },
  "base": {
   "d": 0.45
  },
  "tip": {
   "d": 0.8
  },
  "facet": {
   "d": 0.22
  },
  "ridge": {
   "d": 0.12
  },
  "shine": {
   "max": 1.5
  },
  "shineW": {
   "d": 0.1
  },
  "shineAmp": {
   "d": 0.6
  }
 },
 "Checker": {
  "a": {
   "d": 1
  },
  "b": {
   "d": 0
  },
  "dot": {
   "d": 0.35
  }
 },
 "Quantize": {
  "colors": {
   "d": [
    "#be4a2f",
    "#d77643",
    "#ead4aa",
    "#e4a672",
    "#b86f50",
    "#733e39",
    "#3e2731",
    "#a22633",
    "#e43b44",
    "#f77622",
    "#feae34",
    "#fee761",
    "#63c74d",
    "#3e8948",
    "#265c42",
    "#193c3e",
    "#124e89",
    "#0099db",
    "#2ce8f5",
    "#ffffff",
    "#c0cbdc",
    "#8b9bb4",
    "#5a6988",
    "#3a4466",
    "#262b44",
    "#181425",
    "#ff0044",
    "#68386c",
    "#b55088",
    "#f6757a",
    "#e8b796",
    "#c28569"
   ]
  },
  "alpha": {
   "d": "keep",
   "opt": [
    "soft",
    "hard",
    "keep"
   ]
  },
  "threshold": {
   "d": 0.5
  }
 },
 "Grid": {
  "lo": {
   "d": 0.3
  },
  "hi": {
   "d": 1
  },
  "gapV": {
   "d": 0.1
  },
  "seed": {
   "d": 1
  }
 },
 "AuraShell": {
  "baseY": {
   "d": 0.82
  },
  "lipY": {
   "d": 0.49
  },
  "tipY": {
   "d": 0.12
  },
  "radius": {
   "d": 32
  },
  "tilt": {
   "d": 0.32,
   "min": 0
  },
  "flare": {
   "d": 0.04
  },
  "twist": {
   "d": 0.07
  },
  "stretch": {
   "d": 3
  },
  "riseUV": {
   "d": 0.25
  },
  "riseCutoff": {
   "d": 0.9,
   "min": 0,
   "max": 1.6
  },
  "riseAlpha": {
   "d": 0.6
  },
  "shade": {
   "d": 0.25
  },
  "rearAlpha": {
   "d": 0.55
  }
 },
 "Revolve": {
  "yTop": {
   "d": 0.28
  },
  "yBot": {
   "d": 0.75
  },
  "rEnd": {
   "d": 16,
   "min": 0
  },
  "rMid": {
   "d": 20.5,
   "min": 0
  },
  "ratio": {
   "d": 0.75,
   "min": 0
  },
  "uvX": {
   "d": 2
  },
  "cap": {
   "d": "bottom"
  },
  "shade": {
   "d": 0.55
  },
  "shadePow": {
   "d": 0.8
  },
  "light": {
   "d": 0
  }
 },
 "Stroke": {
  "x0": {
   "d": 0.2
  },
  "y0": {
   "d": 0.5
  },
  "x1": {
   "d": 0.4
  },
  "y1": {
   "d": 0.3
  },
  "x2": {
   "d": 0.6
  },
  "y2": {
   "d": 0.7
  },
  "x3": {
   "d": 0.8
  },
  "y3": {
   "d": 0.5
  },
  "width": {
   "d": 2
  },
  "taper": {
   "d": 1
  },
  "vA": {
   "d": 0.6
  },
  "vB": {
   "d": 0.3
  }
 },
 "Output": {
  "alpha": {
   "d": "hard"
  },
  "threshold": {
   "d": 0.5
  }
 }
};
for (const [type,fields] of Object.entries(SAVED_GRAPH_COMPATIBILITY)) {
 for (const param of NODE_CONTRACT[type].params) Object.assign(param,fields[param.n]||{});
}
