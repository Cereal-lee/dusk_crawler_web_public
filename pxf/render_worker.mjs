import {renderFrames} from './engine.mjs';
self.onmessage=event=>{try{const frames=renderFrames(event.data.graph);self.postMessage({frames},frames.map(frame=>frame.buffer));}catch(error){self.postMessage({error:error.message});}};
