import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { LineService } from './line.service.js';
import { validateSignature } from '@line/bot-sdk';
import express from 'express';

@Controller('webhook')
export class LineController {
  constructor(private readonly lineService: LineService) {}

  @Post()
  @HttpCode(200)
  async callback(
    @Headers('x-line-signature') signature: string,
    @Req() req: express.Request,
  ) {
    const body = req.body;

    // if (
    //   !validateSignature(
    //     JSON.stringify(body),
    //     process.env.LINE_CHANNEL_SECRET!,
    //     signature,
    //   )
    // ) {
    //   throw new ForbiddenException('Invalid signature');
    // }
    await this.lineService.handleEvents(body.events);
    return 'OK';
  }
}
