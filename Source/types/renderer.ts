import { THEME } from '../constants/renderer/shared';
import { PROJECT_ROLE } from '../constants/renderer/home';

export type LoginTab = 'signin' | 'signup';

export type Theme = typeof THEME[keyof typeof THEME];

export type ProjectRole = typeof PROJECT_ROLE[keyof typeof PROJECT_ROLE];