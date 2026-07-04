import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessageService } from './message.service.js';
import { SendMessageDto, EditMessageDto, BlockUserDto } from './message.dto.js';
interface JwtRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}
@Controller('messages')
@UseGuards(AuthGuard('jwt'))
export class MessageController {
  constructor(private readonly messageService: MessageService) {}
  @Get('conversations')
  getConversations(
    @Req()
    req: JwtRequest,
    @Query('q')
    q?: string,
  ) {
    return this.messageService.getConversations(req.user.id, q);
  }
  @Get('thread/:partnerId')
  getThread(
    @Req()
    req: JwtRequest,
    @Param('partnerId')
    partnerId: string,
    @Query()
    query: Record<string, unknown>,
  ) {
    const sinceRaw = query.since;
    const since =
      typeof sinceRaw === 'string' && sinceRaw
        ? new Date(sinceRaw)
        : undefined;
    const sinceValid =
      since && !Number.isNaN(since.getTime()) ? since : undefined;
    return this.messageService.getThread(req.user.id, partnerId, sinceValid, query);
  }
  @Post()
  @HttpCode(HttpStatus.OK)
  sendMessage(
    @Req()
    req: JwtRequest,
    @Body()
    dto: SendMessageDto,
  ) {
    return this.messageService.sendMessage(
      req.user.id,
      dto.recipientId,
      dto.body,
      dto.jobPostingId,
      dto.attachments ?? [],
    );
  }
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  editMessage(
    @Req()
    req: JwtRequest,
    @Param('id')
    id: string,
    @Body()
    dto: EditMessageDto,
  ) {
    return this.messageService.editMessage(req.user.id, id, dto.body);
  }
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteMessage(
    @Req()
    req: JwtRequest,
    @Param('id')
    id: string,
  ) {
    return this.messageService.deleteMessage(req.user.id, id);
  }

  @Get('blocks')
  listBlocks(@Req() req: JwtRequest) {
    return this.messageService.listBlockedUsers(req.user.id);
  }

  @Post('blocks')
  @HttpCode(HttpStatus.OK)
  blockUser(@Req() req: JwtRequest, @Body() dto: BlockUserDto) {
    return this.messageService.blockUser(req.user.id, dto.userId);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.OK)
  unblockUser(
    @Req() req: JwtRequest,
    @Param('userId') userId: string,
  ) {
    return this.messageService.unblockUser(req.user.id, userId);
  }
}
