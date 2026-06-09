export const HOME_ERRORS = {
  PROJECT_NAME_MISSING: 'Please enter a project name.',
  PROJECT_RENAME_FAILURE: 'Failed to rename project.',
  PROJECT_DELETE_FAILURE: 'Failed to delete project.',
  PROJECT_CREATION_FAILURE: 'Failed to create project.',
  PROJECT_LOAD_FAILURE: 'Failed to load projects.',
} as const;

export const PROJECT_ROLE = {
  OWNER: 'OWNER',
  VIEW: 'VIEW',
  EDIT: 'EDIT',
} as const;
