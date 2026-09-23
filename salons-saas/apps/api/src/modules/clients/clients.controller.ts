import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { ClientsService } from './clients.service';
import { ClientQueryDto, ConsentDto, CreateClientDto, NoteDto, TechnicalNoteDto, UpdateClientDto } from './dto/client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @RequirePermissions('clients.read.basic')
  @Get()
  search(@CurrentUser() user: AuthUser, @Query() query: ClientQueryDto) {
    return this.clients.search(user, query);
  }

  @RequirePermissions('clients.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user, dto);
  }

  @RequirePermissions('clients.read')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.clients.get(user, id);
  }

  @RequirePermissions('clients.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(user, id, dto);
  }

  @RequirePermissions('clients.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  anonymize(@Param('id', ParseIdPipe) id: string) {
    return this.clients.anonymize(id);
  }

  @RequirePermissions('clients.read')
  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.clients.history(user, id);
  }

  @RequirePermissions('clients.manage')
  @Post(':id/notes')
  addNote(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: NoteDto) {
    return this.clients.addNote(user, id, dto);
  }

  @RequirePermissions('clients.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/notes/:noteId')
  deleteNote(@Param('id', ParseIdPipe) id: string, @Param('noteId', ParseIdPipe) noteId: string) {
    return this.clients.deleteNote(id, noteId);
  }

  @RequirePermissions('clients.technical.read')
  @Get(':id/technical-notes')
  technicalNotes(@Param('id', ParseIdPipe) id: string) {
    return this.clients.technicalNotes(id);
  }

  @RequirePermissions('clients.technical.manage')
  @Post(':id/technical-notes')
  addTechnicalNote(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: TechnicalNoteDto) {
    return this.clients.addTechnicalNote(user, id, dto);
  }

  @RequirePermissions('clients.manage')
  @Put(':id/consents')
  consent(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: ConsentDto) {
    return this.clients.recordConsent(user, id, dto);
  }
}
