const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('bayes', {
  sessions: {
    list: () => call('session:list'),
    load: (id) => call('session:load', id),
    save: (session) => call('session:save', session),
    remove: (id) => call('session:delete', id),
    exportFile: (session) => call('session:exportFile', session),
    importFile: () => call('session:importFile')
  },
  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', patch)
  },
  ai: {
    query: (payload) => call('ai:query', payload),
    search: (payload) => call('ai:search', payload),
    extract: (payload) => call('ai:extract', payload),
    alternatives: (payload) => call('ai:alternatives', payload),
    openQuestions: (payload) => call('ai:openQuestions', payload),
    parseLink: (payload) => call('ai:parseLink', payload),
    parseText: (payload) => call('ai:parseText', payload)
  },
  report: {
    markdown: (payload) => call('report:markdown', payload),
    pdf: (payload) => call('report:pdf', payload)
  },
  app: {
    openExternal: (url) => call('app:openExternal', url),
    revealPath: (p) => call('app:revealPath', p),
    version: () => call('app:version')
  }
});
