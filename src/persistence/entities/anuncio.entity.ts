import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OrigemAnuncio } from '../enums/origem-anuncio.enum.js';

@Entity('anuncios')
@Index(['origem', 'codigoExterno'], { unique: true })
export class Anuncio {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'enum', enum: OrigemAnuncio })
  declare origem: OrigemAnuncio;

  @Column({ type: 'text', name: 'codigo_externo' })
  declare codigoExterno: string;

  @Column({ type: 'timestamptz', name: 'primeiro_visto_em' })
  declare primeiroVistoEm: Date;

  @Column({ type: 'timestamptz', name: 'ultimo_visto_em' })
  declare ultimoVistoEm: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  declare updatedAt: Date;
}
