import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { StatusExecucao } from '../enums/status-execucao.enum.js';

@Entity('execucoes_processamento')
export class ExecucaoProcessamento {
  @PrimaryGeneratedColumn()
  declare id: number;

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

  @Column({ type: 'int', name: 'capturas_processadas', nullable: true })
  declare capturasProcessadas: number | null;

  @Column({ type: 'int', name: 'capturas_com_erro', nullable: true })
  declare capturasComErro: number | null;

  @Column({ type: 'text', name: 'mensagem_erro', nullable: true })
  declare mensagemErro: string | null;
}
