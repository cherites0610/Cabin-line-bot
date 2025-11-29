import { Module } from '@nestjs/common';
import { ApiController } from './api.controller.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AccountingModule, AuthModule],
  controllers: [ApiController],
})
export class ApiModule {}