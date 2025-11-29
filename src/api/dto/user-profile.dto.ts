export interface GroupSummary {
  groupId: string;
  groupName: string; // 新增
  nickname: string;
  lastTransactionDate?: Date;
}

export interface UserProfileResponse {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  email?: string;
  groups: GroupSummary[];
}