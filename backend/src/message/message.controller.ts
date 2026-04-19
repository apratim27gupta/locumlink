import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessageService } from './message.service.js';
import { SendMessageDto, EditMessageDto } from './message.dto.js';

interface JwtRequest {
  user: { id: string; email: string; role: string };
}

@Controller('messages')
@UseGuards(AuthGuard('jwt'))
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  /** List all conversations (one per partner, latest message first). */
  @Get('conversations')
  getConversations(@Req() req: JwtRequest) {
    return this.messageService.getConversations(req.user.id);
  }

  /**
   * Full thread with a specific partner.
   * Also marks all incoming messages as read.
   */
  @Get('thread/:partnerId')
  getThread(@Req() req: JwtRequest, @Param('partnerId') partnerId: string) {
    return this.messageService.getThread(req.user.id, partnerId);
  }

  /** Send a new message. */
  @Post()
  @HttpCode(HttpStatus.OK)
  sendMessage(@Req() req: JwtRequest, @Body() dto: SendMessageDto) {
    return this.messageService.sendMessage(
      req.user.id,
      dto.recipientId,
      dto.body,
      dto.jobPostingId,
    );
  }

  /** Edit your own message (body + sets editedAt). */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  editMessage(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messageService.editMessage(req.user.id, id, dto.body);
  }

  /**
   * Delete for everyone — sets deletedAt on the server so both parties
   * see "This message was deleted".
   * "Delete for me" requires no API call — it's filtered client-side.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteMessage(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.messageService.deleteMessage(req.user.id, id);
  }
}
