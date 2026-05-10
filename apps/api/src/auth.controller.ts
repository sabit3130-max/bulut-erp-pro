import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';
import { DataService } from './data.service';

class LoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly data: DataService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.data.login(body.email, body.password);
  }

  @Post('change-password')
  changePassword(@Headers('authorization') authorization: string | undefined, @Body() body: { password: string }) {
    return this.data.changePassword(authorization, body.password);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.data.forgotPassword(body.email);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.data.me(authorization);
  }
}
