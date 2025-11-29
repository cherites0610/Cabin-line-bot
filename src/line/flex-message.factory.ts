import { FlexMessage, FlexBubble, FlexBox } from '@line/bot-sdk';
import { Transaction } from '../accounting/entities/transaction.entity.js';

export class FlexMessageFactory {
  static createAccountingSuccess(transactions: Transaction[]): FlexMessage {
    const totalAmount = transactions.reduce((sum, t) => {
        return t.type === 'expense' ? sum + Number(t.amount) : sum - Number(t.amount); // 這裡只計算當下總額顯示用
    }, 0);

    const transactionRows: FlexBox[] = transactions.map((t) => {
      const isExpense = t.type === 'expense';
      const color = isExpense ? '#ff334b' : '#1db446';
      const icon = isExpense ? '💸' : '💰';
      const sign = isExpense ? '-' : '+';

      return {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: t.item, size: 'sm', color: '#555555', flex: 2, weight: 'bold' },
              { type: 'text', text: `${sign}${t.amount}`, size: 'sm', color: color, align: 'end', flex: 1, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: `${icon} ${t.parentCategory} | ${t.subCategory}`, size: 'xs', color: '#aaaaaa', flex: 3 },
              { type: 'text', text: `👤 ${t.payerName}`, size: 'xs', color: '#aaaaaa', align: 'end', flex: 2 }
            ]
          }
        ]
      };
    });

    const bubble: FlexBubble = {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '✅ 記帳成功', weight: 'bold', color: '#ffffff', size: 'md' }
        ],
        backgroundColor: '#1DB446'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '已新增以下紀錄：', size: 'xs', color: '#aaaaaa', margin: 'none' },
          { type: 'separator', margin: 'md' },
          ...transactionRows,
          { type: 'separator', margin: 'lg' },
           {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: '本次合計', size: 'xs', color: '#555555' },
              { type: 'text', text: `$${Math.abs(totalAmount)}`, size: 'sm', weight: 'bold', align: 'end', color: '#333333' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
           { type: 'text', text: '輸入「刪除」可復原上一筆', size: 'xxs', color: '#cccccc', align: 'center' }
        ]
      }
    };

    return {
      type: 'flex',
      altText: '記帳成功通知',
      contents: bubble
    };
  }

  static createDashboard(stats: any, recent: any[], memberStats: any[], groupId: string): FlexMessage {
    const currentMonth = new Date().getMonth() + 1;
    const balanceColor = stats.balance >= 0 ? '#1DB446' : '#FF334B';
    const domain = process.env.APP_DOMAIN || 'http://localhost:3000';

    const overviewBubble: FlexBubble = {
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${currentMonth}月總覽`, weight: 'bold', color: '#1DB446', size: 'sm' }
        ],
        backgroundColor: '#f0fff4'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '本月結餘', size: 'xs', color: '#aaaaaa' },
          { type: 'text', text: `$${stats.balance}`, size: 'xl', weight: 'bold', color: balanceColor, margin: 'md' },
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
                  { type: 'text', text: '總收入', size: 'xs', color: '#555555' },
                  { type: 'text', text: `$${stats.income}`, size: 'xs', align: 'end', color: '#1DB446' }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '總支出', size: 'xs', color: '#555555' },
                  { type: 'text', text: `$${stats.expense}`, size: 'xs', align: 'end', color: '#FF334B' }
                ]
              }
            ]
          },
          { type: 'separator', margin: 'lg' },
          {
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
                type: 'uri',
                label: '查看完整歷史 🔗',
                uri: `${domain}/web/history/${groupId}`
            },
            margin: 'sm'
          }
        ]
      }
    };

    const recentRows = recent.map((t) => {
      const isExpense = t.type === 'expense';
      const amountColor = isExpense ? '#FF334B' : '#1DB446';
      const sign = isExpense ? '-' : '+';
      return {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: t.item, size: 'sm', color: '#555555', flex: 2 },
          { type: 'text', text: `${sign}${t.amount}`, size: 'sm', color: amountColor, align: 'end', flex: 1 }
        ],
        margin: 'sm'
      };
    });

    const recentBubble: FlexBubble = {
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '最近 5 筆', weight: 'bold', color: '#555555', size: 'sm' }
        ],
        backgroundColor: '#f7f7f7'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: recentRows.length > 0 ? (recentRows as any[]) : [
          { type: 'text', text: '尚無資料', size: 'sm', color: '#aaaaaa', align: 'center' }
        ]
      }
    };

    const memberBubbles: FlexBubble[] = memberStats.map((m) => ({
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: m.payerName, weight: 'bold', color: '#ffffff', size: 'sm' }
        ],
        backgroundColor: '#666f86'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '本月個人支出', size: 'xs', color: '#cccccc' },
          { type: 'text', text: `$${m.total}`, size: 'xl', weight: 'bold', color: '#333333', margin: 'md' }
        ]
      }
    }));

    return {
      type: 'flex',
      altText: '本月帳務報表',
      contents: {
        type: 'carousel',
        contents: [overviewBubble, recentBubble, ...memberBubbles]
      }
    };
  }

  static createHelp(): FlexMessage {
    const guideBubbles: FlexBubble[] = [
      {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '📝 基礎記帳', weight: 'bold', color: '#FFFFFF' }
          ],
          backgroundColor: '#00C300'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '直接輸入對話即可：', size: 'xs', color: '#aaaaaa' },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f5f5f5',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                { type: 'text', text: '「午餐吃了100元」', size: 'xs', color: '#555555' },
                { type: 'text', text: '「買飲料50」', size: 'xs', color: '#555555', margin: 'sm' },
                { type: 'text', text: '「搭計程車200」', size: 'xs', color: '#555555', margin: 'sm' }
              ]
            },
            { type: 'text', text: 'AI 會自動分類並記錄。', size: 'xxs', color: '#cccccc', wrap: true }
          ]
        }
      },
      {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '👤 進階與分帳', weight: 'bold', color: '#FFFFFF' }
          ],
          backgroundColor: '#0099FF'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '設定你的暱稱：', size: 'xs', color: '#aaaaaa' },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f0f8ff',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                { type: 'text', text: '「叫我 肯恩」', size: 'xs', color: '#0066cc', weight: 'bold' }
              ]
            },
            { type: 'text', text: '指定誰付錢：', size: 'xs', color: '#aaaaaa', margin: 'md' },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#f5f5f5',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                { type: 'text', text: '「這餐500元毛付的」', size: 'xs', color: '#555555' },
                { type: 'text', text: '「我出100，毛出50」', size: 'xs', color: '#555555', margin: 'sm' }
              ]
            }
          ]
        }
      },
      {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '⚙️ 系統指令', weight: 'bold', color: '#FFFFFF' }
          ],
          backgroundColor: '#FF9900'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '常用指令一覽：', size: 'xs', color: '#aaaaaa' },
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: { type: 'message', label: '📊 查帳', text: '查帳' }
                },
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: { type: 'message', label: '❓ 說明', text: '說明' }
                },
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: { type: 'message', label: '🗑️ 刪除', text: '刪除' }
                }
              ]
            }
          ]
        }
      }
    ];

    return {
      type: 'flex',
      altText: '記帳機器人使用教學',
      contents: {
        type: 'carousel',
        contents: guideBubbles
      }
    };
  }
}