import './styles/design-system.css';
import './styles/base.css';
import './styles/topbar.css';
import './styles/library.css';
import './styles/menu.css';
import './styles/editor.css';
import './styles/prompter.css';
import './styles/modal.css';

import * as scriptsApi from './storage/scripts.js';
import { route, notFound, navigate, start } from './lib/router.js';
import { renderLibrary } from './views/library.js';
import { renderEditor } from './views/editor.js';
import { renderPrompter } from './views/prompter.js';
import { checkForUpdate } from './lib/version.js';
import { showUpdatePopup } from './views/update-popup.js';

if (import.meta.env.DEV) {
  window.__storage = scriptsApi;
}

const root = document.getElementById('app');

route('/', () => renderLibrary(root));
route('/editor/:id', (params) => renderEditor(root, params));
route('/prompter/:id', (params) => renderPrompter(root, params));
notFound(() => navigate('/', { replace: true }));

start();

const updateInfo = checkForUpdate();
if (updateInfo.isUpdate) {
  showUpdatePopup({ previousVersion: updateInfo.previousVersion });
}
