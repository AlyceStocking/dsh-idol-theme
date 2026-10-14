'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yukimiDesktop', Object.freeze({
  mode: process.argv.includes('--idol-settings') ? 'settings' : 'pet',
  panelDrag: (action, origin) => ipcRenderer.send('yukimi:panel-drag', action, origin),
  panel: open => ipcRenderer.send('yukimi:panel', open),
  ready: () => ipcRenderer.invoke('yukimi:ready'),
  onState: listener => {
    if (typeof listener !== 'function') throw new TypeError('A state listener is required');
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('yukimi:state', handler);
    return () => ipcRenderer.removeListener('yukimi:state', handler);
  },
  onLayout: listener => {
    if (typeof listener !== 'function') throw new TypeError('A layout listener is required');
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('yukimi:layout', handler);
    return () => ipcRenderer.removeListener('yukimi:layout', handler);
  },
  setRegions: regions => ipcRenderer.send('yukimi:regions', regions),
  openSession: sessionId => ipcRenderer.send('yukimi:open-session', sessionId),
  shown: ids => ipcRenderer.send('yukimi:shown', ids),
  setPreferences: preferences => ipcRenderer.send('yukimi:preferences', preferences),
  drag: (action, origin) => ipcRenderer.send('yukimi:drag', action, origin),
}));
