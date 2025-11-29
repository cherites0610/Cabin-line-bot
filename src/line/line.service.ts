import { Injectable } from '@nestjs/common';
import {
  Client,
  TextMessage,
  MessageEvent,
} from '@line/bot-sdk';
import { AccountingService } from '../accounting/accounting.service.js';
import { Transaction } from 'src/accounting/entities/transaction.entity.js';
import { FlexMessageFactory } from './flex-message.factory.js';

@Injectable()
export class LineService {
  private client: Client;

  constructor(private readonly accountingService: AccountingService) {
    this.client = new Client({
      channelAccessToken: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN!,
      channelSecret: process.env.LINE_BOT_CHANNEL_SECRET!,
    });
  }

  async handleEvents(events: any[]): Promise<void> {
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        await this.handleTextMessage(
          event as MessageEvent & { message: TextMessage },
        );
      }
    }
  }

  private async handleTextMessage(
    event: MessageEvent & { message: TextMessage },
  ) {
    const { replyToken, source, message } = event;
    const text = message.text.trim();
    const groupId = source.type === 'group' ? source.groupId : source.userId;
    const userId = source.userId || 'unknown_user';

    if (!groupId) return;

    // 1. 優先處理指令 (查帳、說明、刪除、叫我...)
    // 這些指令可能不包含數字，所以要先跑
    const isCommandHandled = await this.dispatchCommand(
      text,
      groupId,
      userId,
      replyToken,
    );
    if (isCommandHandled) return;

    if (!/\d/.test(text)) {
      return;
    }

    // 3. 通過過濾，進入 AI 分析
    await this.handleAiAccounting(text, groupId, userId, replyToken);
  }

  private async dispatchCommand(
    text: string,
    groupId: string,
    userId: string,
    replyToken: string,
  ): Promise<boolean> {
    const commandMap: Record<string, () => Promise<void>> = {
      查帳: () => this.sendDashboard(replyToken, groupId),
      說明: () => this.sendHelpMessage(replyToken),
      刪除: () => this.handleDeleteLast(replyToken, groupId),
      刪除上一筆: () => this.handleDeleteLast(replyToken, groupId),
    };

    if (text.startsWith('叫我')) {
      const nickname = text.replace('叫我', '').trim();
      if (nickname) {
        await this.handleSetNickname(groupId, userId, nickname, replyToken);
        return true;
      }
    }

    if (text.startsWith('命名')) {
      const name = text.replace('命名', '').trim();
      if (name) {
        await this.accountingService.setGroupName(groupId, name);
        await this.client.replyMessage(replyToken, {
          type: 'text',
          text: `🏷️ 群組名稱已更新為：「${name}」`
        });
        return true;
      }
    }

    const handler = commandMap[text];
    if (handler) {
      await handler();
      return true;
    }

    return false;
  }

  private async handleSetNickname(
    groupId: string,
    userId: string,
    nickname: string,
    replyToken: string,
  ) {
    await this.accountingService.setNickname(groupId, userId, nickname);
    await this.client.replyMessage(replyToken, {
      type: 'text',
      text: `🆗 沒問題，以後你就是「${nickname}」了！`,
    });
  }

  private async handleAiAccounting(
    text: string,
    groupId: string,
    userId: string,
    replyToken: string,
  ) {
    const result = await this.accountingService.analyzeMessage(groupId, text);

    if (!result || !result.isAccounting || result.entries.length === 0) {
      return;
    }

    const savedTransactions: Transaction[] = [];

    for (const entry of result.entries) {
      const tx = await this.accountingService.saveTransaction(
        groupId,
        userId,
        entry,
      );
      savedTransactions.push(tx);
    }

    await this.replyAccountingResult(replyToken, savedTransactions);
  }

  private async replyAccountingResult(replyToken: string, transactions: Transaction[]) {
    const flexMessage = FlexMessageFactory.createAccountingSuccess(transactions);
    await this.client.replyMessage(replyToken, flexMessage);
  }

  private async handleDeleteLast(replyToken: string, groupId: string) {
    const deletedTx =
      await this.accountingService.deleteLastTransaction(groupId);

    if (!deletedTx) {
      await this.client.replyMessage(replyToken, {
        type: 'text',
        text: '⚠️ 目前沒有任何記帳紀錄可以刪除。',
      });
      return;
    }

    await this.client.replyMessage(replyToken, {
      type: 'text',
      text: `🗑️ 已刪除上一筆紀錄：\n\n${deletedTx.item} $${deletedTx.amount}\n(${deletedTx.payerName} 付款)`,
    });
  }

  private async sendDashboard(replyToken: string, groupId: string) {
    const stats = await this.accountingService.getMonthlyStats(groupId);
    const recent = await this.accountingService.getRecentTransactions(groupId);
    const memberStats = await this.accountingService.getMemberMonthlyStats(groupId);

    const flexMessage = FlexMessageFactory.createDashboard(stats, recent, memberStats, groupId);
    await this.client.replyMessage(replyToken, flexMessage);
  }

  private async sendHelpMessage(replyToken: string) {
    const flexMessage = FlexMessageFactory.createHelp();
    await this.client.replyMessage(replyToken, flexMessage);
  }
}
