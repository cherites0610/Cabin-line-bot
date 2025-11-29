import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccountingService } from '../accounting/accounting.service.js';

@Injectable()
export class GroupAccessGuard implements CanActivate {
  constructor(private readonly accountingService: AccountingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const params = request.params;
    const groupId = params.groupId;

    if (!user || !user.sub) {
      throw new ForbiddenException('User identity not found');
    }

    if (!groupId) {
      return true; // 如果該 API 不需要 groupId 參數，則略過此檢查
    }

    const hasAccess = await this.accountingService.isUserInGroup(user.sub, groupId);

    if (!hasAccess) {
      throw new ForbiddenException('You are not a member of this group');
    }

    return true;
  }
}