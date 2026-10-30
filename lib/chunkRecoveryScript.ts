import { CHUNK_ERROR, CHUNK_FILE, CHUNK_HELD_POLL_MS, CHUNK_PROBE_MS, CHUNK_RELOAD_GUARD_MS, CHUNK_RELOAD_KEY, STATIC_FILE } from "@/lib/chunkRecovery"

/**
 * lib/chunkRecovery's early script, for the root layout: it runs before the
 * app does, so a failure while the app itself loads is caught too, and it is
 * the page's one probe (window.__ocChunk, read by reloadForNewBuild and
 * holdReload). Server-side only: no bundle carries it.
 *
 * - A <script> or stylesheet of the app's that fails, or a chunk error nobody
 *   caught, asks reloadIfGone with the file it names.
 * - One that fails before the page's load event is a boot file: the page can't
 *   run without it. If the probe finds it there after all (2xx: the network
 *   dropped it and is back), that reloads too, once nothing is held (CR-82).
 *   After load, a failed file is a lazy piece's, which says so in its place.
 * - reloadIfGone: HEAD the file, never from the cache, for CHUNK_PROBE_MS at
 *   most (a server that won't answer HEAD, 405, is asked with a GET whose
 *   body is dropped as its headers come); only a 404 or a 410 (the build is
 *   gone) reloads. No network (the
 *   device offline, or no answer at all), a slow answer or the file there
 *   after all: the page stays. One probe per file at a time.
 * - The reload: once per CHUNK_RELOAD_GUARD_MS (sessionStorage), and only
 *   while nothing is held (window.__ocChunk.held); held, it looks again every
 *   CHUNK_HELD_POLL_MS and reloads once nothing is.
 */
export const CHUNK_RECOVERY_SCRIPT = `(function(){
var w=window,K=${JSON.stringify(CHUNK_RELOAD_KEY)},G=${CHUNK_RELOAD_GUARD_MS},T=${CHUNK_PROBE_MS},P=${CHUNK_HELD_POLL_MS},held=[],asking={},waiting=0;
function busy(){for(var i=0;i<held.length;i++){try{if(held[i]())return true}catch(e){}}return false}
function reload(){try{var t=+sessionStorage.getItem(K)||0;if(Date.now()-t<G)return false;sessionStorage.setItem(K,String(Date.now()))}catch(e){}location.reload();return true}
function whenFree(){if(!busy())return reload();if(!waiting)waiting=setInterval(function(){if(busy())return;clearInterval(waiting);waiting=0;reload()},P);return false}
function answer(url){if(!url||navigator.onLine===false||typeof fetch!=="function")return Promise.resolve(0);if(asking[url])return asking[url];
var c=typeof AbortController==="function"?new AbortController():null,timer=0;
var late=new Promise(function(r){timer=setTimeout(function(){if(c)c.abort();r(0)},T)});
function ask(m){return fetch(url,{method:m,cache:"no-store",credentials:"same-origin",signal:c?c.signal:undefined}).then(function(r){if(r.body&&r.body.cancel)r.body.cancel().catch(function(){});return r.status})}
var asked=ask("HEAD").then(function(s){return s===405?ask("GET"):s}).catch(function(){return 0});
return asking[url]=Promise.race([asked,late]).then(function(s){clearTimeout(timer);delete asking[url];return s})}
function urlOf(r){var m=${CHUNK_FILE}.exec(String((r&&(r.request||r.message))||r||""));return m?m[0]:null}
function reloadIfGone(url,boot){return answer(url).then(function(s){return s===404||s===410||(boot&&s>199&&s<300)?whenFree():false})}
var booted=document.readyState==="complete";w.addEventListener("load",function(){booted=true});
w.__ocChunk={reloadIfGone:reloadIfGone,urlOf:urlOf,held:held};
w.addEventListener("error",function(e){var t=e.target,b=${STATIC_FILE};if(t&&((t.tagName==="SCRIPT"&&b.test(t.src||""))||(t.tagName==="LINK"&&t.rel==="stylesheet"&&b.test(t.href||""))))reloadIfGone(t.src||t.href,!booted)},true);
w.addEventListener("unhandledrejection",function(e){var r=e.reason;if(${CHUNK_ERROR}.test(String((r&&(r.name+" "+r.message))||r||"")))reloadIfGone(urlOf(r))})
})();`
