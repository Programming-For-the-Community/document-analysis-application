import { Theme } from "../classes/theme";
import { Projects } from "../classes/projects";
import { parseJwt } from "../../utils/renderer/parseJwt";
import { homeButtonListeners } from "../listeners/home/buttons";
import { newProjectListeners } from "../listeners/home/newProject";
import { renameProjectListeners } from "../listeners/home/renameProject";
import { deleteProjectListeners } from "../listeners/home/deleteProject";


async function init(): Promise<void> {
  Theme.initTheme();
  [...renameProjectListeners, ...deleteProjectListeners, ...newProjectListeners, ...homeButtonListeners].forEach((initListener) => initListener());
  const tokens = await window.electron.auth.getTokens();
  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = String(payload['email'] ?? '');

  void Theme.syncThemeFromServer();
  await Projects.loadProjects();
}

void init();
