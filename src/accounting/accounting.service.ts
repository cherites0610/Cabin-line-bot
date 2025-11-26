import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import { GroupConfig } from './entities/group-config.entity.js';
import { Transaction, TransactionType } from './entities/transaction.entity.js';
import {
  AccountingAnalysisResult,
  AccountingEntry,
} from './dto/accounting-result.dto.js';
import { GroupMember } from './entities/group-member.entity.js';

@Injectable()
export class AccountingService {
  private genAI: GoogleGenerativeAI;
  private modelName = 'gemini-2.0-flash';

  constructor(
    @InjectRepository(GroupConfig)
    private groupConfigRepo: Repository<GroupConfig>,
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(GroupMember)
    private groupMemberRepo: Repository<GroupMember>,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async setNickname(groupId: string, userId: string, nickname: string) {
    let member = await this.groupMemberRepo.findOne({
      where: { groupId, userId },
    });
    if (member) {
      member.nickname = nickname;
    } else {
      member = this.groupMemberRepo.create({ groupId, userId, nickname });
    }
    return await this.groupMemberRepo.save(member);
  }

  async getNickname(groupId: string, userId: string): Promise<string> {
    const member = await this.groupMemberRepo.findOne({
      where: { groupId, userId },
    });
    return member ? member.nickname : '我';
  }

  async analyzeMessage(groupId: string, message: string) {
    let config = await this.groupConfigRepo.findOne({ where: { groupId } });

    if (!config) {
      config = this.groupConfigRepo.create({ groupId });
      await this.groupConfigRepo.save(config);
    }

    const currentCategories = config.categories;

    const schema: Schema = {
      description: 'Accounting extraction with payer identification',
      type: SchemaType.OBJECT,
      properties: {
        isAccounting: { type: SchemaType.BOOLEAN, nullable: false },
        entries: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              item: { type: SchemaType.STRING },
              amount: { type: SchemaType.NUMBER },
              parentCategory: {
                format: 'enum',
                type: SchemaType.STRING,
                enum: currentCategories,
              },
              subCategory: { type: SchemaType.STRING },
              payer: {
                type: SchemaType.STRING,
                description:
                  "Name of the person who paid. Use 'self' if the speaker paid.",
              },
              type: {
                format: 'enum',
                type: SchemaType.STRING,
                enum: ['expense', 'income'],
              },
            },
            required: [
              'item',
              'amount',
              'parentCategory',
              'subCategory',
              'payer',
              'type',
            ],
          },
        },
      },
      required: ['isAccounting', 'entries'],
    };

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const prompt = `
      Analyze the message: "${message}"
      Rules:
      1. Extract spending details.
      2. Identify WHO paid. If the text says "I paid" or implies the speaker, set payer='self'. If specific name used (e.g. "Mao paid"), set payer='Mao'.
      3. Map 'parentCategory' ONLY from: ${currentCategories.join(', ')}.
      4. If unrelated to accounting, isAccounting=false.
    `;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText) as AccountingAnalysisResult;
    } catch (error) {
      console.error('Gemini Error:', error);
      return { isAccounting: false, entries: [] };
    }
  }

  async saveTransaction(
    groupId: string,
    userId: string,
    entry: AccountingEntry,
  ): Promise<Transaction> {
    let finalPayerName = entry.payer;
    if (finalPayerName === 'self' || !finalPayerName) {
      finalPayerName = await this.getNickname(groupId, userId);
    }

    const transaction = this.transactionRepo.create({
      groupId,
      userId,
      payerName: finalPayerName,
      item: entry.item,
      amount: entry.amount,
      parentCategory: entry.parentCategory,
      subCategory: entry.subCategory,
      type:
        entry.type === 'income'
          ? TransactionType.INCOME
          : TransactionType.EXPENSE,
    });

    return await this.transactionRepo.save(transaction);
  }

  async deleteLastTransaction(groupId: string): Promise<Transaction | null> {
    // 1. 找出該群組「最新建立」的一筆資料
    const lastTransaction = await this.transactionRepo.findOne({
      where: { groupId },
      order: { createdAt: 'DESC' }, // 依照建立時間倒序
    });

    if (!lastTransaction) {
      return null;
    }

    // 2. 刪除它
    await this.transactionRepo.remove(lastTransaction);

    // 3. 回傳被刪除的資料 (讓前端顯示給使用者確認)
    return lastTransaction;
  }

  async getMonthlyStats(groupId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const transactions = await this.transactionRepo
      .createQueryBuilder('transaction')
      .where('transaction.groupId = :groupId', { groupId })
      .andWhere('transaction.transactionDate >= :start', {
        start: startOfMonth,
      })
      .andWhere('transaction.transactionDate <= :end', { end: endOfMonth })
      .getMany();

    let income = 0;
    let expense = 0;

    transactions.forEach((t) => {
      const amt = Number(t.amount);
      if (t.type === TransactionType.INCOME) {
        income += amt;
      } else {
        expense += amt;
      }
    });

    return { income, expense, balance: income - expense };
  }

  async getRecentTransactions(groupId: string, limit = 5) {
    return await this.transactionRepo.find({
      where: { groupId },
      order: { transactionDate: 'DESC' },
      take: limit,
    });
  }

  async getMemberMonthlyStats(groupId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const result = await this.transactionRepo
      .createQueryBuilder('transaction')
      .select('transaction.payerName', 'payerName')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('transaction.groupId = :groupId', { groupId })
      .andWhere('transaction.transactionDate >= :start', {
        start: startOfMonth,
      })
      .andWhere('transaction.transactionDate <= :end', { end: endOfMonth })
      .andWhere('transaction.type = :type', { type: TransactionType.EXPENSE })
      .groupBy('transaction.payerName')
      .orderBy('total', 'DESC')
      .getRawMany();

    return result.map((r) => ({
      payerName: r.payerName,
      total: Number(r.total),
    }));
  }
}
