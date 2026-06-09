import { PROJECT_ROLES } from '../constants/app';

export type ProjectRole = (typeof PROJECT_ROLES)[keyof typeof PROJECT_ROLES]; // Read keys from PROJECT_ROLES into a type

export type  MemberRole = Exclude<ProjectRole, typeof PROJECT_ROLES['OWNER']>; // Define a type for member roles by excluding the OWNER role from ProjectRole