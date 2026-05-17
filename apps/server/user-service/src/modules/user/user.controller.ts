import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  CreateUserProfileRequest,
  GetUserProfileByAccountIdRequest,
  UpdateUserProfileRequest,
  UserProfile,
} from '@web-rtc-nest/contracts';
import { UserService } from './user.service';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @GrpcMethod('UserService', 'CreateProfile')
  createProfile(request: CreateUserProfileRequest): Promise<UserProfile> {
    return this.userService.createProfile(request);
  }

  @GrpcMethod('UserService', 'GetProfileByAccountId')
  getProfileByAccountId(request: GetUserProfileByAccountIdRequest): Promise<UserProfile> {
    return this.userService.getProfileByAccountId(request);
  }

  @GrpcMethod('UserService', 'UpdateProfile')
  updateProfile(request: UpdateUserProfileRequest): Promise<UserProfile> {
    return this.userService.updateProfile(request);
  }
}
