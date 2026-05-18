export type UserProfile = {
  id: string;
  accountId: string;
  name: string;
  birthDay?: string;
  currency?: string;
  country?: string;
  locale?: string;
  timezone?: string;
  avatarUrl?: string;
  bio?: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type CreateUserProfileRequest = {
  accountId: string;
  name: string;
  birthDay?: string;
  currency?: string;
  country?: string;
  locale?: string;
  timezone?: string;
  avatarUrl?: string;
  bio?: string;
  phoneNumber?: string;
};

export type GetUserProfileByAccountIdRequest = {
  accountId: string;
};

export type UpdateUserProfileRequest = {
  accountId: string;
  name: string;
  birthDay?: string;
  currency?: string;
  country?: string;
  locale?: string;
  timezone?: string;
  avatarUrl?: string;
  bio?: string;
  phoneNumber?: string;
};
