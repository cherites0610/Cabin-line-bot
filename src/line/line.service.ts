import { Injectable } from '@nestjs/common';
import {
  Client,
  TextMessage,
  MessageEvent,
  FlexMessage,
  FlexBubble,
} from '@line/bot-sdk';
import { AccountingService } from '../accounting/accounting.service.js';
import { AccountingEntry } from 'src/accounting/dto/accounting-result.dto.js';
import { Transaction } from 'src/accounting/entities/transaction.entity.js';

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

    const isCommandHandled = await this.dispatchCommand(
      text,
      groupId,
      userId,
      replyToken,
    );

    if (!isCommandHandled) {
      await this.handleAiAccounting(text, groupId, userId, replyToken);
    }
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
    };

    if (text.startsWith('叫我')) {
      const nickname = text.replace('叫我', '').trim();
      if (nickname) {
        await this.handleSetNickname(groupId, userId, nickname, replyToken);
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

  private async replyAccountingResult(
    replyToken: string,
    transactions: Transaction[],
  ) {
    const replyText = transactions
      .map((t) => {
        const typeIcon = t.type === 'income' ? '💰 收入' : '💸 支出';
        return `${typeIcon}: ${t.item}\n👤 付款: ${t.payerName}\n💵 金額: ${t.amount}\n🏷️ 分類: ${t.parentCategory} (${t.subCategory})`;
      })
      .join('\n\n');

    await this.client.replyMessage(replyToken, {
      type: 'text',
      text: `✅ 記帳成功！\n\n${replyText}`,
    });
  }

  private async sendDashboard(replyToken: string, groupId: string) {
    const stats = await this.accountingService.getMonthlyStats(groupId);
    const recent = await this.accountingService.getRecentTransactions(groupId);
    const memberStats =
      await this.accountingService.getMemberMonthlyStats(groupId);

    const currentMonth = new Date().getMonth() + 1;
    const balanceColor = stats.balance >= 0 ? '#1DB446' : '#FF334B';

    // 1. 總覽卡片
    const overviewBubble: FlexBubble = {
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${currentMonth}月總覽`,
            weight: 'bold',
            color: '#1DB446',
            size: 'sm',
          },
        ],
        backgroundColor: '#f0fff4',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '本月結餘', size: 'xs', color: '#aaaaaa' },
          {
            type: 'text',
            text: `$${stats.balance}`,
            size: 'xl',
            weight: 'bold',
            color: balanceColor,
            margin: 'md',
          },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: '總收入',
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: `$${stats.income}`,
                    size: 'xs',
                    align: 'end',
                    color: '#1DB446',
                  },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: '總支出',
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: `$${stats.expense}`,
                    size: 'xs',
                    align: 'end',
                    color: '#FF334B',
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    // 2. 最近交易卡片
    const recentRows = recent.map((t) => {
      const isExpense = t.type === 'expense';
      const amountColor = isExpense ? '#FF334B' : '#1DB446';
      const sign = isExpense ? '-' : '+';
      return {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: t.item, size: 'sm', color: '#555555', flex: 2 },
          {
            type: 'text',
            text: `${sign}${t.amount}`,
            size: 'sm',
            color: amountColor,
            align: 'end',
            flex: 1,
          },
        ],
        margin: 'sm',
      };
    });

    const recentBubble: FlexBubble = {
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '最近 5 筆',
            weight: 'bold',
            color: '#555555',
            size: 'sm',
          },
        ],
        backgroundColor: '#f7f7f7',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents:
          recentRows.length > 0
            ? (recentRows as any[])
            : [
                {
                  type: 'text',
                  text: '尚無資料',
                  size: 'sm',
                  color: '#aaaaaa',
                  align: 'center',
                },
              ],
      },
    };

    // 3. 成員支出卡片 (每人一張)
    const memberBubbles: FlexBubble[] = memberStats.map((m) => ({
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: m.payerName,
            weight: 'bold',
            color: '#ffffff',
            size: 'sm',
          },
        ],
        backgroundColor: '#666f86', // 使用不同顏色區分
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '本月個人支出', size: 'xs', color: '#cccccc' },
          {
            type: 'text',
            text: `$${m.total}`,
            size: 'xl',
            weight: 'bold',
            color: '#333333',
            margin: 'md',
          },
        ],
      },
    }));

    // 組合 Carousel
    const flexMessage: FlexMessage = {
      type: 'flex',
      altText: '本月帳務報表',
      contents: {
        type: 'carousel',
        contents: [overviewBubble, recentBubble, ...memberBubbles],
      },
    };

    await this.client.replyMessage(replyToken, flexMessage);
  }

  private async sendHelpMessage(replyToken: string) {
    const guideBubbles: FlexBubble[] = [
      {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📝 基礎記帳',
              weight: 'bold',
              color: '#FFFFFF',
            },
          ],
          backgroundColor: '#00C300',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: '直接輸入對話即可：',
              size: 'xs',
              color: '#aaaaaa',
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f5f5f5',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                {
                  type: 'text',
                  text: '「午餐吃了100元」',
                  size: 'xs',
                  color: '#555555',
                },
                {
                  type: 'text',
                  text: '「買飲料50」',
                  size: 'xs',
                  color: '#555555',
                  margin: 'sm',
                },
                {
                  type: 'text',
                  text: '「搭計程車200」',
                  size: 'xs',
                  color: '#555555',
                  margin: 'sm',
                },
              ],
            },
            {
              type: 'text',
              text: 'AI 會自動分類並記錄。',
              size: 'xxs',
              color: '#cccccc',
              wrap: true,
            },
          ],
        },
      },
      {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '👤 進階與分帳',
              weight: 'bold',
              color: '#FFFFFF',
            },
          ],
          backgroundColor: '#0099FF',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: '設定你的暱稱：',
              size: 'xs',
              color: '#aaaaaa',
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f0f8ff',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                {
                  type: 'text',
                  text: '「叫我 肯恩」',
                  size: 'xs',
                  color: '#0066cc',
                  weight: 'bold',
                },
              ],
            },
            {
              type: 'text',
              text: '指定誰付錢：',
              size: 'xs',
              color: '#aaaaaa',
              margin: 'md',
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f5f5f5',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                {
                  type: 'text',
                  text: '「這餐500元毛付的」',
                  size: 'xs',
                  color: '#555555',
                },
                {
                  type: 'text',
                  text: '「我出100，毛出50」',
                  size: 'xs',
                  color: '#555555',
                  margin: 'sm',
                },
              ],
            },
          ],
        },
      },
      {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '⚙️ 系統指令',
              weight: 'bold',
              color: '#FFFFFF',
            },
          ],
          backgroundColor: '#FF9900',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: '常用指令一覽：',
              size: 'xs',
              color: '#aaaaaa',
            },
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: { type: 'message', label: '📊 查帳', text: '查帳' },
                },
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: { type: 'message', label: '❓ 說明', text: '說明' },
                },
              ],
            },
          ],
        },
      },
    ];

    const flexMessage: FlexMessage = {
      type: 'flex',
      altText: '記帳機器人使用教學',
      contents: {
        type: 'carousel',
        contents: guideBubbles,
      },
    };

    await this.client.replyMessage(replyToken, flexMessage);
  }
}
