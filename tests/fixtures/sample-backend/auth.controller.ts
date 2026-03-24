import { Controller, Get, Post, Req, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: any) {
    return req.user;
  }

  @Post('login')
  login(@Body() body: any) {
    return { token: 'jwt' };
  }
}
