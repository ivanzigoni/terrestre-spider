import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { OrigemAnuncio } from '../enums/origem-anuncio.enum.js';
import { StatusExecucao } from '../enums/status-execucao.enum.js';

@Entity('execucoes')
export class Execucao {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'enum', enum: OrigemAnuncio })
  declare origem: OrigemAnuncio;

  @Column({
    type: 'enum',
    enum: StatusExecucao,
    default: StatusExecucao.EM_ANDAMENTO,
  })
  declare status: StatusExecucao;

  @Column({ type: 'timestamptz', name: 'iniciada_em' })
  declare iniciadaEm: Date;

  @Column({ type: 'timestamptz', name: 'finalizada_em', nullable: true })
  declare finalizadaEm: Date | null;

  @Column({ type: 'int', name: 'requests_finalizados', nullable: true })
  declare requestsFinalizados: number | null;

  @Column({ type: 'int', name: 'requests_falhos', nullable: true })
  declare requestsFalhos: number | null;

  @Column({ type: 'text', name: 'mensagem_erro', nullable: true })
  declare mensagemErro: string | null;
}
