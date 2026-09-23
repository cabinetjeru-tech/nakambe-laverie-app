import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant de ressource : un format invalide répond 404, comme une ressource inexistante. */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) throw new NotFoundException('Ressource introuvable.');
    return value.toLowerCase();
  }
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
