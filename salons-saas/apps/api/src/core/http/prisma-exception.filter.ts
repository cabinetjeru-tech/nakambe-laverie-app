import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { TenantScopeViolation } from '../db/tenant-scope.extension';

/**
 * Traduit les erreurs de base en réponses HTTP sans divulguer de détail interne.
 * Une violation d'isolation (extension ou RLS) est journalisée comme incident de sécurité
 * et répond 404, comme une ressource inexistante.
 */
@Catch(Prisma.PrismaClientKnownRequestError, TenantScopeViolation)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(exception: Prisma.PrismaClientKnownRequestError | TenantScopeViolation, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof TenantScopeViolation) {
      this.logger.error(`SÉCURITÉ — violation d'isolation tenant : ${exception.message}`);
      return response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Ressource introuvable.' });
    }

    switch (exception.code) {
      case 'P2002':
        return response
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: 409, message: 'Cet élément existe déjà.' });
      case 'P2025':
        return response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Ressource introuvable.' });
      case 'P2003':
        return response
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: 409, message: 'Opération impossible : élément lié introuvable ou encore utilisé.' });
      default:
        this.logger.error(`Erreur base de données ${exception.code} : ${exception.message}`);
        return response
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ statusCode: 500, message: 'Erreur interne. Réessayez plus tard.' });
    }
  }
}
