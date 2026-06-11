import { ProjectMember } from '../../app';
import { ProjectRole, MemberRole } from '../../../types/app';

export interface ShareModalProps {
  isOpen: boolean;
  members: ProjectMember[];
  membersLoading: boolean;
  shareUsername: string;
  shareRole: MemberRole;
  sharing: boolean;
  error: string | null;
  suggestions: string[];
  callerRole: ProjectRole;
  onClose: () => void;
  onShare: () => void;
  onRemoveMember: (userSub: string) => void;
  onUpdateRole: (userSub: string, newRole: MemberRole) => void;
  onUsernameInput: (value: string) => void;
  onShareRoleChange: (role: MemberRole) => void;
  onSelectSuggestion: (username: string) => void;
}
