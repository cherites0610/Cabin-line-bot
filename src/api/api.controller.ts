import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { LineAuthGuard } from '../auth/line-auth.guard.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { UserProfileResponse } from './dto/user-profile.dto.js';
import { GroupAccessGuard } from '../auth/group-access.guard.js';

@Controller()
@UseGuards(LineAuthGuard)
export class ApiController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('me')
  async getMe(@Request() req: any): Promise<UserProfileResponse> {
    const userPayload = req.user;
    const userId = userPayload.sub;

    const groups = await this.accountingService.getUserGroups(userId);

    return {
      userId: userId,
      displayName: userPayload.name,
      pictureUrl: userPayload.picture,
      email: userPayload.email,
      groups: groups,
    };
  }

  @Get('transactions/:groupId')
  @UseGuards(GroupAccessGuard) // 第二層：確認是否有權讀取該 Group
  async getTransactions(
    @Param('groupId') groupId: string,
    @Query('limit') limit: number = 20,
  ) {
    const transactions = await this.accountingService.getRecentTransactions(groupId, limit);
    return { data: transactions };
  }

  @Get('dashboard/:groupId')
  @UseGuards(GroupAccessGuard) // 第二層
  async getDashboard(@Param('groupId') groupId: string) {
    const stats = await this.accountingService.getMonthlyStats(groupId);
    const memberStats = await this.accountingService.getMemberMonthlyStats(groupId);
    const groupName = await this.accountingService.getGroupName(groupId); // 一併回傳群組名

    return {
      groupName,
      overview: stats,
      members: memberStats,
    };
  }
}