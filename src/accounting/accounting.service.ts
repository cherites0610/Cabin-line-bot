import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { GroupSummary } from '../api/dto/user-profile.dto.js'
import {
  AccountingAnalysisResult,
  AccountingEntry,
} from './dto/accounting-result.dto.js'
import { GroupConfig } from './entities/group-config.entity.js'
import { GroupMember } from './entities/group-member.entity.js'
import { Transaction, TransactionType } from './entities/transaction.entity.js'

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);
  private genAI: GoogleGenerativeAI
  private modelName = 'gemini-2.0-flash';

  constructor(
    @InjectRepository(GroupConfig)
    private groupConfigRepo: Repository<GroupConfig>,
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(GroupMember)
    private groupMemberRepo: Repository<GroupMember>,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  }

  async setNickname(groupId: string, userId: string, nickname: string) {
    this.logger.log(`設定用戶暱稱: ${nickname} (用戶: ${userId}, 群組: ${groupId})`)
    let member = await this.groupMemberRepo.findOne({
      where: { groupId, userId },
    })
    if (member) {
      member.nickname = nickname
    } else {
      member = this.groupMemberRepo.create({ groupId, userId, nickname })
    }
    return await this.groupMemberRepo.save(member)
  }

  async getNickname(groupId: string, userId: string): Promise<string> {
    const member = await this.groupMemberRepo.findOne({
      where: { groupId, userId },
    })
    return member ? member.nickname : '我'
  }

  async analyzeMessage(groupId: string, message: string) {
    this.logger.debug(`開始 AI 分析訊息內容: "${message}"`)
    let config = await this.groupConfigRepo.findOne({ where: { groupId } })

    if (!config) {
      this.logger.log(`群組 ${groupId} 無配置，建立預設配置`)
      config = this.groupConfigRepo.create({ groupId })
      await this.groupConfigRepo.save(config)
    }

    const groupMembers = await this.groupMemberRepo.find({ where: { groupId } })
    const nickNames = groupMembers.map(m => m.nickname)

    const currentCategories = config.categories
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()]

    const schema: Schema = {
      description: '提取具備付款人識別的記帳資訊',
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
                description: "付款人姓名。若是發言者本人付款，請使用 'self'。",
              },
              type: {
                format: 'enum',
                type: SchemaType.STRING,
                enum: ['expense', 'income'],
              },
              date: { type: SchemaType.STRING, description: "交易日期 YYYY-MM-DD 格式。若未指定則預設為今天。" },
            },
            required: ['item', 'amount', 'parentCategory', 'subCategory', 'payer', 'type', 'date'],
          },
        },
      },
      required: ['isAccounting', 'entries'],
    }

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    })

    const prompt = `
      當前參考時間: ${todayStr} (今天是 ${dayOfWeek})。
      訊息內容: "${message}"
      可能出現的付款人: ${nickNames.join(", ")}。

      規則:
      1. 提取消費細節。
      2. 識別「誰」付款的。若暗示本人，使用 'self'。
      3. 父分類只能從以下選取: ${currentCategories.join(", ")}。
      4. 提取日期:
         - 若用戶說「昨天」，根據參考時間計算日期。
         - 若用戶說「上週五」，計算最近的過去週五。
         - 若給定具體日期(如 "11/05")，使用今年年份。
         - 若未提及日期，使用 ${todayStr}。
         - 格式必須為 YYYY-MM-DD。
      5. 若內容無關，isAccounting=false。
    `

    try {
      const result = await model.generateContent(prompt)
      const responseText = result.response.text()
      return JSON.parse(responseText) as AccountingAnalysisResult
    } catch (error) {
      this.logger.error(`Gemini 呼叫失敗: ${error.message}`, error.stack)
      return { isAccounting: false, entries: [] }
    }
  }

  async setGroupName(groupId: string, name: string) {
    this.logger.log(`設定群組名稱: ${name} (群組: ${groupId})`)
    let config = await this.groupConfigRepo.findOne({ where: { groupId } })
    if (!config) {
      config = this.groupConfigRepo.create({ groupId })
    }
    config.name = name
    return await this.groupConfigRepo.save(config)
  }

  async getGroupName(groupId: string): Promise<string> {
    const config = await this.groupConfigRepo.findOne({ where: { groupId } })
    return config?.name || '未命名群組'
  }

  async isUserInGroup(userId: string, groupId: string): Promise<boolean> {
    const isMember = await this.groupMemberRepo.count({ where: { userId, groupId } })
    if (isMember > 0) return true

    const hasTransaction = await this.transactionRepo.count({ where: { userId, groupId } })
    return hasTransaction > 0
  }

  async getUserGroups(userId: string): Promise<GroupSummary[]> {
    this.logger.debug(`查詢用戶 ${userId} 所屬的所有群組資訊`)
    const transactionGroups = await this.transactionRepo
      .createQueryBuilder('tx')
      .select('tx.groupId', 'groupId')
      .addSelect('MAX(tx.transactionDate)', 'lastDate')
      .where('tx.userId = :userId', { userId })
      .groupBy('tx.groupId')
      .getRawMany()

    const members = await this.groupMemberRepo.find({ where: { userId } })
    const memberMap = new Map<string, string>()
    members.forEach(m => memberMap.set(m.groupId, m.nickname))

    const allGroupIds = new Set([
      ...transactionGroups.map(t => t.groupId),
      ...members.map(m => m.groupId)
    ])

    const groupConfigs = await this.groupConfigRepo.findByIds(Array.from(allGroupIds))
    const nameMap = new Map<string, string>()
    groupConfigs.forEach(c => nameMap.set(c.groupId, c.name))

    const results: GroupSummary[] = transactionGroups.map(row => {
      return {
        groupId: row.groupId,
        groupName: nameMap.get(row.groupId) || '未命名群組',
        nickname: memberMap.get(row.groupId) || '我',
        lastTransactionDate: row.lastDate ? new Date(row.lastDate) : undefined,
      }
    })

    members.forEach(m => {
      const exists = results.find(r => r.groupId === m.groupId)
      if (!exists) {
        results.push({
          groupId: m.groupId,
          groupName: nameMap.get(m.groupId) || '未命名群組',
          nickname: m.nickname,
          lastTransactionDate: undefined,
        })
      }
    })

    return results.sort((a, b) => (b.lastTransactionDate?.getTime() || 0) - (a.lastTransactionDate?.getTime() || 0))
  }

  async saveTransaction(groupId: string, userId: string, entry: AccountingEntry): Promise<Transaction> {
    let finalPayerName = entry.payer

    if (finalPayerName === 'self' || !finalPayerName) {
      finalPayerName = await this.getNickname(groupId, userId)
    }

    const txDate = new Date(entry.date)
    txDate.setHours(12, 0, 0, 0)

    this.logger.log(`儲存交易紀錄: ${entry.item} $${entry.amount} (付款人: ${finalPayerName}, 群組: ${groupId})`)

    const transaction = this.transactionRepo.create({
      groupId,
      userId,
      payerName: finalPayerName,
      item: entry.item,
      amount: entry.amount,
      parentCategory: entry.parentCategory,
      subCategory: entry.subCategory,
      type: entry.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
      transactionDate: txDate,
    })

    return await this.transactionRepo.save(transaction)
  }

  async deleteLastTransaction(groupId: string): Promise<Transaction | null> {
    const lastTransaction = await this.transactionRepo.findOne({
      where: { groupId },
      order: { createdAt: 'DESC' },
    })

    if (!lastTransaction) {
      this.logger.warn(`刪除操作失敗: 群組 ${groupId} 無任何記帳紀錄`)
      return null
    }

    this.logger.log(`刪除最新交易: ID ${lastTransaction.id} (${lastTransaction.item})`)
    await this.transactionRepo.remove(lastTransaction)
    return lastTransaction
  }

  async changeLastTransaction(groupId: string, payerName: string) {
    const lastTransaction = await this.transactionRepo.findOne({
      where: { groupId },
      order: { createdAt: 'DESC' },
    })

    if (!lastTransaction) {
      this.logger.warn(`刪除操作失敗: 群組 ${groupId} 無任何記帳紀錄`)
      return null
    }

    lastTransaction.payerName = payerName
    await this.transactionRepo.save(lastTransaction)
    this.logger.log(`已經更新最新交易的付款人: ID ${lastTransaction.id} (${lastTransaction.item})`)
    return lastTransaction

  }

  async getMonthlyStats(groupId: string) {
    this.logger.debug(`查詢群組 ${groupId} 的當月總計統計`)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const transactions = await this.transactionRepo
      .createQueryBuilder('transaction')
      .where('transaction.groupId = :groupId', { groupId })
      .andWhere('transaction.transactionDate >= :start', {
        start: startOfMonth,
      })
      .andWhere('transaction.transactionDate <= :end', { end: endOfMonth })
      .getMany()

    let income = 0
    let expense = 0

    transactions.forEach((t) => {
      const amt = Number(t.amount)
      if (t.type === TransactionType.INCOME) {
        income += amt
      } else {
        expense += amt
      }
    })

    return { income, expense, balance: income - expense }
  }

  async getRecentTransactions(groupId: string, limit = 5) {
    return await this.transactionRepo.find({
      where: { groupId },
      order: { transactionDate: 'DESC' },
      take: limit,
    })
  }

  async getMemberMonthlyStats(groupId: string) {
    this.logger.debug(`查詢群組 ${groupId} 的各成員月支出統計`)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

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
      .getRawMany()

    return result.map((r) => ({
      payerName: r.payerName,
      total: Number(r.total),
    }))
  }
}
