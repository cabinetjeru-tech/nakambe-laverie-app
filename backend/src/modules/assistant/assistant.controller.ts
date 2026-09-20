import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AssistantService } from './assistant.service';
import { ChatRequestDto } from './dto/chat.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private assistantService: AssistantService) {}

  @Public()
  @Post('chat')
  chat(@Body() dto: ChatRequestDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    return this.assistantService.chat(dto.messages, ip);
  }
}
