import type { BusinessPersona, StaffGrade } from './business';

export interface AuthProfile {
  id: string;
  persona: BusinessPersona;
  displayName: string;
  staffGrade: StaffGrade | null;
  clientId: string | null;
  staffMemberId: string | null;
  contactId: string | null;
}

export interface AuthMe {
  user: { id: string; kind: 'STAFF' | 'CLIENT'; displayName: string; email: string; isFirmAdmin: boolean };
  workspaceId: string;
  profiles: AuthProfile[];
  activeProfileId: string | null;
  passwordMustChange: boolean;
  idleExpiresAt: string;
}
