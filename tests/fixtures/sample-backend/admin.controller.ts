import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, ThrottlerGuard)
export class AdminController {
  @Get('stats')
  getStats(@Req() req: any) {
    return { tier: req.subscriptionTier };
  }
}
