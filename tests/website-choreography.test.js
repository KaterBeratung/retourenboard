import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const previousDocument=globalThis.document,previousWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;try{site=await import('../website/dist/site.js');}finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}

const css=readFileSync('website/src/site.css','utf8'),html=readFileSync('website/src/index.html','utf8'),main=readFileSync('website/src/main.ts','utf8');
const start=css.indexOf('/* Choreography:'),end=css.indexOf('html[data-site-motion=reduce],html[data-site-motion=reduce] *,');
assert.ok(start>0&&end>start,'choreography block is present before the reduced-motion rules');
const block=css.slice(start,end);

test('the built stylesheet carries the choreography',()=>{
 assert.equal(readFileSync('website/dist/site.css','utf8'),css);
});

test('every choreography rule only applies under normal motion or the running scene',()=>{
 const rules=block.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('/*')&&!line.startsWith('@keyframes'));
 assert.ok(rules.length>100,'the block holds the scenes');
 for(const rule of rules){
  const inner=/^@(?:supports|media)[^{]*\{/.test(rule)?rule.replace(/^@(?:supports|media)[^{]*\{/,''):rule;
  assert.match(inner,/^html\[data-(?:site|scene)-motion=(?:normal|play)\]/,`rule must be gated by motion: ${rule.slice(0,90)}`);
 }
});

test('keyframes are defined once and used, and nothing keeps a held end state except the two page-level sweeps',()=>{
 const names=['chip-pop','soft-ring','wipe-in','check-draw','check-loop','fan-out','slide-in','line-grow','led-blink','packet-run','live-ping','text-shine','progress-grow'];
 for(const name of names){
  assert.equal(css.split(`@keyframes ${name}{`).length-1,1,`${name} defined once`);
  assert.ok(new RegExp(`animation:[^;}]*\\b${name}\\b`).test(block),`${name} is used`);
 }
 assert.equal(/\bforwards\b/.test(block),false,'held end states would fight hover transitions');
 const held=[...block.matchAll(/animation:([^;}]*)\bboth\b/g)].map(match=>match[1].trim().split(/\s+/)[0]);
 assert.deepEqual([...new Set(held)].sort(),['progress-grow','text-shine']);
});

test('hover-owned animations are not reused for the reveal, so leaving a card never replays a scene',()=>{
 for(const name of ['feature-draw','message-pop','icon-scan','surface-sheen'])assert.equal(block.includes(`animation:${name}`),false,name);
 assert.equal(/\.chat-bubble(?![>\w-])[^{]*\{[^}]*animation/.test(block),false,'chat bubble keeps its hover animation');
 assert.equal(block.includes('.scan-focus::after{animation'),false);
 assert.equal(/\.feature-icon svg[^{]*\{[^}]*animation/.test(block),false);
});

test('the reading-progress line needs scroll timelines and never shows in print',()=>{
 assert.match(block,/@supports\(animation-timeline:scroll\(\)\)\{html\[data-site-motion=normal\]::after\{[^}]*animation-timeline:scroll\(root block\)/);
 assert.match(block,/@media print\{html\[data-site-motion=normal\]::after\{display:none\}\}/);
 assert.match(block,/pointer-events:none/);
});

test('the headline glint keeps the text readable in print and forced colors and follows the theme',()=>{
 assert.match(block,/@supports\(background-clip:text\)\{html\[data-site-motion=normal\] \.hero h1>span\{[^}]*color:transparent/);
 assert.match(block,/@media print,\(forced-colors:active\)\{html\[data-site-motion=normal\] \.hero h1>span\{background:none;color:var\(--green\);-webkit-text-fill-color:currentColor;animation:none\}\}/);
 assert.ok(css.split('--shine:').length-1>=3,'a glint color exists for the light theme and both dark token sets');
});

test('hero decoration only runs while the scene is playing',()=>{
 assert.match(block,/html\[data-site-motion=normal\] \.hero-badge \.live-dot\{[^}]*animation-play-state:paused\}/);
 assert.match(block,/html\[data-site-motion=normal\] \.scene-pill-scan>\.site-icon:last-child path\{[^}]*animation-play-state:paused\}/);
 assert.match(block,/html\[data-scene-motion=play\] :is\(\.hero-badge \.live-dot,\.scene-pill-scan>\.site-icon:last-child path\)\{animation-play-state:running\}/);
});

test('grid neighbours are staggered and the staggered card children follow the same offset',()=>{
 assert.match(block,/\.features>\.feature:nth-child\(odd\):not\(\.feature-lead\)\{--stagger:110ms\}/);
 assert.match(block,/\.features>\.feature\[data-reveal-state=visible\]\{animation-delay:var\(--stagger,0ms\)\}/);
 assert.ok(css.includes('.feature[data-reveal-state=visible]>:is(.feature-top,h3,p){animation:detail-arrive 550ms var(--ease) var(--stagger,0ms) both}'));
 assert.ok(css.includes('.feature[data-reveal-state=visible]>h3{animation-delay:calc(var(--stagger,0ms) + 70ms)}'));
 assert.ok(css.includes('.feature[data-reveal-state=visible]>p{animation-delay:calc(var(--stagger,0ms) + 140ms)}'));
});

test('the benefit strip reveals like the sections and the demo scenes wait for their section',()=>{
 assert.match(html,/<div class="benefit-strip" data-reveal>/);
 assert.match(block,/\.benefit-strip\[data-reveal-state=visible\] \.container>span\{animation:detail-arrive/);
 for(const selector of ['.workflow-layout[data-reveal-state=visible] [data-workflow-panel]:not([hidden]) .workflow-message','.ownership-grid[data-reveal-state=visible] .server-connection','.terminal[data-reveal-state=visible] #install-command','.faq-section[data-reveal-state=visible] .faq details','.closing[data-reveal-state=visible] :is(.eyebrow,h2,.button)'])assert.ok(block.includes(selector),selector);
});

function heroFixture({fine=true,reduced=false,box={left:100,top:50,width:800,height:400}}={}){
 const listeners={},props={},frames=[];
 const stage={addEventListener:(name,fn)=>{listeners[name]=fn;},getBoundingClientRect:()=>box};
 const scene={style:{setProperty:(name,value)=>{props[name]=value;}}};
 const page={querySelector:selector=>selector==='.hero-stage'?stage:selector==='.hero-scene'?scene:null};
 const query={matches:reduced,addEventListener:(name,fn)=>{listeners['query:'+name]=fn;}},pointer={matches:fine};
 site.bindHeroDepth(page,query,pointer,fn=>frames.push(fn));
 return {listeners,props,frames,query,pointer,flush(){while(frames.length)frames.shift()();}};
}

test('the hero scene leans toward the pointer and settles when it leaves',()=>{
 const f=heroFixture();
 f.listeners.pointermove({clientX:500,clientY:250,pointerType:'mouse'});f.flush();
 assert.deepEqual([f.props['--depth-x'],f.props['--depth-y']],['0.000','0.000']);
 f.listeners.pointermove({clientX:900,clientY:50,pointerType:'mouse'});f.flush();
 assert.deepEqual([f.props['--depth-x'],f.props['--depth-y']],['1.000','-1.000']);
 f.listeners.pointermove({clientX:5000,clientY:-900,pointerType:'pen'});f.flush();
 assert.deepEqual([f.props['--depth-x'],f.props['--depth-y']],['1.000','-1.000'],'values are clamped to the stage');
 f.listeners.pointerleave();f.flush();
 assert.deepEqual([f.props['--depth-x'],f.props['--depth-y']],['0.000','0.000']);
});

test('pointer moves are coalesced into one paint per frame',()=>{
 const f=heroFixture();
 for(const x of [150,300,450,600])f.listeners.pointermove({clientX:x,clientY:250,pointerType:'mouse'});
 assert.equal(f.frames.length,1);f.flush();assert.equal(f.props['--depth-x'],'0.250');
});

test('touch, coarse pointers and reduced motion never move the scene, and reduced motion resets it',()=>{
 const touch=heroFixture();touch.listeners.pointermove({clientX:900,clientY:50,pointerType:'touch'});assert.equal(touch.frames.length,0);
 const coarse=heroFixture({fine:false});coarse.listeners.pointermove({clientX:900,clientY:50,pointerType:'mouse'});assert.equal(coarse.frames.length,0);
 const reduced=heroFixture({reduced:true});reduced.listeners.pointermove({clientX:900,clientY:50,pointerType:'mouse'});assert.equal(reduced.frames.length,0);
 const live=heroFixture();live.listeners.pointermove({clientX:900,clientY:300,pointerType:'mouse'});live.flush();assert.equal(live.props['--depth-x'],'1.000');
 live.query.matches=true;live.listeners['query:change']();live.flush();assert.equal(live.props['--depth-x'],'0.000');
 const empty=heroFixture({box:{left:0,top:0,width:0,height:0}});empty.listeners.pointermove({clientX:10,clientY:10,pointerType:'mouse'});assert.equal(empty.frames.length,0);
});

test('without a hero stage the depth binding does nothing',()=>{
 assert.doesNotThrow(()=>site.bindHeroDepth({querySelector:()=>null},{matches:false,addEventListener(){}},{matches:true}));
});

test('replaying an animation restarts it through a style reset',()=>{
 const calls=[],element={style:{set animation(value){calls.push('set:'+value);},removeProperty:name=>calls.push('remove:'+name)},get offsetWidth(){calls.push('reflow');return 0;}};
 site.replayAnimation(element);assert.deepEqual(calls,['set:none','reflow','remove:animation']);
 assert.doesNotThrow(()=>site.replayAnimation(null));
});

test('the page script wires the depth, the typed command restart and the copy confirmation',()=>{
 assert.match(main,/bindHeroDepth\(document,motion,window\.matchMedia\('\(hover: hover\) and \(pointer: fine\)'\)\);/);
 assert.match(main,/command\.textContent = install \? [^;]+;\s*replayAnimation\(command\);/);
 assert.match(main,/copy\.dataset\.copied='true';window\.setTimeout\(\(\)=>\{delete copy\.dataset\.copied;\},900\);/);
});
