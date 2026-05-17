export type UserProfile = {
  id: string;
  accountId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserProfileRequest = {
  accountId: string;
  name: string;
};

export type GetUserProfileByAccountIdRequest = {
  accountId: string;
};

export type UpdateUserProfileRequest = {
  accountId: string;
  name: string;
};
