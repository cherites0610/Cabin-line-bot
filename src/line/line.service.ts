import {
  Client,
  MessageEvent,
  TextMessage,
} from '@line/bot-sdk'
import { Injectable, Logger } from '@nestjs/common'
import { Transaction } from 'src/accounting/entities/transaction.entity.js'
import { AccountingService } from '../accounting/accounting.service.js'
import { FlexMessageFactory } from './flex-message.factory.js'

@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name)
  private client: Client

  constructor(private readonly accountingService: AccountingService) {
    this.client = new Client({
      channelAccessToken: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN!,
      channelSecret: process.env.LINE_BOT_CHANNEL_SECRET!,
    })
  }

  async handleEvents(events: any[]): Promise<void> {
    this.logger.log(`收到 ${events.length} 個 LINE 事件`)

    for (const event of events) {
      try {
        if (event.type === 'message' && event.message.type === 'text') {
          await this.handleTextMessage(
            event as MessageEvent & { message: TextMessage },
          )
        }
      } catch (error) {
        this.logger.error(`處理事件時發生錯誤: ${error.message}`, error.stack)
      }
    }
  }

  private async handleTextMessage(
    event: MessageEvent & { message: TextMessage },
  ) {
    const { replyToken, source, message } = event
    const text = message.text.trim()
    const groupId = source.type === 'group' ? source.groupId : source.userId
    const userId = source.userId || 'unknown_user'

    if (!groupId) {
      this.logger.warn(`事件來源缺少 groupId 或 userId: ${JSON.stringify(source)}`)
      return
    }

    this.logger.debug(`處理群組 ${groupId} 的訊息: "${text}"`)

    const isCommandHandled = await this.dispatchCommand(
      text,
      groupId,
      userId,
      replyToken,
    )

    if (isCommandHandled) {
      this.logger.log(`成功執行指令: "${text}" (群組: ${groupId})`)
      return
    }

    if (!/\d/.test(text)) {
      return
    }

    this.logger.log(`進入 AI 記帳分析: "${text}" (群組: ${groupId})`)
    await this.handleAiAccounting(text, groupId, userId, replyToken)
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
    }

    if (text.startsWith('叫我')) {
      const nickname = text.replace('叫我', '').trim()
      if (nickname) {
        this.logger.log(`修改暱稱請求: "${nickname}" (用戶: ${userId})`)
        await this.handleSetNickname(groupId, userId, nickname, replyToken)
        return true
      }
    }

    if (text.startsWith('命名')) {
      const name = text.replace('命名', '').trim()
      if (name) {
        this.logger.log(`修改群組名稱請求: "${name}" (群組: ${groupId})`)
        await this.accountingService.setGroupName(groupId, name)
        await this.client.replyMessage(replyToken, {
          type: 'text',
          text: `🏷️ 群組名稱已更新為：「${name}」`
        })
        return true
      }
    }

    const handler = commandMap[text]
    if (handler) {
      await handler()
      return true
    }

    return false
  }

  private async handleSetNickname(
    groupId: string,
    userId: string,
    nickname: string,
    replyToken: string,
  ) {
    await this.accountingService.setNickname(groupId, userId, nickname)
    await this.client.replyMessage(replyToken, {
      type: 'text',
      text: `🆗 沒問題，以後你就是「${nickname}」了！`,
    })
  }

  private async handleAiAccounting(
    text: string,
    groupId: string,
    userId: string,
    replyToken: string,
  ) {
    try {
      const result = await this.accountingService.analyzeMessage(groupId, text)

      if (!result || !result.isAccounting || result.entries.length === 0) {
        this.logger.log(`AI 分析結果: 非記帳訊息或無有效條目`)
        return
      }

      const savedTransactions: Transaction[] = []

      for (const entry of result.entries) {
        const tx = await this.accountingService.saveTransaction(
          groupId,
          userId,
          entry,
        )
        savedTransactions.push(tx)
      }

      this.logger.log(`成功儲存 ${savedTransactions.length} 筆交易 (群組: ${groupId})`)
      await this.replyAccountingResult(replyToken, savedTransactions)
    } catch (error) {
      this.logger.error(`AI 記帳流程出錯: ${error.message}`)
      throw error
    }
  }

  private async replyAccountingResult(replyToken: string, transactions: Transaction[]) {
    const flexMessage = FlexMessageFactory.createAccountingSuccess(transactions)
    await this.client.replyMessage(replyToken, flexMessage)
  }

  private async handleDeleteLast(replyToken: string, groupId: string) {
    const deletedTx =
      await this.accountingService.deleteLastTransaction(groupId)

    if (!deletedTx) {
      this.logger.warn(`刪除失敗: 群組 ${groupId} 沒有可刪除的紀錄`)
      await this.client.replyMessage(replyToken, {
        type: 'text',
        text: '⚠️ 目前沒有任何記帳紀錄可以刪除。',
      })
      return
    }

    this.logger.log(`成功刪除交易: ID ${deletedTx.id} (群組: ${groupId})`)
    await this.client.replyMessage(replyToken, {
      type: 'text',
      text: `🗑️ 已刪除上一筆紀錄：\n\n${deletedTx.item} $${deletedTx.amount}\n(${deletedTx.payerName} 付款)`,
    })
  }

  private async sendDashboard(replyToken: string, groupId: string) {
    this.logger.log(`正在產生儀表板 (群組: ${groupId})`)
    const stats = await this.accountingService.getMonthlyStats(groupId)
    const recent = await this.accountingService.getRecentTransactions(groupId)
    const memberStats = await this.accountingService.getMemberMonthlyStats(groupId)

    const flexMessage = FlexMessageFactory.createDashboard(stats, recent, memberStats, groupId)
    await this.client.replyMessage(replyToken, flexMessage)
  }

  private async sendHelpMessage(replyToken: string) {
    this.logger.log(`發送說明訊息至 ${replyToken}`)
    const flexMessage = FlexMessageFactory.createHelp()
    await this.client.replyMessage(replyToken, flexMessage)
  }
}
