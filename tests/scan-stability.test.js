import test from 'node:test';
import assert from 'node:assert/strict';
import {createScanSession} from '../dist/public/scan-labels.js';
test('camera requires two consecutive equal readings before returning a serial',async()=>{
 let callback,stops=0;const values=[];
 const session=createScanSession({video:{pause(){},srcObject:null},mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++;}}]})},reader:{async decodeFromStream(stream,video,fn){callback=fn;return {stop(){stops++;}};}},onValue:value=>values.push(value),onError(){}});
 await session.start();const code=value=>({getText:()=>value});
 callback(code('MISREAD1'));assert.deepEqual(values,[]);
 callback(code('00ABC12'));callback(null);callback(code('00ABC12'));assert.deepEqual(values,[]);
 callback(code('00ABC12'));assert.deepEqual(values,['00ABC12']);assert.ok(stops>=2);
 callback(code('LATECODE'));assert.deepEqual(values,['00ABC12']);
});
test('a late stopped camera attachment cannot clear a replacement preview stream',async()=>{
 let finishFirst,number=0;const streams=[{getTracks:()=>[{stop(){}}]},{getTracks:()=>[{stop(){}}]}];
 const video={srcObject:null,pause(){},async play(){},cloneNode(){return {srcObject:null,autoplay:true,muted:true,playsInline:true,pause(){}};}};
 const session=createScanSession({video,mediaDevices:{getUserMedia:async()=>streams[number++]},reader:{decodeFromStream(stream,target){target.srcObject=stream;const controls={stop(){target.srcObject=null;}};return stream===streams[0]?new Promise(resolve=>finishFirst=()=>resolve(controls)):Promise.resolve(controls);}},onValue(){},onError(){}});
 const first=session.start();await new Promise(setImmediate);session.stop();await session.start();assert.equal(video.srcObject,streams[1]);finishFirst();await first;
 assert.equal(video.srcObject,streams[1]);session.stop();assert.equal(video.srcObject,null);
});
