import { Theme } from "../../classes/theme";
import { Projects } from "../../classes/projects";

function logoutButtonListener() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await window.electron.auth.logout();
  });
}

function toggleThemeButtonListener() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => Theme.toggleTheme());
}

function projectsRetryButtonListener() {
  document.getElementById('projects-retry-btn')?.addEventListener('click', () => {
    void Projects.loadProjects();
  });
}

export const homeButtonListeners: Array<() => void> = [
  logoutButtonListener,
  toggleThemeButtonListener,
  projectsRetryButtonListener
];
