const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('corvid', {
  info: () => ipcRenderer.invoke('app:info'),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  saveConfigSync: (cfg) => ipcRenderer.sendSync('config:save-sync', cfg),
  saveImage: (name, data) => ipcRenderer.invoke('image:save', { name, data }),
  pushState: (state) => ipcRenderer.send('state:push', state),
  setHotkeys: (bindings) => ipcRenderer.invoke('hotkeys:set', bindings),
  suspendHotkeys: () => ipcRenderer.invoke('hotkeys:suspend'),
  resumeHotkeys: () => ipcRenderer.invoke('hotkeys:resume'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  openImagesFolder: () => ipcRenderer.invoke('images:open'),
  exportAvatar: (cfg) => ipcRenderer.invoke('avatar:export', cfg),
  onHotkey: (cb) => listen('hotkey', cb),
  onObsClients: (cb) => listen('obs:clients', cb),
});
