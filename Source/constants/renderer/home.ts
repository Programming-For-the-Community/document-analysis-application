import { DisplayError, ShowErrorType } from "../../types/renderer";

export const homeDisplayErrors:Record<string, DisplayError> = {
    'PROJECT_NAME_MISSING': ['rename-project-error', 'Please enter a project name.'],
    'PROJECT_RENAME_FAILURE': ['rename-project-error','Failed to rename project.'],
    'NEW_PROJECT_NAME_MISSING': ['new-project-error', 'Please enter a project name.'],
    'NEW_PROJECT_CREATION_FAILURE': ['new-project-error', 'Failed to create project.'],
    'PROJECT_DELETE_FAILURE': ['delete-project-error', 'Failed to delete project.']
}

export const homeShowErrors: Record<string, ShowErrorType> = {
    'PROJECT_ERROR': ['projects-loading', 'projects-error', 'projects-error-msg']
}