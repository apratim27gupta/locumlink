import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { GcsService } from '../gcs/gcs.service.js';
interface JwtRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
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
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => {
          const ext =
            file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
          cb(null, `l2-upload-${randomUUID()}.${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @Req()
    req: JwtRequest,
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED.has(file.mimetype))
      throw new BadRequestException('Only PDF, JPG, PNG, DOC, DOCX allowed');
    const dest = `uploads/${req.user.id}`;
    const path = file.path
      ? await this.gcs.uploadFromPath(
          file.path,
          dest,
          file.originalname,
          file.mimetype,
        )
      : await this.gcs.upload(
          file.buffer,
          dest,
          file.originalname,
          file.mimetype,
        );
    const signedUrl = await this.gcs.signedUrl(path);
    return {
      path,
      signedUrl,
      fileName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }
}
