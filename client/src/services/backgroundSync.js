// All sync logic is now handled by syncWorker.js in a Web Worker.
// This file is now a stub for compatibility.

export function onSyncEvent() { return () => {}; }
export function downloadMasterData() { return Promise.resolve({}); }
export function syncToServer() { return Promise.resolve(); }
export const syncWhenIdle = () => {};
export const syncWhenOnline = () => {};
export const emitSyncEvent = () => {};
export const syncInProgress = () => false;
