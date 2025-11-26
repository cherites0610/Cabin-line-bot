import { Module } from '@nestjs/common';
import { WebController } from './web.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../accounting/entities/transaction.entity.js';
@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  controllers: [WebController],
})
export class WebModule {}
