import { useState, useCallback, useRef } from 'react';

import { PROJECT_ROLES } from '../../../constants/app';
import { ProjectMember } from '../../../interfaces/app';
import { MemberRole, ProjectRole } from '../../../types/app';
import { PROJECT_ERRORS } from '../../../constants/renderer/project';
import {
  loadMembers,
  shareUser,
  unshareUser,
  updateMemberRole,
  searchUsers,
} from '../../handlers/project/share';

export function useShareProject(projectId: string, role: ProjectRole) {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [shareUsername, setShareUsernameState] = useState('');
  const [shareRole, setShareRole] = useState<MemberRole>(PROJECT_ROLES.VIEW);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadMembers = useCallback(async () => {
    setMembersLoading(true);
    const { members: m } = await loadMembers(projectId);
    setMembers(m ?? []);
    setMembersLoading(false);
  }, [projectId]);

  const open = useCallback(() => {
    setShareUsernameState('');
    setShareRole('VIEW');
    setError(null);
    setSuggestions([]);
    setIsOpen(true);
    void reloadMembers();
  }, [reloadMembers]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSuggestions([]);
  }, []);

  const share = useCallback(async () => {
    if (!shareUsername.trim()) {
      setError(PROJECT_ERRORS.MISSING_SHARE_USERNAME);
      return;
    }
    setSharing(true);
    setError(null);
    const { error: err } = await shareUser(projectId, shareUsername.trim(), shareRole);
    setSharing(false);
    if (err) {
      setError(err);
      return;
    }
    setShareUsernameState('');
    void reloadMembers();
  }, [projectId, shareUsername, shareRole, reloadMembers]);

  const removeMember = useCallback(
    async (userSub: string) => {
      const { error: err } = await unshareUser(projectId, userSub);
      if (err) {
        setError(err);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.userSub !== userSub));
    },
    [projectId]
  );

  const updateRole = useCallback(
    async (userSub: string, newRole: MemberRole): Promise<boolean> => {
      const { error: err } = await updateMemberRole(projectId, userSub, newRole);
      if (err) {
        setError(err);
        return false;
      }
      setMembers((prev) => prev.map((m) => (m.userSub === userSub ? { ...m, role: newRole } : m)));
      return true;
    },
    [projectId]
  );

  const handleUsernameInput = useCallback((value: string) => {
    setShareUsernameState(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void searchUsers(value).then(setSuggestions);
    }, 250);
  }, []);

  return {
    isOpen,
    members,
    membersLoading,
    shareUsername,
    shareRole,
    sharing,
    error,
    suggestions,
    role,
    open,
    close,
    share,
    removeMember,
    updateRole,
    handleUsernameInput,
    setShareRole,
    setSuggestions,
  };
}
