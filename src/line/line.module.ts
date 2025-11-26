import { Module } from '@nestjs/common';
import { LineController } from './line.controller.js';
import { LineService } from './line.service.js';
import { AccountingModule } from '../accounting/accounting.module.js';

@Module({
  controllers: [LineController],
  imports: [AccountingModule],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
