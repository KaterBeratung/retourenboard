import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';

const sidebar=await sourceModule("export * from './frontend/src/sidebar-navigation.ts';");

test('area navigation returns to the last accepted list filters and admin section',()=>{
 assert.equal(typeof sidebar.createAreaNavigation,'function');
 const memory=sidebar.createAreaNavigation();assert.deepEqual(memory.destinations(),{workspace:'#overview',admin:'#admin'});
 memory.remember('#returns?scope=open&search=DEMO-SN&reason=Defekt');memory.remember('#admin?section=rules');
 assert.deepEqual(memory.destinations(),{workspace:'#returns?scope=open&search=DEMO-SN&reason=Defekt',admin:'#admin?section=rules'});
 memory.remember('#channel-7');assert.equal(memory.destinations().workspace,'#channel-7');
});

test('account pages and unknown destinations do not replace area bookmarks; account changes can clear them',()=>{
 assert.equal(typeof sidebar.createAreaNavigation,'function');
 const memory=sidebar.createAreaNavigation();memory.remember('#products?search=Monitor');memory.remember('#admin?section=audit');
 for(const destination of ['#account','#content','#unrecognized','https://example.test/','#returns-extra'])memory.remember(destination);
 assert.deepEqual(memory.destinations(),{workspace:'#products?search=Monitor',admin:'#admin?section=audit'});
 memory.clear();assert.deepEqual(memory.destinations(),{workspace:'#overview',admin:'#admin'});
});

test('a removed admin permission falls back to the existing permitted default route',()=>{
 assert.equal(typeof sidebar.createAreaNavigation,'function');
 const memory=sidebar.createAreaNavigation();memory.remember('#admin?section=users');
 assert.equal(memory.destinations(section=>section==='masterdata').admin,'#admin');
 assert.equal(memory.destinations(section=>section==='users').admin,'#admin?section=users');
});

test('the shared area control marks its active area and exposes administration only when allowed',()=>{
 assert.equal(typeof sidebar.renderAreaSwitcher,'function');
 const state={adminPage:false,canAdminAccess:true,workspace:'#returns?search=DEMO',admin:'#admin?section=rules'};
 const markup=String(sidebar.renderAreaSwitcher(state));
 assert.match(markup,/<a[^>]*data-area="workspace"[^>]*aria-current="true"/);assert.match(markup,/href="#returns\?search=DEMO"/);
 assert.match(markup,/<a[^>]*data-area="admin"/);assert.equal((markup.match(/<a\b/g)??[]).length,2);
 const restricted=String(sidebar.renderAreaSwitcher({...state,canAdminAccess:false}));assert.doesNotMatch(restricted,/data-area="admin"|href="#admin/);
 const admin=String(sidebar.renderAreaSwitcher({...state,adminPage:true}));assert.match(admin,/<a[^>]*data-area="admin"[^>]*aria-current="true"/);
 assert.doesNotMatch(admin,/<a[^>]*data-area="workspace"[^>]*aria-current="true"/);
});

test('area link destinations preserve query text without injecting HTML attributes',()=>{
 assert.equal(typeof sidebar.renderAreaSwitcher,'function');
 const markup=String(sidebar.renderAreaSwitcher({adminPage:false,canAdminAccess:true,workspace:'#returns?search="<unsafe>',admin:'#admin'}));
 assert.doesNotMatch(markup,/search="<unsafe>/);assert.match(markup,/&quot;&lt;unsafe&gt;/);
});
