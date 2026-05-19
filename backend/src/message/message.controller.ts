import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, HttpCode, HttpStatus, } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessageService } from './message.service.js';
import { SendMessageDto, EditMessageDto } from './message.dto.js';
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
    constructor(private readonly messageService: MessageService) { }
    @Get('conversations')
    getConversations(
    @Req()
    req: JwtRequest, 
    @Query('q')
    q?: string) {
        return this.messageService.getConversations(req.user.id, q);
    }
    @Get('thread/:partnerId')
    getThread(
    @Req()
    req: JwtRequest, 
    @Param('partnerId')
    partnerId: string, 
    @Query('since')
    since?: string) {
        const sinceDate = since ? new Date(since) : undefined;
        const sinceValid = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : undefined;
        return this.messageService.getThread(req.user.id, partnerId, sinceValid);
    }
    @Post()
    @HttpCode(HttpStatus.OK)
    sendMessage(
    @Req()
    req: JwtRequest, 
    @Body()
    dto: SendMessageDto) {
        return this.messageService.sendMessage(req.user.id, dto.recipientId, dto.body, dto.jobPostingId, dto.attachments ?? []);
    }
    @Patch(':id')
    @HttpCode(HttpStatus.OK)
    editMessage(
    @Req()
    req: JwtRequest, 
    @Param('id')
    id: string, 
    @Body()
    dto: EditMessageDto) {
        return this.messageService.editMessage(req.user.id, id, dto.body);
    }
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    deleteMessage(
    @Req()
    req: JwtRequest, 
    @Param('id')
    id: string) {
        return this.messageService.deleteMessage(req.user.id, id);
    }
}
