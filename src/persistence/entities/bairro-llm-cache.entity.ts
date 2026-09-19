import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bairros_llm_cache')
export class BairroLlmCache {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text', name: 'valor_bruto_normalizado', unique: true })
  declare valorBrutoNormalizado: string;

  @Column({ type: 'text', name: 'bairro_inferido', nullable: true })
  declare bairroInferido: string | null;

  @Column({ type: 'double precision', nullable: true })
  declare confianca: number | null;

  @Column({ type: 'boolean' })
  declare resolvido: boolean;

  @Column({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;
}
