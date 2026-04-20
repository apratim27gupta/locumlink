import {
    Controller,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    Req,
    BadRequestException,
    Body,
  } from '@nestjs/common';
  import { AuthGuard } from '@nestjs/passport';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { memoryStorage } from 'multer';
  import { GcsService } from '../gcs/gcs.service.js';
  
  interface JwtRequest {
    user: { id: string; email: string; role: string };
  }
  
  const ALLOWED = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  
  @Controller('upload')
  @UseGuards(AuthGuard('jwt'))
  export class UploadController {
    constructor(private readonly gcs: GcsService) {}
  
    @Post()
    @UseInterceptors(
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
      }),
    )
    async uploadFile(
      @Req() req: JwtRequest,
      @UploadedFile() file: Express.Multer.File,
      @Body('folder') folder?: string,
    ) {
      if (!file) throw new BadRequestException('No file uploaded');
      if (!ALLOWED.has(file.mimetype))
        throw new BadRequestException('Only PDF, JPG, PNG, DOC, DOCX allowed');
  
      const dest      = folder ?? `uploads/${req.user.id}`;
      const path      = await this.gcs.upload(file.buffer, dest, file.originalname, file.mimetype);
      const signedUrl = await this.gcs.signedUrl(path);
  
      return { path, signedUrl, fileName: file.originalname, size: file.size, mimeType: file.mimetype };
    }
  }