import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LineAuthGuard } from './line-auth.guard.js';
import { AccountingModule } from '../accounting/accounting.module.js';

@Module({
    imports: [forwardRef(() => AccountingModule)],
  providers: [AuthService, LineAuthGuard],
  exports: [AuthService, LineAuthGuard],
})
export class AuthModule {}