import { Controller, Get, Param, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from '../accounting/entities/transaction.entity.js';
import { Repository } from 'typeorm';
import express from 'express';

@Controller('web')
export class WebController {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
  ) {}

  @Get('history/:groupId')
  async getHistory(
    @Param('groupId') groupId: string,
    @Res() res: express.Response,
  ) {
    // 撈取該群組所有資料，按時間倒序
    const transactions = await this.transactionRepo.find({
      where: { groupId },
      order: { transactionDate: 'DESC' },
      take: 100, // 先限制顯示最近 100 筆，避免網頁爆炸
    });

    // 簡單的 HTML 渲染 (Server-Side Rendering)
    const rows = transactions
      .map((t) => {
        const date = new Date(t.transactionDate).toLocaleDateString('zh-TW');
        const color = t.type === 'expense' ? 'red' : 'green';
        const typeSign = t.type === 'expense' ? '-' : '+';
        return `
        <tr>
          <td>${date}</td>
          <td>${t.item}</td>
          <td style="color: ${color}; font-weight: bold;">${typeSign}${t.amount}</td>
          <td>${t.payerName}</td>
          <td>${t.parentCategory}</td>
        </tr>
      `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>歷史帳務</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h2 { text-align: center; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f8f9fa; }
          tr:hover { background-color: #f1f1f1; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>📊 歷史帳務紀錄 (最近100筆)</h2>
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>項目</th>
                <th>金額</th>
                <th>付款人</th>
                <th>分類</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  }
}
