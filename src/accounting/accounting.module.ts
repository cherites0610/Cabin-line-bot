import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupConfig } from './entities/group-config.entity.js';
import { Transaction } from './entities/transaction.entity.js';
import { AccountingService } from './accounting.service.js';
import { GroupMember } from './entities/group-member.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([GroupConfig, Transaction, GroupMember])],
  exports: [AccountingService],
  providers: [AccountingService],
})
export class AccountingModule {}
