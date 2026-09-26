import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FilePurpose } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MAX_UPLOAD_BYTES, StorageService } from './storage.service';

@ApiTags('Fichiers')
@Controller()
export class StorageController {
  constructor(private storage: StorageService) {}

  /** Envoi d'une photo (compressée par l'application avant envoi) ou d'un PDF de document livreur. */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('uploads/:purpose')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('purpose', new ParseEnumPipe(FilePurpose)) purpose: FilePurpose,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    return this.storage.save(user.id, purpose, file.buffer);
  }

  @Public()
  @Get('files/public/:key')
  async servePublic(@Param('key') key: string, @Res() res: Response) {
    const file = await this.storage.readPublic(key);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file.path);
  }

  @Public()
  @Get('files/:key')
  async serve(@Param('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const file = await this.storage.read(key, Number(exp), sig);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file.path);
  }
}
