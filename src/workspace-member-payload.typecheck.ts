import type { AddWorkspaceMemberPayload } from './api';

const existingUser: AddWorkspaceMemberPayload = { userId: 42, role: 'viewer' };
const invitation: AddWorkspaceMemberPayload = { email: 'invite@example.com', providerId: 'corp', role: 'admin' };

// @ts-expect-error Workspace member targets are a strict XOR and cannot mix existing-user and invitation fields.
const mixedTarget: AddWorkspaceMemberPayload = {
  userId: 42,
  email: 'invite@example.com',
  providerId: 'corp',
  role: 'viewer'
};

void existingUser;
void invitation;
void mixedTarget;
